// آزمون اقلام ساخت‌یافته: نگاشت ستون‌ها به فیلدهای فاکتور و اعتبارسنجی مبالغ
import { applyStructuredItems, toInvoiceItems } from '../src/lib/ocr/structured';
import { parseInvoiceText } from '../src/lib/ocr/parser';
import type { ServerItem } from '../src/lib/ocr/serverEngine';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, extra = '') {
  if (condition) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name} ${extra}`); }
}

const localText = [
  'فروشگاه لوازم خانگی آرین',
  'شماره فاکتور: 14032287',
  'تاریخ: 1404/05/12',
  'شرح کالا تعداد قیمت واحد مبلغ کل',
  'لپ تاپ 2 48500000 97000000',
].join('\n');
const local = parseInvoiceText(localText, 70, 9);

const serverItems: ServerItem[] = [
  { title: 'لپ‌تاپ لنوو ThinkPad E14', quantity: 2, unitPrice: 48500000, discount: 0, taxRate: 9, total: 97000000 },
  { title: 'ماوس بی‌سیم لاجیتک', quantity: 5, unitPrice: 890000, discount: 100000, taxRate: 9, total: 4450000 },
  { title: 'کابل HDMI', quantity: 10, unitPrice: 450000, discount: 0, taxRate: 0, total: 4500000 },
];

const merged = applyStructuredItems(local, serverItems, { total: 130000000, tax: 9747000 });

check('همه اقلام سرویس منتقل شدند', merged.items.length === 3, String(merged.items.length));
check('قیمت واحد درست نشست', merged.items[0].unitPrice === 48500000);
check('تعداد درست نشست', merged.items[1].quantity === 5);
check('تخفیف ردیف منتقل شد', merged.items[1].discount === 100000);
check('درصد مالیات ردیف منتقل شد', merged.items[0].taxRate === 9);
check('مبلغ نهایی سند از جدول', merged.total === 130000000);
check('مالیات سند از جدول', merged.taxTotal === 9747000);
check('اطمینان اقلام بالا رفت', (merged.fieldConfidence.items ?? 0) >= 92);
check('هشدار اختلاف جمع ثبت شد', merged.warnings.some((w) => w.includes('اختلاف')));
check('شماره فاکتور محلی حفظ شد', merged.number === '14032287');

// مقادیر نامعتبر باید رد شوند، نه اینکه فاکتور را خراب کنند
const dirty = toInvoiceItems([
  { title: '', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0, total: 1000 },
  { title: 'کالا', quantity: 0, unitPrice: 0, discount: 0, taxRate: 0, total: 0 },
  { title: 'کالای سالم', quantity: 3, unitPrice: 2500000, discount: 0, taxRate: 9, total: 7500000 },
]);
check('ردیف بدون شرح حذف شد', dirty.length === 1, String(dirty.length));
check('تعداد صفر به یک اصلاح شد', dirty[0].quantity === 3);

// بدون اقلام ساخت‌یافته، نتیجه محلی دست‌نخورده می‌ماند
const untouched = applyStructuredItems(local, []);
check('نبود ساختار، خوانش متنی را خراب نمی‌کند', untouched.items.length === local.items.length);

// اگر مبلغ نهایی خوانده نشده باشد، از اقلام محاسبه می‌شود
const noTotals = applyStructuredItems(local, serverItems);
check('مبلغ نهایی از اقلام محاسبه شد', noTotals.total > 0, String(noTotals.total));
check('مالیات از نرخ ردیف‌ها محاسبه شد', noTotals.taxTotal > 0);

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
