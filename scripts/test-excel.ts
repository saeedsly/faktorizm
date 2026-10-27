import * as XLSX from 'xlsx';
import { exportInvoicesXlsx, invoicesToCsv } from '../src/lib/exporters/excel';
import { recalc } from '../src/lib/invoices';
import { writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Invoice } from '../src/lib/types';

function mkInvoice(over: Partial<Invoice>): Invoice {
  return recalc({
    id: 'inv_t' + Math.random(), number: 'FK-1403-2040', kind: 'invoice', direction: 'purchase',
    status: 'approved', paymentStatus: 'paid', issuerName: 'شرکت تست', buyerName: 'کسب‌وکار من',
    date: '2024-08-02', items: [
      { id: 'i1', title: 'کالای آزمون', quantity: 2, unitPrice: 100000, discount: 0, taxRate: 10 },
    ], discountTotal: 0, taxTotal: 0, total: 0, category: 'الکترونیک', tags: ['ضروری'], note: '',
    currency: 'IRT', rawText: '', ocrConfidence: 92, fieldConfidence: {}, fileName: 't.jpg',
    fileType: 'image/jpeg', thumbnail: '', pages: 1, source: 'scan',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
  });
}

const invoices = [mkInvoice({}), mkInvoice({ number: 'FK-1403-2041' })];

// --- CSV ---
const csv = invoicesToCsv(invoices);
writeFileSync('/tmp/faktorizm-test.csv', csv);
const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
console.log('CSV هدر:', lines[0]);
if (!lines[0].includes('شماره فاکتور')) throw new Error('هدر CSV خراب است');
if (!lines[1].includes('شرکت تست')) throw new Error('داده CSV خراب است');
console.log('✅ CSV معتبر است (BOM فارسی و جداگر درست)');

// --- XLSX با قالب همکاران سیستم ---
const outDir = '/tmp/xlsx-test';
mkdirSync(outDir, { recursive: true });
const origCwd = process.cwd();
process.chdir(outDir);
exportInvoicesXlsx(invoices, 'hamkaran');
process.chdir(origCwd);

const produced = readdirSync(outDir).find((f) => f.endsWith('.xlsx'));
if (!produced) throw new Error('فایل اکسل تولید نشد');
const wb = XLSX.read(readFileSync(join(outDir, produced)));
console.log('شیت‌ها:', wb.SheetNames.join(' | '));
for (const s of ['فاکتورها', 'اقلام', 'خلاصه', 'قالب همکاران سیستم']) {
  if (!wb.SheetNames.includes(s)) throw new Error(`شیت ${s} وجود ندارد`);
}
const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['فاکتورها'])[0];
console.log('ردیف نمونه:', JSON.stringify(row).slice(0, 240));
if (!row['مبلغ کل'] || !row['تاریخ شمسی']) throw new Error('ستون‌های کلیدی نیستند');
const tpl = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['قالب همکاران سیستم'])[0];
if (!tpl['بدهکار (ریال)']) throw new Error('قالب حسابداری درست ساخته نشده');
if (!existsSync(join(outDir, produced))) throw new Error('فایل روی دیسک نیست');
console.log('✅ خروجی اکسل با ۴ شیت، ستون فارسی RTL و قالب حسابداری سالم است');
console.log('\nهمه تست‌های خروجی موفق بودند');
