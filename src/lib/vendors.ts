/**
 * حافظه فروشنده — برنامه از اسناد تأییدشده یاد می‌گیرد
 *
 * برای هر فروشنده ذخیره می‌شود: سرستون‌های جدولش، کلیدواژه‌های جمع‌بندی،
 * نرخ مالیات معمول، دسته و مرکز هزینه. دفعه بعد که از همان فروشنده سندی
 * بیاید، این دانش به پارسر داده می‌شود تا سریع‌تر و دقیق‌تر بخواند.
 */
import { db } from './db';
import { normalizeKeyword, type VendorHint } from './ocr/freetext';
import { payableOf } from './invoices';
import type { Invoice, VendorProfile } from './types';

export function vendorKey(name: string): string {
  return normalizeKeyword(name);
}

/** از یک سند تأییدشده، پروفایل فروشنده را بساز یا به‌روز کن */
export async function learnFromInvoice(invoice: Invoice, header: string[] = []): Promise<VendorProfile | null> {
  const name = invoice.issuerName.trim();
  if (!name) return null;
  const key = vendorKey(name);
  if (!key) return null;

  const existing = await db.vendors.where('key').equals(key).first();
  const samples = (existing?.samples ?? 0) + 1;
  const avgTotal = existing
    ? Math.round((existing.avgTotal * (samples - 1) + payableOf(invoice)) / samples)
    : payableOf(invoice);
  const taxRates = invoice.items.filter((i) => i.taxRate > 0).map((i) => i.taxRate);

  const profile: VendorProfile = {
    id: existing?.id ?? `ven_${key.slice(0, 24)}`,
    name,
    key,
    samples,
    lastSeenAt: new Date().toISOString(),
    header: header.length ? header : existing?.header ?? [],
    totalsKeywords: existing?.totalsKeywords ?? [],
    currency: invoice.currency,
    defaultTaxRate: taxRates.length ? taxRates[0] : existing?.defaultTaxRate ?? 0,
    avgTotal,
    category: invoice.category || existing?.category,
    costCenter: invoice.costCenter || existing?.costCenter,
  };
  await db.vendors.put(profile);
  return profile;
}

export async function getVendor(name: string): Promise<VendorProfile | null> {
  if (!name.trim()) return null;
  return (await db.vendors.where('key').equals(vendorKey(name)).first()) ?? null;
}

export async function allVendors(): Promise<VendorProfile[]> {
  const rows = await db.vendors.toArray();
  return rows.sort((a, b) => b.samples - a.samples || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** دانش فروشنده به شکل راهنمای پارسر */
export function toVendorHint(profile: VendorProfile | null): VendorHint | undefined {
  if (!profile) return undefined;
  return {
    header: profile.header.filter(Boolean),
    totalsKeywords: profile.totalsKeywords.filter(Boolean),
    taxRate: profile.defaultTaxRate || undefined,
    currency: profile.currency,
  };
}

/** پیشنهادهایی که هنگام ورود سند از دانش فروشنده می‌آید */
export function vendorSuggestions(profile: VendorProfile | null): { category?: string; costCenter?: string; taxRate?: number } {
  if (!profile) return {};
  return {
    category: profile.category,
    costCenter: profile.costCenter,
    taxRate: profile.defaultTaxRate || undefined,
  };
}

export async function forgetVendor(id: string): Promise<void> {
  await db.vendors.delete(id);
}
