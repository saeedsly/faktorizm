import { db, saveSettings } from './db';
import { recalc } from './invoices';
import { uid, toFaDigits } from './utils';
import { logActivity } from './activity';
import type { Invoice, Contact, Product, InvoiceItem } from './types';

const CONTACTS_SEED: Array<[string, string]> = [
  ['شرکت پخش مواد غذایی بهار', '101014'],
  ['فروشگاه لوازم اداری پارس', '101025'],
  ['تجهیزات الکترونیکی آریا تک', '101033'],
  ['چاپخانه نگاره', '101047'],
  ['شرکت حمل‌ونقل جاده‌ای سیراف', '101058'],
  ['بازرگانی کالای ساختمانی البرز', '101069'],
];

const PRODUCT_SEED: Array<[string, string, number, string]> = [
  ['روغن مایع سرخ‌کردنی ۳ لیتری', 'عدد', 320000, 'مواد غذایی'],
  ['برنج ایرانی درجه یک ۱۰ کیلویی', 'کیسه', 1850000, 'مواد غذایی'],
  ['کاغذ A4 بسته ۵۰۰ برگی', 'بسته', 410000, 'لوازم اداری'],
  ['خودکار آبی مدل ۰.۷', 'جعبه', 285000, 'لوازم اداری'],
  ['هارد اکسترنال ۱ ترابایت', 'عدد', 3650000, 'الکترونیک'],
  ['کابل شبکه CAT6 حلقه ۳۰۵ متری', 'حلقه', 2450000, 'الکترونیک'],
  ['چاپ کارت ویزیت دو رو', 'هزار', 1200000, 'خدمات چاپ'],
  ['سیمان تیپ ۲ پاکتی ۵۰ کیلویی', 'پاکت', 165000, 'ساختمانی'],
  ['میلگرد آجدار ۱۲', 'شاخه', 310000, 'ساختمانی'],
  ['خدمات باربری بین‌شهری', 'سرویس', 8500000, 'حمل‌ونقل'],
];

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function item(title: string, qty: number, price: number, taxRate: number): InvoiceItem {
  return { id: uid('itm_'), title, quantity: qty, unitPrice: price, discount: 0, taxRate };
}

export async function seedDemoData(): Promise<void> {
  const existing = await db.invoices.count();
  if (existing > 0) return;

  const contacts: Contact[] = CONTACTS_SEED.map(([name, code]) => ({
    id: uid('cnt_'),
    name,
    type: 'vendor',
    economicCode: code,
    phone: `021-${String(Math.floor(1000000 + Math.random() * 8999999))}`,
    address: 'تهران، خیابان ولیعصر، پلاک ' + toFaDigits(String(Math.floor(10 + Math.random() * 200))),
    createdAt: daysAgo(120),
  }));
  await db.contacts.bulkAdd(contacts);

  const products: Product[] = PRODUCT_SEED.map(([title, unit, unitPrice, category]) => ({
    id: uid('prd_'),
    code: 'K-' + String(Math.floor(1000 + Math.random() * 8999)),
    title, unit, unitPrice,
    taxRate: 10,
    category,
    usageCount: Math.floor(1 + Math.random() * 8),
    createdAt: daysAgo(100),
  }));
  await db.products.bulkAdd(products);

  const plans: Array<{ days: number; ci: number; items: Array<[number, number]>; status: Invoice['status']; pay: Invoice['paymentStatus']; kind: Invoice['kind'] }> = [
    { days: 2, ci: 0, items: [[0, 12], [1, 4]], status: 'review', pay: 'unpaid', kind: 'invoice' },
    { days: 5, ci: 1, items: [[2, 6], [3, 2]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 9, ci: 2, items: [[4, 2], [5, 1]], status: 'approved', pay: 'partial', kind: 'invoice' },
    { days: 14, ci: 3, items: [[6, 3]], status: 'approved', pay: 'paid', kind: 'receipt' },
    { days: 18, ci: 4, items: [[9, 1]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 23, ci: 5, items: [[7, 40], [8, 25]], status: 'review', pay: 'unpaid', kind: 'invoice' },
    { days: 31, ci: 0, items: [[0, 20], [1, 6]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 37, ci: 1, items: [[2, 10]], status: 'archived', pay: 'paid', kind: 'invoice' },
    { days: 44, ci: 2, items: [[4, 1]], status: 'approved', pay: 'paid', kind: 'receipt' },
    { days: 52, ci: 3, items: [[6, 5]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 61, ci: 5, items: [[7, 60], [8, 30]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 74, ci: 4, items: [[9, 2]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 96, ci: 1, items: [[3, 4], [2, 8]], status: 'approved', pay: 'paid', kind: 'invoice' },
    { days: 118, ci: 0, items: [[1, 10], [0, 15]], status: 'approved', pay: 'paid', kind: 'invoice' },
  ];

  const invoices: Invoice[] = plans.map((p, idx) => {
    const contact = contacts[p.ci];
    const items = p.items.map(([pi, qty]) => {
      const pr = products[pi];
      return item(pr.title, qty, pr.unitPrice, pr.taxRate);
    });
    const inv: Invoice = {
      id: uid('inv_'),
      number: `FK-${1403}-${String(2040 + idx)}`,
      kind: p.kind,
      direction: 'purchase',
      status: p.status,
      paymentStatus: p.pay,
      issuerName: contact.name,
      buyerName: 'کسب‌وکار من',
      contactId: contact.id,
      date: daysAgo(p.days).slice(0, 10),
      items,
      discountTotal: 0,
      taxTotal: 0,
      total: 0,
      category: products[p.items[0][0]].category,
      tags: idx % 3 === 0 ? ['ضروری'] : idx % 3 === 1 ? ['ماهانه'] : [],
      note: '',
      currency: 'IRT',
      rawText: '',
      ocrConfidence: 88 + (idx % 10),
      fieldConfidence: { number: 92, date: 95, issuerName: 90, total: 93, items: 88, taxTotal: 90 },
      fileName: `factor-${idx + 1}.jpg`,
      fileType: 'image/jpeg',
      thumbnail: '',
      pages: 1,
      source: 'scan',
      createdAt: daysAgo(p.days),
      updatedAt: daysAgo(p.days),
    };
    return recalc(inv);
  });

  await db.invoices.bulkAdd(invoices);
  await saveSettings({ seeded: true });
  await logActivity('راه‌اندازی', 'system', 'داده‌های نمونه برای آشنایی با سامانه بارگذاری شد');
}

export async function wipeAllData(): Promise<void> {
  await Promise.all([
    db.invoices.clear(),
    db.contacts.clear(),
    db.products.clear(),
    db.activities.clear(),
    db.apiKeys.clear(),
    db.webhooks.clear(),
  ]);
  await saveSettings({ seeded: false });
  await logActivity('پاک‌سازی داده', 'system', 'همه اطلاعات سامانه پاک شد');
}
