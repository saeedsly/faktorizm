import { uid, clamp } from '../utils';
import { parsePersianTextDate, todayISO } from '../jalali';
import {
  normalizeOcrText, extractNumberTokens, PERSIAN_DATE_RE, extractCode,
} from './correct';
import type { InvoiceItem, InvoiceKind, FieldConfidence } from '../types';

export interface ParsedInvoice {
  number: string;
  date?: string;
  issuerName: string;
  buyerName: string;
  kind: InvoiceKind;
  currency: 'IRR' | 'IRT';
  items: InvoiceItem[];
  discountTotal: number;
  taxTotal: number;
  total: number;
  fieldConfidence: FieldConfidence;
  category: string;
  /** هشدارهای دستیار هوشمند برای بازبینی انسانی */
  warnings: string[];
}

const SUMMARY_RE = /جمع|قابل\s*پرداخت|مالیات|ارزش\s*افزوده|عوارض|تخفیف|مانده|پرداختی|بالانس|total|vat|tax|discount|sub\s?total|balance|amount/i;
const META_RE = /تلفن|فکس|کد\s?پستی|کد\s?اقتصادی|کد\s?ملی|شناسه\s?ملی|نشانی|آدرس|پلاک|واحد\s?\d|طبقه|www|\.com|\.ir|@|fax|tel|address|postal/i;
const TABLE_HEADER_RE = /شرح|نام\s?کالا|ردیف|کالا\s?و\s?خدمات|قیمت\s?واحد|مبلغ\s?کل|فی\s|تعداد\s|واحد\s|سفارش کالا/i;

