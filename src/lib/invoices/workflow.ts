/**
 * گردش کار سند: تاریخچه تغییرات، نسخه‌ها و اقساط
 *
 * هر تغییر مهم روی سند یک رخداد در تاریخچه می‌نویسد (چه کسی، چه زمانی، از
 * چه وضعیتی به چه وضعیتی). نسخه‌ها اجازه می‌دهند سند به حالت قبل برگردد.
 * اقساط هم برنامه پرداخت سند را می‌سازند تا سند پرداخت‌نشده گم نشود.
 */
import { db } from '../db';
import { uid } from '../utils';
import { todayISO } from '../jalali';
import { payableOf } from '../invoices';
import type { AuditEntry, Invoice, InvoiceVersion, PaymentPlan } from '../types';

const MAX_VERSIONS = 25;

/** ثبت یک رخداد در تاریخچه سند */
export async function logAudit(
  invoiceId: string,
  action: string,
  extra: { from?: string; to?: string; note?: string; actor?: string } = {},
): Promise<void> {
  if (!invoiceId) return;
  const entry: AuditEntry = {
    id: uid('aud_'),
    invoiceId,
    at: new Date().toISOString(),
    action,
    ...extra,
  };
  await db.audit.put(entry);
}

/** تاریخچه یک سند، تازه‌ترین اول */
export async function auditOf(invoiceId: string): Promise<AuditEntry[]> {
  const rows = await db.audit.where('invoiceId').equals(invoiceId).toArray();
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** شمارش رخدادها برای همه اسناد (نمایش در فهرست) */
export async function auditCounts(): Promise<Record<string, number>> {
  const rows = await db.audit.toArray();
  const out: Record<string, number> = {};
  for (const row of rows) out[row.invoiceId] = (out[row.invoiceId] ?? 0) + 1;
  return out;
}

/** ذخیره یک نسخه از سند پیش از تغییر */
export async function snapshot(invoice: Invoice, label: string): Promise<void> {
  if (!invoice?.id) return;
  const version: InvoiceVersion = {
    id: uid('ver_'),
    invoiceId: invoice.id,
    at: new Date().toISOString(),
    label,
    data: JSON.stringify(invoice),
    amount: payableOf(invoice),
  };
  await db.versions.put(version);
  const all = await db.versions.where('invoiceId').equals(invoice.id).toArray();
  if (all.length > MAX_VERSIONS) {
    const extra = all.sort((a, b) => a.at.localeCompare(b.at)).slice(0, all.length - MAX_VERSIONS);
    await Promise.all(extra.map((v) => db.versions.delete(v.id)));
  }
}

export async function versionsOf(invoiceId: string): Promise<InvoiceVersion[]> {
  const rows = await db.versions.where('invoiceId').equals(invoiceId).toArray();
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** بازگردانی سند به یک نسخه (نسخه فعلی اول ذخیره می‌شود) */
export async function restoreVersion(versionId: string): Promise<Invoice | null> {
  const version = await db.versions.get(versionId);
  if (!version) return null;
  const current = await db.invoices.get(version.invoiceId);
  if (current) await snapshot(current, 'پیش از بازگردانی');
  const data = JSON.parse(version.data) as Invoice;
  const next: Invoice = {
    ...data,
    updatedAt: new Date().toISOString(),
    deletedAt: undefined,
  };
  await db.invoices.put(next);
  await logAudit(next.id, 'بازگردانی نسخه', { note: version.label });
  return next;
}

/* ---------------------------------------------------------------- اقساط */

/** ساخت برنامه اقساط مساوی از تاریخ سند */
export function buildInstallments(invoice: Invoice, count: number, everyDays = 30): Omit<PaymentPlan, 'id'>[] {
  const total = payableOf(invoice);
  if (total <= 0 || count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const start = new Date(invoice.date || todayISO());
  const rows: Omit<PaymentPlan, 'id'>[] = [];
  for (let i = 0; i < count; i++) {
    const due = new Date(start.getTime() + everyDays * (i + 1) * 86400000);
    rows.push({
      invoiceId: invoice.id,
      title: `قسط ${i + 1} از ${count}`,
      amount: i === 0 ? base + remainder : base,
      dueDate: due.toISOString().slice(0, 10),
    });
  }
  return rows;
}

export async function saveInstallments(invoice: Invoice, count: number, everyDays = 30): Promise<PaymentPlan[]> {
  const rows = buildInstallments(invoice, count, everyDays);
  const saved = rows.map((r) => ({ ...r, id: uid('pay_') }));
  await db.transaction('rw', db.paymentPlans, async () => {
    const old = await db.paymentPlans.where('invoiceId').equals(invoice.id).toArray();
    await Promise.all(old.map((p) => db.paymentPlans.delete(p.id)));
    await db.paymentPlans.bulkPut(saved);
  });
  await logAudit(invoice.id, 'برنامه پرداخت ساخته شد', { note: `${count} قسط` });
  return saved;
}

export async function plansOf(invoiceId: string): Promise<PaymentPlan[]> {
  const rows = await db.paymentPlans.where('invoiceId').equals(invoiceId).toArray();
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function markPaid(planId: string, method = 'نقدی'): Promise<void> {
  const plan = await db.paymentPlans.get(planId);
  if (!plan) return;
  await db.paymentPlans.put({ ...plan, paidAt: new Date().toISOString(), method });
  await logAudit(plan.invoiceId, 'قسط پرداخت شد', { note: `${plan.title} — ${method}` });
  await syncPaymentStatus(plan.invoiceId);
}

export function isOverdue(plan: PaymentPlan): boolean {
  return !plan.paidAt && plan.dueDate < todayISO();
}

export function daysLate(plan: PaymentPlan): number {
  if (plan.paidAt) return 0;
  const due = new Date(plan.dueDate).getTime();
  const now = Date.now();
  return due >= now ? 0 : Math.floor((now - due) / 86400000);
}

/** وضعیت پرداخت سند را با اقساطش هم‌تراز می‌کند */
export async function syncPaymentStatus(invoiceId: string): Promise<void> {
  const invoice = await db.invoices.get(invoiceId);
  if (!invoice) return;
  const plans = await plansOf(invoiceId);
  if (!plans.length) return;
  const paid = plans.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const total = plans.reduce((s, p) => s + p.amount, 0);
  const status = paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';
  if (status !== invoice.paymentStatus) {
    await db.invoices.put({ ...invoice, paymentStatus: status, updatedAt: new Date().toISOString() });
    await logAudit(invoiceId, 'وضعیت پرداخت تغییر کرد', { from: invoice.paymentStatus, to: status });
  }
}

export interface AgingBucket { label: string; count: number; amount: number }

/** تحلیل سنی بدهی‌ها بر پایه اقساط سررسیدشده */
export async function agingReport(): Promise<AgingBucket[]> {
  const plans = await db.paymentPlans.toArray();
  const buckets: AgingBucket[] = [
    { label: 'سررسید نشده', count: 0, amount: 0 },
    { label: '۱ تا ۳۰ روز', count: 0, amount: 0 },
    { label: '۳۱ تا ۶۰ روز', count: 0, amount: 0 },
    { label: '۶۱ تا ۹۰ روز', count: 0, amount: 0 },
    { label: 'بیش از ۹۰ روز', count: 0, amount: 0 },
  ];
  for (const plan of plans) {
    if (plan.paidAt) continue;
    const late = daysLate(plan);
    const idx = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    buckets[idx].count++;
    buckets[idx].amount += plan.amount;
  }
  return buckets;
}
