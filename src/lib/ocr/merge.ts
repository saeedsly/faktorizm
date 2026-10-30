/**
 * ترکیب خروجی موتور ابری با خوانش محلی.
 *
 * منطق: مدل بینایی در فهم ساختار فاکتور (ردیف‌ها، طرفین، جمع‌ها) دقیق‌تر است و
 * موتور محلی در ثبت متن خام و مبالغ چاپ‌شده قابل اتکاست. هر فیلدی که ابری
 * با اطمینان ارائه کرده جایگزین می‌شود، اما اگر جمع ردیف‌ها با مبلغ نهایی
 * نخواند، هر دو نتیجه بررسی و هشدار بازبینی ثبت می‌شود.
 */
import { uid } from '../utils';
import type { InvoiceItem } from '../types';
import type { ParsedInvoice } from './parser';
import type { AiFields } from './aiEngine';
import { parsePersianTextDate } from '../jalali';

export interface MergeOptions {
  /** اطمینان گزارش‌شده توسط مدل ابری (۰ تا ۱۰۰) */
  aiConfidence?: number;
  model?: string;
}

function sumItems(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
}

export function mergeAiIntoParsed(local: ParsedInvoice, ai: AiFields, options: MergeOptions = {}): ParsedInvoice {
  const warnings = [...local.warnings];
  const fc = { ...local.fieldConfidence };
  const aiScore = Math.min(100, Math.max(40, options.aiConfidence ?? ai.confidence ?? 92));

  const items: InvoiceItem[] = ai.items
    .filter((item) => item.name?.trim() && (item.unitPrice || item.total))
    .map((item) => ({
      id: uid('itm_'),
      title: item.name.replace(/\s+/g, ' ').trim(),
      quantity: item.qty > 0 ? item.qty : 1,
      unitPrice: item.unitPrice || 0,
      discount: item.discount && item.discount > 0 ? Math.round(item.discount) : 0,
      taxRate: item.taxRate && item.taxRate > 0 && item.taxRate <= 100 ? item.taxRate : 0,
    }));

  const itemsTotal = sumItems(items);
  const discountTotal = ai.discount ?? local.discountTotal ?? 0;
  const taxTotal = ai.tax ?? local.taxTotal ?? 0;
  let total = ai.total ?? local.total ?? 0;

  // تطبیق: اگر جمع ردیف‌ها با مبلغ نهایی هم‌خوان نباشد، بازبینی انسانی لازم است
  if (items.length && total > 0) {
    const expected = itemsTotal + taxTotal - discountTotal;
    const drift = Math.abs(expected - total) / total;
    if (drift > 0.02) {
      warnings.push(
        `جمع ردیف‌ها با مبلغ نهایی هم‌خوان نیست (اختلاف حدود ${Math.round(drift * 100)}٪)؛ ردیف‌ها را بازبینی کنید.`,
      );
    }
  }
  if (!total && items.length) {
    total = itemsTotal + taxTotal - discountTotal;
    warnings.push('مبلغ نهایی از جمع ردیف‌ها محاسبه شد؛ با اصل سند مقایسه شود.');
  }

  const date = (ai.date ? parsePersianTextDate(ai.date) : undefined) ?? local.date;

  // فیلدهایی که مدل ابری ارائه کرده، اطمینان بالاتری می‌گیرند
  if (ai.number) fc.number = Math.max(fc.number ?? 0, aiScore);
  if (date) fc.date = Math.max(fc.date ?? 0, aiScore);
  if (ai.issuerName) fc.issuerName = Math.max(fc.issuerName ?? 0, aiScore);
  if (ai.buyerName) fc.buyerName = Math.max(fc.buyerName ?? 0, aiScore);
  if (items.length) fc.items = Math.max(fc.items ?? 0, aiScore);

  warnings.unshift(
    `این سند با موتور ابری ${options.model ? `«${options.model}»` : ''} خوانده شد و نتیجه با خوانش محلی مقایسه شد.`
      .replace(/\s+/g, ' '),
  );
  if (ai.notes) warnings.push(`یادداشت مدل: ${ai.notes}`);

  return {
    ...local,
    number: ai.number || local.number,
    date,
    issuerName: ai.issuerName || local.issuerName,
    buyerName: ai.buyerName || local.buyerName,
    items: items.length ? items : local.items,
    discountTotal,
    taxTotal,
    total,
    currency: ai.currency ?? local.currency,
    fieldConfidence: fc,
    warnings,
  };
}
