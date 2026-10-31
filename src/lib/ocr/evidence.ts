import { normalizeOcrText } from './correct';
import type { ParsedInvoice } from './parser';
import type { FieldEvidence } from '../types';

/**
 * «این عدد از کدام کادر خوانده شد؟»
 *
 * هر فیلد استخراج‌شدهٔ سند به خطی از متن OCR گره می‌خورد که مقدار از آن آمده
 * است؛ همراه با شمارهٔ خط، ناحیهٔ سند، اطمینان و وضعیت بازبینی. هیچ‌جا مقدار
 * تازه‌ای ساخته نمی‌شود: اگر مقداری در متن نبود، وضعیت `missing` می‌ماند.
 */

const LABELS: Record<string, string> = {
  number: 'شماره سند',
  date: 'تاریخ',
  issuerName: 'فروشنده',
  buyerName: 'خریدار',
  items: 'اقلام',
  total: 'مبلغ نهایی',
  taxTotal: 'مالیات',
  discountTotal: 'تخفیف',
};

const LABEL_RES: Record<string, RegExp> = {
  number: /(?:شماره|سریال|سری|پیگیری|فاکتور|صورتحساب|رسید|قبض|سفارش)/,
  date: /تاریخ|date/i,
  issuerName: /(?:فروشنده|صادرکننده|شرکت|فروشگاه|seller|vendor|supplier)/i,
  buyerName: /(?:خریدار|مشتری|طرف\s?حساب|customer|buyer)/i,
  total: /(?:قابل\s*پرداخت|مبلغ\s*نهایی|مبلغ\s*قابل|جمع\s*کل|total)/i,
  taxTotal: /(?:مالیات|ارزش\s*افزوده|vat|tax)/i,
  discountTotal: /(?:تخفیف|discount)/i,
  items: /(?:شرح|نام\s?کالا|ردیف|قیمت\s?واحد|مبلغ\s?کل|تعداد)/,
};

const TABLE_HEADER_RE = /شرح|نام\s?کالا|ردیف|قیمت\s?واحد|مبلغ\s?کل|فی\s|تعداد\s|واحد\s|سفارش کالا/i;
const SUMMARY_RE = /جمع|قابل\s*پرداخت|مالیات|ارزش\s*افزوده|عوارض|تخفیف|مانده|پرداختی|بالانس|total|vat|tax|discount|sub\s?total|balance/i;

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** فقط ارقام، با تبدیل فارسی/عربی به لاتین؛ برای تطبیق مقدار با خط مبدأ */
export function digitsOf(text: string): string {
  let out = '';
  for (const ch of text ?? '') {
    const fa = FA_DIGITS.indexOf(ch);
    const ar = AR_DIGITS.indexOf(ch);
    if (fa >= 0) out += String(fa);
    else if (ar >= 0) out += String(ar);
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}

interface Region {
  name: string;
  from: number;
  to: number;
}

function regionsOf(lines: string[]): Region[] {
  const header = lines.findIndex((l) => TABLE_HEADER_RE.test(l));
  const summaryStart = lines.findIndex((l, i) => SUMMARY_RE.test(l) && (header < 0 || i > header));
  const tableFrom = header < 0 ? lines.length : header + 1;
  const tableTo = summaryStart < 0 ? lines.length : summaryStart;
  return [
    { name: 'سربرگ', from: 0, to: tableFrom },
    { name: 'جدول اقلام', from: tableFrom, to: tableTo },
    { name: 'جمع‌ها و پاورقی', from: tableTo, to: lines.length },
  ];
}

function regionName(regions: Region[], index: number): string {
  const hit = regions.find((r) => index >= r.from && index < r.to);
  return hit?.name ?? 'پاورقی';
}

function friendly(field: string): string {
  return LABELS[field] ?? field;
}

/** خطی که مقدار این فیلد از آن گرفته شده است */
function findSourceLine(field: string, value: string, lines: string[]): number {
  const digits = digitsOf(value).replace(/^0+/, '');
  if (digits.length >= 2) {
    // ابتدا خود مقدار؛ اگر پیدا نشد، خط برچسب‌دار
    const byValue = lines.findIndex((l) => digitsOf(l).replace(/^0+/, '').includes(digits));
    if (byValue >= 0) return byValue;
  }
  const re = LABEL_RES[field];
  if (re) {
    const byLabel = lines.findIndex((l) => re.test(l));
    if (byLabel >= 0) return byLabel;
  }
  return -1;
}

function valueOf(parsed: ParsedInvoice, field: string): string {
  switch (field) {
    case 'number': return parsed.number ?? '';
    case 'date': return parsed.date ?? '';
    case 'issuerName': return parsed.issuerName ?? '';
    case 'buyerName': return parsed.buyerName ?? '';
    case 'items': return parsed.items?.length ? `${parsed.items.length} ردیف` : '';
    case 'total': return parsed.total ? String(parsed.total) : '';
    case 'taxTotal': return parsed.taxTotal ? String(parsed.taxTotal) : '';
    case 'discountTotal': return parsed.discountTotal ? String(parsed.discountTotal) : '';
    default: return '';
  }
}

const ORDER = ['number', 'date', 'issuerName', 'buyerName', 'items', 'total', 'taxTotal', 'discountTotal'];

/**
 * شواهد فیلد‌به‌فیلد برای کارت بازبینی.
 * @param parsed خروجی `parseInvoiceText`
 * @param raw متن خام OCR همان سند (`invoice.rawText`)
 */
export function buildFieldEvidence(parsed: ParsedInvoice, raw: string): FieldEvidence[] {
  const lines = normalizeOcrText(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const regions = regionsOf(lines);
  const out: FieldEvidence[] = [];

  for (const field of ORDER) {
    const value = valueOf(parsed, field).trim();
    const confidence = Math.round(parsed.fieldConfidence?.[field] ?? 0);
    const index = lines.length ? findSourceLine(field, value, lines) : -1;
    const source = index >= 0 ? lines[index] : '';
    const status: FieldEvidence['status'] = !value
      ? 'missing'
      : confidence > 0 && confidence < 70
        ? 'review'
        : 'ok';
    out.push({
      field,
      label: friendly(field),
      value,
      source: source.slice(0, 160),
      line: index >= 0 ? index + 1 : undefined,
      region: index >= 0 ? regionName(regions, index) : '—',
      confidence,
      status,
      hint: status === 'missing'
        ? 'در متن خوانده‌شده پیدا نشد؛ مقدار را دستی وارد کنید.'
        : status === 'review'
          ? 'اطمینان پایین است؛ با متن کادر مقایسه و در صورت نیاز اصلاح کنید.'
          : undefined,
    });
  }
  return out;
}

/** شمارش خلاصه برای نشان بالای کارت */
export function evidenceSummary(evidence: FieldEvidence[]): {
  total: number;
  ok: number;
  review: number;
  missing: number;
} {
  return {
    total: evidence.length,
    ok: evidence.filter((e) => e.status === 'ok').length,
    review: evidence.filter((e) => e.status === 'review').length,
    missing: evidence.filter((e) => e.status === 'missing').length,
  };
}
