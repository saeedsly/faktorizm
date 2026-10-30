/**
 * خوانش «فقط ابری» — ساخت سند از خروجی مدل بینایی
 *
 * وقتی کاربر حالت «فقط ابری» را انتخاب می‌کند، دیگر OCR محلی اجرا نمی‌شود؛
 * مدل تصویر را می‌بیند و ردیف‌ها را مستقیم برمی‌گرداند. این ماژول آن خروجی را
 * به اقلام فاکتور، جمع‌ها و یک «متن خوانا» تبدیل می‌کند تا هم سند ساخته شود و
 * هم پنل «هوش اقلام» بتواند همان ردیف‌ها را برای بازبینی نشان دهد.
 */
import { uid } from '../utils';
import { parsePersianTextDate, todayISO } from '../jalali';
import type { InvoiceItem } from '../types';
import type { ParsedInvoice } from './parser';
import type { AiFields, AiItem } from './aiEngine';

export interface CloudBuildOptions {
  defaultTaxRate: number;
  currency?: 'IRR' | 'IRT';
  /** برچسب سرویس برای هشدارها */
  providerLabel: string;
  model?: string;
  /** مبالغ اعشاری قیمت واحد را گرد می‌کنیم */
  taxRateOfItem?: (item: AiItem) => number;
}

export interface CloudInvoice {
  parsed: ParsedInvoice;
  /** متن بازسازی‌شده برای نمایش و بازبینی خط‌به‌خط */
  transcript: string;
  /** جمع ردیف‌ها (بدون مالیات) */
  itemsTotal: number;
  warnings: string[];
}

function titleOf(item: AiItem): string {
  return item.name
    .replace(/[|¦]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** اقلام معتبر سند؛ ردیف بدون نام یا بدون مبلغ معنا ندارد */
export function itemsFromAi(fields: AiFields, options: CloudBuildOptions): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const item of fields.items) {
    const title = titleOf(item);
    if (!title) continue;
    const quantity = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1;
    const discount = Number.isFinite(item.discount) ? Math.max(0, Math.round(item.discount ?? 0)) : 0;
    let unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, Math.round(item.unitPrice)) : 0;
    let total = Number.isFinite(item.total) ? Math.max(0, Math.round(item.total)) : 0;
    if (!unitPrice && total) unitPrice = Math.round(total / quantity);
    if (!total && unitPrice) total = Math.round(unitPrice * quantity - discount);
    if (!unitPrice && !total) continue;
    const taxRate = item.taxRate ?? options.defaultTaxRate;
    items.push({
      id: uid('itm_'),
      title,
      quantity,
      unitPrice,
      discount,
      taxRate: Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100 ? taxRate : options.defaultTaxRate,
    });
  }
  return items;
}

/**
 * متن خوانا برای بازبینی خط‌به‌خط.
 * عمداً به همان شکل متن OCR نوشته می‌شود (نام کالا در یک خط، اعداد در خط بعد)
 * تا پنل «هوش اقلام» بتواند دقیقاً همان ردیف‌ها را از نو بسازد.
 */
export function buildAiTranscript(fields: AiFields, items: InvoiceItem[]): string {
  const lines: string[] = [];
  if (fields.issuerName) lines.push(fields.issuerName);
  if (fields.number) lines.push(`شماره فاکتور ${fields.number}`);
  if (fields.date) lines.push(`تاریخ ${fields.date}`);
  if (fields.buyerName) lines.push(`خریدار ${fields.buyerName}`);
  if (!items.length) return lines.join('\n');

  lines.push('شرح کالا تعداد قیمت واحد تخفیف مبلغ');
  for (const item of items) {
    lines.push(item.title);
    const numbers = [item.quantity, item.unitPrice, item.discount, Math.round(item.unitPrice * item.quantity - item.discount)]
      .filter((value, index) => index !== 2 || value > 0);
    lines.push(numbers.join(' '));
  }
  const itemsTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity - item.discount, 0);
  lines.push(`جمع اقلام ${itemsTotal}`);
  if (fields.discount) lines.push(`تخفیف کل ${fields.discount}`);
  if (fields.tax) lines.push(`مالیات ${fields.tax}`);
  if (fields.total) lines.push(`مبلغ قابل پرداخت ${fields.total}`);
  return lines.join('\n');
}

/** ساخت سند کامل از خروجی مدل ابری */
export function buildCloudInvoice(fields: AiFields, options: CloudBuildOptions): CloudInvoice {
  const items = itemsFromAi(fields, options);
  const warnings: string[] = [];

  const itemsTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity - item.discount, 0);
  const discountTotal = fields.discount && fields.discount > 0
    ? Math.round(fields.discount)
    : 0;
  const taxTotal = fields.tax && fields.tax > 0 ? Math.round(fields.tax) : 0;
  let total = fields.total && fields.total > 0 ? Math.round(fields.total) : 0;

  if (!total && items.length) {
    total = itemsTotal - discountTotal + taxTotal;
    warnings.push('مبلغ نهایی روی سند خوانده نشد و از جمع ردیف‌ها محاسبه شد؛ با اصل سند مقایسه کنید.');
  }
  if (total > 0 && items.length) {
    const expected = itemsTotal - discountTotal + taxTotal;
    const drift = Math.abs(expected - total) / Math.max(total, 1);
    if (drift > 0.02) {
      warnings.push(
        `جمع ردیف‌ها (${itemsTotal.toLocaleString('en-US')}) با مبلغ نهایی سند `
        + `(${total.toLocaleString('en-US')}) حدود ${Math.round(drift * 100)}٪ اختلاف دارد؛ ردیف‌ها را بازبینی کنید.`,
      );
    }
  }
  if (!items.length) {
    warnings.push('مدل ابری هیچ ردیف کالایی برنگرداند؛ اگر سند اقلام دارد، تصویر واضح‌تری بفرستید.');
  }
  if (fields.notes) warnings.push(`یادداشت مدل: ${fields.notes}`);

  const confidence = Math.min(99, Math.max(45, Math.round(fields.confidence ?? (items.length ? 92 : 60))));
  const date = (fields.date ? parsePersianTextDate(fields.date) : undefined) ?? todayISO();

  const fieldConfidence: Record<string, number> = {
    items: items.length ? confidence : 0,
    total: total ? confidence : 0,
    tax: taxTotal ? confidence : 0,
    discount: discountTotal ? confidence : 0,
  };
  if (fields.number) fieldConfidence.number = confidence;
  if (fields.date) fieldConfidence.date = confidence;
  if (fields.issuerName) fieldConfidence.issuerName = confidence;
  if (fields.buyerName) fieldConfidence.buyerName = confidence;

  warnings.unshift(
    `این سند با موتور ابری ${options.providerLabel}${options.model ? ` (${options.model})` : ''} خوانده شد؛ `
    + 'متن زیر بازسازی همان خروجی است و ردیف‌ها از خود مدل آمده‌اند.',
  );

  const parsed: ParsedInvoice = {
    number: fields.number ?? '',
    date,
    issuerName: fields.issuerName ?? '',
    buyerName: fields.buyerName ?? '',
    kind: 'invoice',
    currency: fields.currency ?? options.currency ?? 'IRT',
    items,
    discountTotal,
    taxTotal,
    total,
    fieldConfidence,
    category: 'خرید کالا',
    warnings,
  };

  return { parsed, transcript: buildAiTranscript(fields, items), itemsTotal, warnings };
}
