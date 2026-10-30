/**
 * خروجی‌های سبک برای اشتراک‌گذاری و پشتیبان‌گیری
 *
 * علاوه بر اکسل، کاربر به سه قالب دیگر نیاز دارد:
 *  • متن خوانا برای فرستادن در واتساپ/تلگرام یا خواندن روی گوشی،
 *  • JSON ساخت‌یافته برای پشتیبان‌گیری و انتقال به سیستم دیگر،
 *  • بسته پشتیبان کامل که با یک فایل همه‌چیز را برمی‌گرداند.
 */
import { toJalali } from '../jalali';
import { formatMoney, toFaDigits } from '../utils';
import { itemNet, itemTax, payableOf } from '../invoices';
import type { Contact, Invoice, Product } from '../types';

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** متن ساده و خوانای یک سند برای پیام‌رسان */
export function invoiceToText(inv: Invoice): string {
  const lines: string[] = [];
  lines.push(`سند ${inv.number}${inv.issuerName ? ` — ${inv.issuerName}` : ''}`);
  lines.push(`تاریخ: ${toJalali(inv.date)}`);
  if (inv.costCenter) lines.push(`مرکز هزینه: ${inv.costCenter}`);
  lines.push('—'.repeat(22));
  inv.items.forEach((item, i) => {
    const net = itemNet(item) + itemTax(item);
    lines.push(`${toFaDigits(i + 1)}. ${item.title || 'کالای بی‌نام'}`);
    lines.push(`   ${toFaDigits(item.quantity)} × ${formatMoney(item.unitPrice, inv.currency)}${item.discount ? ` − تخفیف ${formatMoney(item.discount, inv.currency)}` : ''} = ${formatMoney(net, inv.currency)}`);
  });
  lines.push('—'.repeat(22));
  lines.push(`مبلغ نهایی: ${formatMoney(payableOf(inv), inv.currency)}`);
  if (inv.documentTotal && Math.abs(inv.documentTotal - inv.total) > 1000) {
    lines.push(`جمع ردیف‌ها: ${formatMoney(inv.total, inv.currency)}`);
  }
  if (inv.taxTotal) lines.push(`مالیات: ${formatMoney(inv.taxTotal, inv.currency)}`);
  return lines.join('\n');
}

/** اشتراک‌گذاری متن با Web Share و بازگشت به کپی کلیپ‌بورد */
export async function shareInvoiceText(inv: Invoice): Promise<'shared' | 'copied' | 'failed'> {
  const text = invoiceToText(inv);
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: `سند ${inv.number}`, text });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function exportInvoiceText(inv: Invoice): void {
  download(`faktorizm-${inv.number}.txt`, invoiceToText(inv), 'text/plain;charset=utf-8');
}

/** JSON ساخت‌یافته با مبالغ عددی و تاریخ استاندارد */
export function invoiceToJson(inv: Invoice): Record<string, unknown> {
  return {
    id: inv.id,
    number: inv.number,
    issuerName: inv.issuerName,
    buyerName: inv.buyerName,
    date: inv.date,
    dateJalali: toJalali(inv.date),
    currency: inv.currency,
    costCenter: inv.costCenter ?? null,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    total: payableOf(inv),
    itemsSum: inv.total,
    tax: inv.taxTotal,
    discount: inv.discountTotal,
    category: inv.category,
    tags: inv.tags,
    note: inv.note,
    ocrConfidence: inv.ocrConfidence,
    warnings: inv.ocrWarnings ?? [],
    items: inv.items.map((it) => ({
      title: it.title,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      taxRate: it.taxRate,
      net: itemNet(it),
      tax: itemTax(it),
      total: itemNet(it) + itemTax(it),
    })),
  };
}

export function exportInvoicesJson(invoices: Invoice[], fileName = 'faktorizm-invoices'): void {
  const payload = {
    app: 'faktorizm',
    version: 2,
    exportedAt: new Date().toISOString(),
    count: invoices.length,
    invoices: invoices.map(invoiceToJson),
  };
  download(`${fileName}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

export interface BackupPayload {
  app: 'faktorizm';
  version: 2;
  exportedAt: string;
  invoices: Invoice[];
  contacts: Contact[];
  products: Product[];
}

export function exportBackup(payload: Omit<BackupPayload, 'app' | 'version' | 'exportedAt'>): void {
  const body: BackupPayload = {
    app: 'faktorizm', version: 2, exportedAt: new Date().toISOString(), ...payload,
  };
  download(
    `faktorizm-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(body, null, 2),
    'application/json;charset=utf-8',
  );
}

/** بررسی سلامت فایل پشتیبان پیش از بازگردانی */
export function validateBackup(raw: string): { ok: boolean; error?: string; data?: BackupPayload } {
  try {
    const parsed = JSON.parse(raw) as BackupPayload;
    if (parsed.app !== 'faktorizm') return { ok: false, error: 'این فایل پشتیبان فاکتوریزم نیست.' };
    if (!Array.isArray(parsed.invoices)) return { ok: false, error: 'فهرست فاکتورها در فایل نیست.' };
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: 'فایل JSON سالم نیست.' };
  }
}
