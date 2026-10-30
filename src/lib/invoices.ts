import { db } from './db';
import { uid } from './utils';
import { logActivity } from './activity';
import { todayISO } from './jalali';
import type { Invoice, InvoiceItem, AppSettings } from './types';
import type { ParsedInvoice } from './ocr/parser';

export function itemNet(item: InvoiceItem): number {
  return Math.max(0, item.quantity * item.unitPrice - item.discount);
}

export function itemTax(item: InvoiceItem): number {
  return Math.round(itemNet(item) * (item.taxRate / 100));
}

export function computeTotals(items: InvoiceItem[], extraDiscount = 0) {
  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const itemsDiscount = items.reduce((s, it) => s + it.discount, 0) + extraDiscount;
  const afterDiscount = Math.max(0, subtotal - itemsDiscount);
  const taxTotal = items.reduce((s, it) => s + itemTax(it), 0);
  return { subtotal, discountTotal: itemsDiscount, taxTotal, total: afterDiscount + taxTotal };
}

/**
 * مبلغ نهایی سند: اگر سند مبلغ چاپ‌شده‌ای داشته باشد که با جمع ردیف‌ها نمی‌خوانَد،
 * همان عددِ چاپ‌شده مرجع است؛ وگرنه جمع ردیف‌ها.
 */
export function payableOf(invoice: Invoice): number {
  return invoice.documentTotal && invoice.documentTotal > 0 ? invoice.documentTotal : invoice.total;
}

export function recalc(invoice: Invoice): Invoice {
  const t = computeTotals(invoice.items, 0);
  invoice.discountTotal = t.discountTotal;
  // مالیات سند: اگر ردیف‌ها نرخ مالیات ندارند ولی سند مبلغ مالیات را نوشته،
  // همان مبلغ سند مرجع است تا در گزارش‌ها گم نشود.
  const documentBased = (invoice.documentTotal ?? 0) > 0;
  invoice.taxTotal = documentBased ? Math.max(t.taxTotal, invoice.taxTotal || 0) : t.taxTotal;
  invoice.total = t.total;
  return invoice;
}

export function invoiceFromParsed(
  parsed: ParsedInvoice,
  meta: { fileName: string; fileType: string; thumbnail: string; pages: number; rawText: string; ocrConfidence: number },
  settings: AppSettings,
): Invoice {
  const now = new Date().toISOString();
  const invoice: Invoice = {
    id: uid('inv_'),
    number: parsed.number || `FK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    kind: parsed.kind,
    direction: 'purchase',
    status: meta.ocrConfidence >= settings.autoApproveThreshold ? 'approved' : 'review',
    paymentStatus: 'unpaid',
    issuerName: parsed.issuerName,
    buyerName: parsed.buyerName || settings.businessName,
    date: parsed.date || todayISO(),
    items: parsed.items.length ? parsed.items : [],
    discountTotal: parsed.discountTotal,
    taxTotal: parsed.taxTotal,
    total: parsed.total,
    // سند معمولاً مبلغ نهایی را خودش می‌نویسد؛ نگهش می‌داریم تا با جمع ردیف‌های
    // ناقص‌خوانده‌شده گم نشود.
    documentTotal: parsed.total > 0 ? parsed.total : undefined,
    category: parsed.category,
    tags: [],
    note: '',
    currency: parsed.currency || settings.currency,
    rawText: meta.rawText,
    ocrConfidence: meta.ocrConfidence,
    fieldConfidence: parsed.fieldConfidence,
    ocrWarnings: parsed.warnings.length ? parsed.warnings : undefined,
    fileName: meta.fileName,
    fileType: meta.fileType,
    thumbnail: meta.thumbnail,
    pages: meta.pages,
    source: 'scan',
    createdAt: now,
    updatedAt: now,
  };
  return recalc(invoice);
}

/** ذخیره فاکتور + طرف حساب و کالاهای جدید به صورت خودکار */
export async function saveInvoice(invoice: Invoice, action = 'create'): Promise<Invoice> {
  recalc(invoice);
  invoice.updatedAt = new Date().toISOString();

  if (invoice.issuerName) {
    const existing = await db.contacts.filter((c) => c.name === invoice.issuerName).first();
    if (existing) {
      invoice.contactId = existing.id;
    } else {
      const id = uid('cnt_');
      await db.contacts.add({
        id, name: invoice.issuerName, type: 'vendor',
        createdAt: new Date().toISOString(),
      });
      invoice.contactId = id;
    }
  }

  for (const item of invoice.items) {
    if (!item.title) continue;
    const product = await db.products.filter((p) => p.title === item.title).first();
    if (product) {
      await db.products.update(product.id, {
        usageCount: product.usageCount + 1,
        unitPrice: item.unitPrice || product.unitPrice,
      });
    } else {
      await db.products.add({
        id: uid('prd_'),
        code: '',
        title: item.title,
        unit: 'عدد',
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        category: invoice.category,
        usageCount: 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  await db.invoices.put(invoice);
  logActivity(action === 'create' ? 'ایجاد فاکتور' : 'ویرایش فاکتور', 'invoice',
    `فاکتور ${invoice.number} — ${invoice.issuerName || 'بدون نام'}`, invoice.id);
  return invoice;
}

export async function softDeleteInvoice(id: string): Promise<void> {
  await db.invoices.update(id, { deletedAt: Date.now(), updatedAt: new Date().toISOString() });
  logActivity('انتقال به سطل بازیافت', 'invoice', 'فاکتور حذف شد', id);
}

export async function restoreInvoice(id: string): Promise<void> {
  await db.invoices.update(id, { deletedAt: undefined, updatedAt: new Date().toISOString() });
  logActivity('بازیابی فاکتور', 'invoice', 'فاکتور از سطل بازیافت بازگردانده شد', id);
}

export async function permanentDelete(id: string): Promise<void> {
  await db.invoices.delete(id);
  logActivity('حذف دائم', 'invoice', 'فاکتور برای همیشه حذف شد', id);
}

export async function setStatus(ids: string[], status: Invoice['status']): Promise<void> {
  await Promise.all(ids.map((id) => db.invoices.update(id, { status, updatedAt: new Date().toISOString() })));
  logActivity('تغییر گروهی وضعیت', 'invoice', `${ids.length} فاکتور → ${status}`);
}

export async function setPaymentStatus(ids: string[], status: Invoice['paymentStatus']): Promise<void> {
  await Promise.all(ids.map((id) => db.invoices.update(id, { paymentStatus: status, updatedAt: new Date().toISOString() })));
  logActivity('تغییر گروهی وضعیت پرداخت', 'invoice', `${ids.length} فاکتور → ${status}`);
}

export async function ensureProduct(title: string, fallbackPrice: number, taxRate: number) {
  const found = await db.products.filter((p) => p.title === title).first();
  return found ?? null;
}
