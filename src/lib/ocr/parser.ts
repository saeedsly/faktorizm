import { parseNumber, toLatinDigits, uid, clamp } from '../utils';
import { parsePersianTextDate, todayISO } from '../jalali';
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
}

function normalize(text: string): string {
  return text
    .replace(/\u0643/g, 'ک')
    .replace(/\u0649/g, 'ی')
    .replace(/\u064A/g, 'ی')
    .replace(/\u0621\u0647/g, 'ه')
    .replace(/[‏‌]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '');
}

function score(base: number, ocrConf: number, strong: boolean): number {
  return clamp(strong ? Math.min(97, Math.max(ocrConf, 60) + 12) : Math.max(30, ocrConf - 18), 20, 98);
}

const SUMMARY_WORDS = /(جمع|کل|قابل پرداخت|نهایی|مالیات|ارزش افزوده|تخفیف|مانده|پرداخت|balance|total|vat|tax|discount|sum|amount due)/i;
const META_WORDS = /(شماره|تاریخ|کد|نشانی|آدرس|تلفن|تماس|پست|کدپستی|شناسه|اقتصادی|ملی|پلاک|واحد|طبقه|www|\.com|\.ir|@|fax|tel|address|date|code|no\.)/i;

function findValue(lines: string[], patterns: RegExp[]): { value: string; strong: boolean } | null {
  for (const re of patterns) {
    for (const line of lines) {
      const m = line.match(re);
      if (m && m[1] && m[1].trim()) return { value: m[1].trim(), strong: true };
    }
  }
  return null;
}

function findAmount(lines: string[], patterns: RegExp[]): { amount: number; strong: boolean } | null {
  // الگوها به ترتیب اولویت بررسی می‌شوند؛ هر الگو روی همه خطوط امتحان می‌شود
  for (const re of patterns) {
    for (const line of lines) {
      if (re.test(line)) {
        const nums = toLatinDigits(line).match(/\d[\d,٬،.\s]*/g) || [];
        const amounts = nums.map((n) => parseNumber(n)).filter((n) => n > 0);
        if (amounts.length) return { amount: Math.max(...amounts), strong: true };
      }
    }
  }
  return null;
}

function extractItems(lines: string[], defaultTaxRate: number): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 3 || SUMMARY_WORDS.test(line) || META_WORDS.test(line)) continue;
    const latinLine = toLatinDigits(line);
    const numMatches = latinLine.match(/\d[\d,٬،]*(?:\.\d+)?/g) || [];
    const numbers = numMatches.map((n) => parseNumber(n)).filter((n) => n > 0);
    if (numbers.length < 1) continue;
    const title = line
      .replace(/[0-9۰-۹][0-9۰-۹,٬،.\s]*/g, ' ')
      .replace(/[×*\-–_:|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length < 2 || /^(ریال|تومان|عدد|واحد)$/.test(title)) continue;
    const firstPriceIdx = numbers.findIndex((n) => n >= 1000);
    if (firstPriceIdx === -1) continue;
    // تعداد، عدد کوچکِ بلافاصله قبل از اولین قیمت است
    const qty = firstPriceIdx > 0 && numbers[firstPriceIdx - 1] < 1000 ? numbers[firstPriceIdx - 1] : 1;
    const lineTotal = numbers[numbers.length - 1];
    const unitPrice = numbers.length >= 3 ? numbers[numbers.length - 2] : Math.round(lineTotal / (qty || 1));
    items.push({
      id: uid('itm_'),
      title: title.slice(0, 120),
      quantity: qty,
      unitPrice,
      discount: 0,
      taxRate: defaultTaxRate,
    });
    if (items.length >= 14) break;
  }
  return items;
}

