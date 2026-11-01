/**
 * تبدیل «متن خام OCR» به فیلدهای ساخت‌یافته — برای سرویس‌هایی که فقط متن
 * می‌دهند (مثل OCR.Space) و مدل بینایی نیستند.
 *
 * اصل: همین‌جا هم چیزی ساخته نمی‌شود. هر مقدار یا در متن دیده شده یا خالی
 * می‌ماند؛ هشدارهای پارسر هم به‌عنوان «یادداشت» برمی‌گردند تا کاربر بازبینی کند.
 */
import { parseInvoiceText } from './parser';
import type { AiFields, AiItem } from './aiEngine';

/** اطمینان پایهٔ متن خام OCR (سرویس‌های متنی عدد دقیق نمی‌دهند) */
const TEXT_BASE_CONFIDENCE = 72;

export function fieldsFromOcrText(text: string, defaultTaxRate = 9): AiFields {
  const parsed = parseInvoiceText(text, TEXT_BASE_CONFIDENCE, defaultTaxRate);

  const items: AiItem[] = parsed.items
    .filter((item) => item.title.trim().length > 0 && item.unitPrice > 0)
    .map((item) => ({
      name: item.title.trim(),
      qty: item.quantity || 1,
      unitPrice: item.unitPrice,
      total: Math.round((item.quantity || 1) * item.unitPrice),
      taxRate: item.taxRate,
    }));

  const fields: AiFields = { items };

  if (parsed.number) fields.number = parsed.number;
  if (parsed.date) fields.date = parsed.date;
  if (parsed.issuerName) fields.issuerName = parsed.issuerName;
  if (parsed.buyerName) fields.buyerName = parsed.buyerName;
  if (parsed.currency) fields.currency = parsed.currency;
  if (parsed.discountTotal > 0) fields.discount = parsed.discountTotal;
  if (parsed.taxTotal > 0) fields.tax = parsed.taxTotal;
  if (parsed.total > 0) fields.total = parsed.total;
  if (items.length) {
    fields.subtotal = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
  }

  // اطمینان: میانگین اطمینان فیلدهایی که واقعاً مقدار دارند (نه همهٔ ۸ فیلد)
  const found = Object.entries(parsed.fieldConfidence ?? {})
    .filter(([, value]) => typeof value === 'number' && value > 0);
  if (found.length) {
    const avg = found.reduce((sum, [, value]) => sum + value, 0) / found.length;
    fields.confidence = Math.max(20, Math.min(95, Math.round(avg)));
  }

  if (parsed.warnings?.length) fields.notes = parsed.warnings.slice(0, 4).join(' | ');

  return fields;
}
