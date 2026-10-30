/**
 * تبدیل اقلام ساخت‌یافته سرویس (فهم جدول) به اقلام فاکتور + اعتبارسنجی.
 *
 * این لایه همان چیزی است که باعث می‌شود شرح کالا، تعداد، قیمت واحد، تخفیف،
 * مالیات و مبلغ نهایی هر ردیف در جای درست خودشان بنشینند؛ مستقل از قالب فاکتور.
 */
import { uid } from '../utils';
import type { InvoiceItem } from '../types';
import type { ParsedInvoice } from './parser';
import type { ServerItem, ServerTotals } from './serverEngine';

export interface StructuredMergeInfo {
  itemCount: number;
  usedTotals: boolean;
}

function toItem(raw: ServerItem): InvoiceItem | null {
  const title = raw.title.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const quantity = Number.isFinite(raw.quantity) && raw.quantity > 0 ? raw.quantity : 1;
  const unitPrice = Number.isFinite(raw.unitPrice) && raw.unitPrice > 0 ? Math.round(raw.unitPrice) : 0;
  const discount = Number.isFinite(raw.discount) && raw.discount > 0 ? Math.round(raw.discount) : 0;
  const taxRate = Number.isFinite(raw.taxRate) && raw.taxRate > 0 && raw.taxRate <= 100
    ? Math.round(raw.taxRate * 100) / 100
    : 0;
  if (!unitPrice) return null;
  return { id: uid('itm_'), title, quantity, unitPrice, discount, taxRate };
}

/** اقلام خام سرویس را به اقلام معتبر فاکتور تبدیل می‌کند */
export function toInvoiceItems(raw: ServerItem[]): InvoiceItem[] {
  return raw.map(toItem).filter((it): it is InvoiceItem => it !== null);
}

/**
 * اقلام ساخت‌یافته را جایگزین اقلام حدسیِ متن می‌کند.
 * اگر ساختار جدول پیدا نشده باشد، نتیجه متن بدون تغییر می‌ماند.
 */
export function applyStructuredItems(
  parsed: ParsedInvoice,
  items: ServerItem[],
  totals?: ServerTotals,
): ParsedInvoice & { structured?: StructuredMergeInfo } {
  const mapped = toInvoiceItems(items);
  if (!mapped.length) return parsed;

  const warnings = [...parsed.warnings];
  let usedTotals = false;

  const itemsSum = mapped.reduce((sum, it) => sum + it.quantity * it.unitPrice - it.discount, 0);

  let taxTotal = parsed.taxTotal;
  let discountTotal = parsed.discountTotal;
  let total = parsed.total;

  if (totals?.discount && totals.discount > 0) {
    discountTotal = Math.round(totals.discount);
    usedTotals = true;
  }
  if (totals?.tax && totals.tax > 0) {
    taxTotal = Math.round(totals.tax);
    usedTotals = true;
  }
  if (totals?.total && totals.total > 0) {
    total = Math.round(totals.total);
    usedTotals = true;
  }

  // اگر مبلغ نهایی خوانده نشد، از اقلام محاسبه می‌شود
  if (!total) {
    const rate = parsed.items.length
      ? parsed.items.reduce((s, it) => s + it.taxRate, 0) / parsed.items.length
      : 0;
    total = Math.round(itemsSum + (taxTotal || (itemsSum * rate) / 100) - 0);
    usedTotals = false;
  }

  if (itemsSum > 0 && total > 0) {
    const expected = itemsSum + taxTotal;
    const drift = Math.abs(expected - total) / total;
    if (drift > 0.03) {
      warnings.push(
        `جمع ردیف‌ها با مبلغ نهایی سند اختلاف دارد (حدود ${Math.round(drift * 100)}٪)؛ مبالغ را بازبینی کنید.`,
      );
    }
  }

  const taxRates = mapped.filter((it) => it.taxRate > 0).map((it) => it.taxRate);
  if (!taxTotal && taxRates.length) {
    const rate = taxRates[0];
    taxTotal = Math.round((itemsSum * rate) / 100);
    warnings.push(`مالیات هر ردیف ${rate}٪ خوانده شد و مبلغ مالیات از جمع اقلام محاسبه شد.`);
  }

  const fieldConfidence = { ...parsed.fieldConfidence };
  fieldConfidence.items = Math.max(fieldConfidence.items ?? 0, 92);

  return {
    ...parsed,
    items: mapped,
    taxTotal,
    discountTotal,
    total,
    fieldConfidence,
    warnings,
    structured: { itemCount: mapped.length, usedTotals },
  };
}