export function parseInvoiceText(raw: string, ocrConfidence: number, defaultTaxRate: number): ParsedInvoice {
  const text = normalize(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const fc: FieldConfidence = {};

  // شماره فاکتور
  const numberHit = findValue(lines, [
    /شماره\s*(?:فاکتور|صورتحساب|رسید|قبض|سفارش)?\s*[:#\-]?\s*([A-Za-z0-9\-\/۰-۹۰-۹]{2,})/,
    /(?:invoice\s*(?:no|number)|serial\s*(?:no)?|inv)\s*[:#\-]?\s*([A-Za-z0-9\-\/]{2,})/i,
  ]);
  const number = toLatinDigits(numberHit?.value.replace(/[^\w\-\/۰-۹۰-۹]/g, '')).slice(0, 30) || '';
  fc.number = numberHit ? score(ocrConfidence, ocrConfidence, true) : score(ocrConfidence, ocrConfidence, false);

  // تاریخ
  let date: string | undefined;
  const dateLine = lines.find((l) => /تاریخ|date/i.test(l));
  if (dateLine) date = parsePersianTextDate(dateLine);
  if (!date) {
    for (const l of lines) {
      date = parsePersianTextDate(l);
      if (date) break;
    }
  }
  fc.date = date ? score(ocrConfidence, ocrConfidence, true) : score(ocrConfidence, ocrConfidence, false);

  // فروشنده / خریدار
  const issuerHit = findValue(lines, [
    /(?:فروشنده|صادرکننده|عرضه‌کننده|شرکت|فروشگاه|واحد صنفی|supplier|seller|vendor)\s*[:#]?\s*(.+)/,
  ]);
  const buyerHit = findValue(lines, [
    /(?:خریدار|مشتری|طرف\s*حساب|customer|buyer)\s*[:#]?\s*(.+)/,
  ]);
  const issuerName = issuerHit?.value.replace(META_WORDS, '').trim() || '';
  const buyerName = buyerHit?.value.replace(META_WORDS, '').trim() || '';
  fc.issuerName = issuerHit ? score(ocrConfidence, ocrConfidence, true) : score(ocrConfidence, ocrConfidence, false);
  fc.buyerName = buyerHit ? score(ocrConfidence, ocrConfidence, true) : score(ocrConfidence, ocrConfidence, false);

  // نوع سند و واحد پول
  const kind: InvoiceKind = /رسید|receipt/i.test(text) ? 'receipt' : /قبض|bill/i.test(text) ? 'bill' : 'invoice';
  const currency: 'IRR' | 'IRT' = /ریال|rial/i.test(text) ? 'IRR' : 'IRT';

  // مبالغ
  const totalHit = findAmount(lines, [
    // اولویت اول: مبلغ نهایی قابل پرداخت
    /قابل\s*پرداخت|مبلغ\s*نهایی|مبلغ\s*پرداختی|amount\s*due|total\s*amount|^total/i,
    // اولویت دوم: جمع کل
    /مبلغ\s*کل|جمع\s*کل|جمع\s*مبلغ|subtotal|^balance/i,
  ]);
  const taxHit = findAmount(lines, [/مالیات|ارزش\s*افزوده|vat|tax/i]);
  const discountHit = findAmount(lines, [/تخفیف|discount/i]);

  const allAmounts = lines.flatMap((l) =>
    (toLatinDigits(l).match(/\d[\d,٬،]*/g) || []).map((n) => parseNumber(n)).filter((n) => n >= 1000),
  );
  const fallbackTotal = allAmounts.length ? Math.max(...allAmounts) : 0;
  const total = totalHit?.amount ?? fallbackTotal;
  const taxTotal = taxHit?.amount ?? 0;
  const discountTotal = discountHit?.amount ?? 0;
  fc.total = totalHit ? score(ocrConfidence, ocrConfidence, true) : score(ocrConfidence, ocrConfidence, false);
  fc.taxTotal = taxHit ? score(ocrConfidence, ocrConfidence, true) : 40;
  fc.discountTotal = discountHit ? score(ocrConfidence, ocrConfidence, true) : 40;

  // اقلام
  let items = extractItems(lines, defaultTaxRate);
  if (!items.length && total > 0) {
    items = [{
      id: uid('itm_'),
      title: issuerName ? `اقلام ${issuerName}` : 'اقلام فاکتور',
      quantity: 1,
      unitPrice: total + discountTotal - taxTotal,
      discount: 0,
      taxRate: defaultTaxRate,
    }];
  }
  fc.items = items.length ? clamp(60 + items.length * 6 + Math.round(ocrConfidence / 4), 45, 96) : 35;

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
  };
}
