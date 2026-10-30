/**
 * فهم معنایی متن فاکتور — مستقل از ستون‌بندی
 *
 * این ماژول روکش نازکی روی موتور اقلام (`items.ts`) و پایه‌های مشترک
 * (`primitives.ts`) است: نقش هر خط را می‌فهمد، از خطوط عنوان و اعداد،
 * ردیف کالا می‌سازد و جمع‌های سند را پیدا می‌کند. خروجی همین ماژول است که
 * در زبانه «اقلام» به کاربر نشان داده می‌شود.
 */
import { uid } from '../utils';
import type { ParsedInvoice } from './parser';
import { detectItems } from './items';
import type { ItemAnalysis } from './items';
import { amountsOf, summaryKind, assignRoles, readHeader, parseAmountToken, normalizeKeyword } from './primitives';
import type { VendorHint } from './primitives';

export { amountsOf, summaryKind, assignRoles, readHeader, parseAmountToken, normalizeKeyword };
export type { VendorHint };

export interface FreeItem {
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  /** مبلغی که OCR خوانده بود (اگر با محاسبه فرق داشته باشد) */
  readTotal?: number;
  needsReview?: boolean;
  note?: string;
}

export interface FreeTotals {
  payable?: number;
  preDiscount?: number;
  discount?: number;
  tax?: number;
  profit?: number;
  itemsTotal?: number;
}

export interface FreeAnalysis {
  items: FreeItem[];
  totals: FreeTotals;
  warnings: string[];
  /** عنوان ستون‌هایی که در سند پیدا شد */
  header: string[];
  /** تحلیل کامل موتور اقلام: نقش خطوط، اطمینان هر قلم، ردیف گمشده و کیفیت ستون‌ها */
  details?: ItemAnalysis;
}

/**
 * تحلیل متن خام فاکتور.
 * همیشه ساختار برمی‌گرداند؛ اگر چیزی پیدا نشد، فهرست خالی و هشدار می‌دهد.
 */
export function analyzeInvoiceText(raw: string, hint?: VendorHint): FreeAnalysis {
  const analysis = detectItems(raw, hint);
  const items: FreeItem[] = analysis.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    total: item.total,
    readTotal: item.readTotal,
    needsReview: item.needsReview,
    note: item.note,
  }));

  const totals: FreeTotals = { ...analysis.totals, itemsTotal: analysis.itemsTotal };
  const warnings = [...analysis.warnings];

  // بررسی هم‌خوانی جمع‌ها با ردیف‌ها
  if (totals.itemsTotal && totals.payable && Math.abs(totals.payable - totals.itemsTotal) / totals.payable > 0.05) {
    const diff = Math.abs(totals.payable - totals.itemsTotal);
    warnings.push(
      `جمع ردیف‌ها (${totals.itemsTotal.toLocaleString('en-US')}) با مبلغ پرداختی سند `
      + `(${totals.payable.toLocaleString('en-US')}) حدود ${diff.toLocaleString('en-US')} اختلاف دارد؛ یک یا چند ردیف ناقص خوانده شده است.`,
    );
  }

  // ردیف جاافتاده: انحراف جمع اقلام از مبلغ سند
  analysis.missing.forEach((row) => warnings.push(row.reason));

  const missing: string[] = [];
  if (!totals.payable && !totals.preDiscount) missing.push('مبلغ نهایی');
  if (!items.length) missing.push('اقلام');
  if (missing.length) {
    warnings.push(`این موارد در متن پیدا نشد: ${missing.join('، ')}. تصویر واضح‌تری امتحان کنید یا مقدار را دستی وارد کنید.`);
  }

  return { items, totals, warnings, header: analysis.header, details: analysis };
}

/** اطلاعات ادغام فهم نوشتاری در فاکتور */
export interface FreeMergeInfo {
  itemCount: number;
  usedTotals: boolean;
  /** جمع اقلام فهمیده‌شده از متن */
  itemsTotal: number;
}

export interface FreeMergeOptions {
  /** اقلام فعلی سند از جای مطمئن‌تری آمده‌اند (فهم ساختار جدول) و باید بمانند */
  keepExistingItems?: boolean;
}

/**
 * نتیجه فهم نوشتاری را روی فاکتور پارس‌شده می‌نشاند.
 *
 * فقط چیزهایی را پر می‌کند که سند از جای دیگری ندارد یا ضعیف‌تر دارد؛
 * هیچ مبلغی ساخته نمی‌شود. اگر ردیف‌ها با مبلغ نهایی نخوانند، هشدار
 * بازبینی اضافه می‌شود تا کاربر خودش تأیید کند.
 */
export function applyFreeTextAnalysis(
  parsed: ParsedInvoice,
  analysis: FreeAnalysis,
  options: FreeMergeOptions = {},
): ParsedInvoice & { free?: FreeMergeInfo } {
  // هشدارهای لایه حدسِ متنی وقتی اقلام از فهم نوشتاری آمده‌اند معنا ندارند
  const warnings = [...parsed.warnings].filter(
    (w) => !w.includes('ردیف‌های جدول اقلام') && !w.includes('اقلام را دستی کنترل کنید'),
  );
  let usedTotals = false;
  let items = parsed.items;

  if (!options.keepExistingItems && analysis.items.length && analysis.items.length >= (parsed.items.length || 0)) {
    items = analysis.items.map((item) => ({
      id: uid('itm_'),
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: 0,
    }));
  }

  let total = parsed.total;
  let taxTotal = parsed.taxTotal;
  let discountTotal = parsed.discountTotal;

  const { payable, tax, discount } = analysis.totals;
  if (payable && payable > 0) {
    total = Math.round(payable);
    usedTotals = true;
  }
  if (tax && tax > 0) {
    taxTotal = Math.round(tax);
    usedTotals = true;
  }
  // فقط تخفیفی که واقعاً از «سود/تخفیف» سند خوانده شده؛ جمع قبل از تخفیف تخفیف نیست
  if (discount && discount > 0 && discount < (payable ?? total ?? Infinity)) {
    discountTotal = Math.round(discount);
    usedTotals = true;
  }

  const itemsTotal = analysis.totals.itemsTotal ?? analysis.items.reduce((sum, item) => sum + item.total, 0);

  if (items.length && !total) {
    total = Math.round(itemsTotal + taxTotal - 0);
  }

  analysis.warnings.forEach((warning) => warnings.push(warning));
  if (analysis.items.some((item) => item.needsReview)) {
    warnings.push('بعضی ردیف‌ها با اطمینان کم خوانده شدند؛ مبلغشان را بازبینی کنید.');
  }

  const fieldConfidence = { ...parsed.fieldConfidence };
  if (items.length) fieldConfidence.items = Math.max(fieldConfidence.items ?? 0, 88);
  if (total) fieldConfidence.total = Math.max(fieldConfidence.total ?? 0, 86);

  return {
    ...parsed,
    items,
    total,
    taxTotal,
    discountTotal,
    fieldConfidence,
    warnings,
    free: { itemCount: items.length, usedTotals, itemsTotal },
  };
}
