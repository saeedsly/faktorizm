import { db } from '../db';
import { downloadText } from '../utils';
import { logActivity } from '../activity';
import { toJalali } from '../jalali';

export async function exportBackup(): Promise<void> {
  const [invoices, contacts, products, apiKeys, webhooks, activities, settings] = await Promise.all([
    db.invoices.toArray(),
    db.contacts.toArray(),
    db.products.toArray(),
    db.apiKeys.toArray(),
    db.webhooks.toArray(),
    db.activities.toArray(),
    db.settings.toArray(),
  ]);
  const payload = {
    app: 'faktorizm',
    version: 1,
    exportedAt: new Date().toISOString(),
    // کلیدهای سرویس ابری داخل پشتیبان نمی‌روند؛ فایل پشتیبان ممکن است جابه‌جا شود
    data: {
      invoices, contacts, products, apiKeys, webhooks, activities,
      settings: settings.map((row) => ({ ...row, aiKeys: '', aiApiKey: '' })),
    },
  };
  downloadText(JSON.stringify(payload, null, 2), `faktorizm-backup-${toJalali(new Date().toISOString(), 'yyyyMMdd')}.json`);
  logActivity('تهیه نسخه پشتیبان', 'system', `خروجی پشتیبان شامل ${invoices.length} فاکتور`);
}

export async function importBackup(file: File): Promise<{ invoices: number; contacts: number; products: number }> {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (payload?.app !== 'faktorizm' || !payload.data) {
    throw new Error('فایل پشتیبان معتبر نیست (ساختار فاکتوریزم ندارد)');
  }
  const d = payload.data;
  if (Array.isArray(d.invoices)) await db.invoices.bulkPut(d.invoices);
  if (Array.isArray(d.contacts)) await db.contacts.bulkPut(d.contacts);
  if (Array.isArray(d.products)) await db.products.bulkPut(d.products);
  if (Array.isArray(d.apiKeys)) await db.apiKeys.bulkPut(d.apiKeys);
  if (Array.isArray(d.webhooks)) await db.webhooks.bulkPut(d.webhooks);
  if (Array.isArray(d.activities)) await db.activities.bulkPut(d.activities);
  if (Array.isArray(d.settings)) {
    // پشتیبان کلید ندارد؛ کلیدهای فعلی همین دستگاه حفظ می‌شوند
    const current = await db.settings.get('singleton');
    await db.settings.bulkPut(d.settings.map((row: Record<string, unknown>) => ({
      ...row,
      aiKeys: (row.aiKeys as string) || current?.aiKeys || '',
      aiApiKey: (row.aiApiKey as string) || current?.aiApiKey || '',
    })) as never);
  }
  await logActivity('بازیابی نسخه پشتیبان', 'system',
    `بازیابی ${d.invoices?.length ?? 0} فاکتور و ${d.contacts?.length ?? 0} طرف حساب`);
  return {
    invoices: d.invoices?.length ?? 0,
    contacts: d.contacts?.length ?? 0,
    products: d.products?.length ?? 0,
  };
}