const LABEL_NUMBER = /(?:شماره|سریال|سری|پیگیری|فاکتور|صورتحساب|رسید|قبض|سفارش)\s*(?:فاکتور|صورتحساب|رسید|قبض|سفارش)?\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{1,28})/i;
const LABEL_ISSUER = /(?:فروشنده|صادرکننده|عرضه\s?کننده|صادر\s?کننده|شرکت|فروشگاه|واحد\s?صنفی|موسسه|کارخانه|supplier|seller|vendor)\s*[:#]?\s*(.+)/i;
const LABEL_BUYER = /(?:خریدار|مشتری|طرف\s?حساب|customer|buyer)\s*[:#]?\s*(.+)/i;

const PAYABLE_RE = /قابل\s*پرداخت|مبلغ\s*(?:نهایی|پرداختی|کل)|مبلغ\s*قابل|amount\s*due|total\s*amount|^total/i;
const SUBTOTAL_RE = /جمع\s*(?:کل|مبلغ|فاکتور)|جمع\s*پایه|sub\s?total|^balance/i;
const TAX_RE = /مالیات|ارزش\s*افزوده|عوارض|vat|tax/i;
const DISCOUNT_RE = /تخفیف|discount/i;

function lineAmounts(line: string): number[] {
  return extractNumberTokens(line)
    .filter((t) => !t.percent && t.value >= 100)
    .map((t) => t.value);
}

/** پیدا کردن مبلغ روی خطوط لنگر‌دار با ترجیح انتهای سند */
function findAnchoredAmount(lines: string[], re: RegExp): { amount: number; line: string } | null {
  const hits: Array<{ amount: number; line: string; index: number }> = [];
  lines.forEach((line, index) => {
    if (re.test(line)) {
      const amounts = lineAmounts(line);
      if (amounts.length) hits.push({ amount: amounts[amounts.length - 1], line, index });
    }
  });
  if (!hits.length) return null;
  // خطوط پایانی سند محتمل‌ترین محل جمع‌ها هستند
  const lower = hits.filter((h) => h.index >= lines.length * 0.45);
  const pick = lower.length ? lower[lower.length - 1] : hits[hits.length - 1];
  return { amount: pick.amount, line: pick.line };
}

function extractNumber(lines: string[]): { value: string; strong: boolean } {
  for (const line of lines) {
    const m = line.match(LABEL_NUMBER);
    if (m && m[1]) {
      const candidate = m[1].trim();
      // تاریخ نباید به‌جای شماره فاکتور بنشیند
      if (PERSIAN_DATE_RE.test(candidate)) continue;
      if (/^\d{4}$/.test(candidate)) continue;
      return { value: candidate.slice(0, 30), strong: true };
    }
  }
  return { value: '', strong: false };
}

function extractName(lines: string[], re: RegExp, metaRe: RegExp): { value: string; strong: boolean } {
  for (const line of lines) {
    const m = line.match(re);
    if (m && m[1]) {
      const name = m[1]
        .replace(metaRe, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.length >= 2) return { value: name.slice(0, 120), strong: true };
    }
  }
  return { value: '', strong: false };
}

interface ItemGuess {
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

function cleanTitle(line: string): string {
  return line
    .replace(/[0-9][0-9,.\s]*/g, ' ')
    .replace(/\b[OIlSBZGo]\b/g, ' ') // حروف تکی هم‌شکل رقم که جای عدد نشسته‌اند
    .replace(/[×*\-–_:|()]+/g, ' ')
    .replace(/\b(ریال|تومان|تومن|عدد|عدد،|واحد|کیلو|گرم|لیتر|بسته|جعبه|کارتن|دستگاه|متر|حلقه|شاخه|سرویس|هزار)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractItems(lines: string[], defaultTaxRate: number, warnings: string[]): InvoiceItem[] {
  // محدوده جدول: از خط هدر تا اولین خط جمع
  let start = lines.findIndex((l) => TABLE_HEADER_RE.test(l));
  if (start === -1) start = Math.min(2, Math.floor(lines.length * 0.2));
  const region: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (SUMMARY_RE.test(lines[i])) break;
    region.push(lines[i]);
  }

  const guesses: ItemGuess[] = [];
  for (const raw of region) {
    const line = raw.trim();
    if (line.length < 3 || META_RE.test(line) || TABLE_HEADER_RE.test(line)) continue;
    const tokens = extractNumberTokens(line).filter((t) => !t.percent);
    if (tokens.length < 2) continue;
    const values = tokens.map((t) => t.value);
    const title = cleanTitle(line);
    if (title.length < 2) continue;

    const lineTotal = values[values.length - 1];
    const unitFromLine = values.length >= 3 ? values[values.length - 2] : lineTotal;

    // انتخاب تعداد: کاندیداها همه اعدادِ قبل از قیمت واحد هستند (عددهای داخل شرح کالا
    // مثل «لپ‌تاپ ۱۵ اینچی» هم اینجا وارد می‌شوند)؛ کاندیدایی که ضربش با قیمت واحد
    // جمع سطر را بسازد برنده است.
    let quantity = 1;
    if (values.length >= 3 && unitFromLine > 0 && lineTotal > 0) {
      const candidates = values.slice(0, -2).filter((v) => Number.isInteger(v) && v > 0 && v < 10000);
      let best: { q: number; diff: number } | null = null;
      for (const q of candidates) {
        const diff = Math.abs(q * unitFromLine - lineTotal) / lineTotal;
        if (!best || diff < best.diff) best = { q, diff };
      }
      if (best && best.diff <= 0.05) quantity = best.q;
    }

    if (unitFromLine <= 0) continue;
    const expected = quantity * unitFromLine;
    if (quantity > 1 && Math.abs(expected - lineTotal) / Math.max(lineTotal, 1) > 0.05) {
      // تفکیک قابل اتکا نیست؛ قیمت واحد را از روی جمع سطر و تعداد اصلاح کن
      guesses.push({ title: title.slice(0, 120), quantity, unitPrice: Math.round(lineTotal / quantity), lineTotal });
    } else {
      guesses.push({ title: title.slice(0, 120), quantity, unitPrice: unitFromLine, lineTotal: Math.max(lineTotal, expected) });
    }
    if (guesses.length >= 20) break;
  }

  if (!guesses.length) warnings.push('ردیف‌های جدول اقلام با اطمینان کافی خوانده نشد؛ اقلام را دستی کنترل کنید.');

  return guesses.map((g) => ({
    id: uid('itm_'),
    title: g.title,
    quantity: g.quantity,
    unitPrice: g.unitPrice,
    discount: 0,
    taxRate: defaultTaxRate,
  }));
}

function confidence(strong: boolean, ocr: number, floor = 35): number {
  return clamp(strong ? Math.min(97, Math.max(ocr, 55) + 10) : Math.max(floor, ocr - 20), 20, 98);
}

export function parseInvoiceText(raw: string, ocrConfidence: number, defaultTaxRate: number): ParsedInvoice {
  const text = normalizeOcrText(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const warnings: string[] = [];
  const fc: FieldConfidence = {};

  if (ocrConfidence < 55) {
    warnings.push(`اطمینان کلی موتور OCR پایین است (${ocrConfidence}٪)؛ اسکن واضح‌تر یا کنترل دستی توصیه می‌شود.`);
  }

  // شماره و تاریخ
  const numberHit = extractNumber(lines);
  const number = numberHit.value;
  fc.number = confidence(numberHit.strong, ocrConfidence, 40);
  if (!number) warnings.push('شماره فاکتور تشخیص داده نشد.');

  let date: string | undefined;
  const dateLine = lines.find((l) => /تاریخ|date/i.test(l));
  if (dateLine) date = parsePersianTextDate(dateLine);
  if (!date) {
    for (const l of lines) {
      if (PERSIAN_DATE_RE.test(l)) { date = parsePersianTextDate(l); if (date) break; }
    }
  }
  fc.date = confidence(!!date, ocrConfidence, 40);
  if (!date) warnings.push('تاریخ سند خوانده نشد.');

  // طرفین
  const issuerHit = extractName(lines, LABEL_ISSUER, META_RE);
  const buyerHit = extractName(lines, LABEL_BUYER, META_RE);
  const issuerName = issuerHit.value;
  const buyerName = buyerHit.value;
  fc.issuerName = confidence(issuerHit.strong, ocrConfidence);
  fc.buyerName = confidence(buyerHit.strong, ocrConfidence);
  if (!issuerName) warnings.push('نام فروشنده با الگوی استاندارد پیدا نشد.');

  // نوع سند و واحد پول
  const head = lines.slice(0, 6).join(' ');
  const kind: InvoiceKind = /رسید|receipt/i.test(head) ? 'receipt' : /قبض|بهای\s|bill/i.test(head) ? 'bill' : 'invoice';
  const currency: 'IRR' | 'IRT' = /ریال|rial/i.test(text) ? 'IRR' : 'IRT';

  // مبالغ لنگرمحور
  const payable = findAnchoredAmount(lines, PAYABLE_RE);
  const subtotal = findAnchoredAmount(lines, SUBTOTAL_RE);
  const taxHit = findAnchoredAmount(lines, TAX_RE);
  const discountHit = findAnchoredAmount(lines, DISCOUNT_RE);

  let total = payable?.amount ?? 0;
  let taxTotal = taxHit?.amount ?? 0;
  const discountTotal = discountHit?.amount ?? 0;

  fc.total = confidence(!!payable, ocrConfidence);
  fc.taxTotal = taxHit ? confidence(true, ocrConfidence) : 40;
  fc.discountTotal = discountHit ? confidence(true, ocrConfidence) : 45;

  // اقلام
  const items = extractItems(lines, defaultTaxRate, warnings);
  const itemsSum = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  fc.items = items.length ? clamp(58 + items.length * 5 + Math.round(ocrConfidence / 4), 45, 96) : 35;

  // اعتبارسنجی متقاطع: مالیات
  if (!taxHit && itemsSum > 0 && defaultTaxRate > 0) {
    taxTotal = Math.round((itemsSum * defaultTaxRate) / 100);
    warnings.push(`مالیات بر ارزش افزوده در سند خوانده نشد؛ با نرخ ${defaultTaxRate}٪ توسط دستیار محاسبه شد.`);
  }

  // اعتبارسنجی متقاطع: جمع کل
  if (!total) {
    total = itemsSum + taxTotal - discountTotal;
    if (total > 0) warnings.push('مبلغ قابل پرداخت خوانده نشد؛ از مجموع اقلام و مالیات محاسبه شد.');
  } else if (itemsSum > 0) {
    const expected = itemsSum + taxTotal - discountTotal;
    const diff = Math.abs(total - expected) / Math.max(total, 1);
    if (diff > 0.05) {
      warnings.push(`جمع کل (${total.toLocaleString('en-US')}) با مجموع اقلام (${expected.toLocaleString('en-US')}) حدود ${Math.round(diff * 100)}٪ اختلاف دارد.`);
    }
  }
  if (subtotal && payable && subtotal.amount > payable.amount) {
    warnings.push('جمع کل بزرگ‌تر از مبلغ قابل پرداخت ثبت شده؛ ترتیب مبالغ را بررسی کنید.');
  }
  if (total === 0) warnings.push('هیچ مبلغی از سند استخراج نشد.');

  // کدهای کمکی برای کنترل انسانی (فقط هشدار، بدون ذخیره اجباری)
  for (const l of lines) {
    if (/کد\s?اقتصادی/.test(l)) {
      const code = extractCode(l.replace(/.*کد\s?اقتصادی[:#\-]?/i, ''));
      if (code) warnings.push(`کد اقتصادی فروشنده: ${code}`);
      break;
    }
  }

  return {
    number,
    date,
    issuerName,
    buyerName,
    kind,
    currency,
    items,
    discountTotal,
    taxTotal,
    total,
    fieldConfidence: fc,
    category: kind === 'bill' ? 'قبوض و خدمات' : 'خرید کالا',
    warnings,
  };
}

export function emptyParsedInvoice(defaultTaxRate: number): ParsedInvoice {
  return {
    number: '',
    date: todayISO(),
    issuerName: '',
    buyerName: '',
    kind: 'invoice',
    currency: 'IRT',
    items: [{ id: uid('itm_'), title: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: defaultTaxRate }],
    discountTotal: 0,
    taxTotal: 0,
    total: 0,
    fieldConfidence: {},
    category: 'خرید کالا',
    warnings: [],
  };
}
