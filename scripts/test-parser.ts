import { parseInvoiceText } from '../src/lib/ocr/parser';
import { toJalali } from '../src/lib/jalali';

const sample = `
فاکتور فروش
شماره فاکتور: ۱۴۰۳/۸۷۲۵
تاریخ: ۱۴۰۳/۰۵/۱۲
فروشنده: شرکت پخش مواد غذایی بهار
خریدار: فروشگاه رفاه
کد اقتصادی: ۱۰۱۰۱۴
شرح کالا                    تعداد      قیمت واحد         مبلغ
روغن مایع ۳ لیتری             ۵        ۳۲۰٬۰۰۰        ۱٬۶۰۰٬۰۰۰
برنج ایرانی ۱۰ کیلویی          ۲      ۱٬۸۵۰٬۰۰۰        ۳٬۷۰۰٬۰۰۰
جمع کل: ۵٬۳۰۰٬۰۰۰
تخفیف: ۰
مالیات بر ارزش افزوده: ۵۳۰٬۰۰۰
مبلغ قابل پرداخت: ۵٬۸۳۰٬۰۰۰
`;

const r = parseInvoiceText(sample, 91, 10);
console.log('شماره:', r.number);
console.log('تاریخ شمسی:', r.date ? toJalali(r.date) : r.date);
console.log('فروشنده:', r.issuerName);
console.log('خریدار:', r.buyerName);
console.log('نوع سند:', r.kind, '| واحد پول:', r.currency);
console.log('اقلام:', r.items.map((i) => `${i.title} ×${i.quantity} @${i.unitPrice}`));
console.log('تخفیف:', r.discountTotal, '| مالیات:', r.taxTotal, '| کل:', r.total);
console.log('اطمینان فیلدها:', JSON.stringify(r.fieldConfidence));

const asserts: Array<[boolean, string]> = [
  [r.number === '1403/8725', 'شماره فاکتور'],
  [!!r.date && toJalali(r.date) === '۱۴۰۳/۰۵/۱۲', 'تبدیل تاریخ شمسی'],
  [r.issuerName.includes('بهار'), 'نام فروشنده'],
  [r.total === 5830000, 'مبلغ قابل پرداخت'],
  [r.taxTotal === 530000, 'مالیات ارزش افزوده'],
  [r.items.length === 2, 'استخراج دو قلم کالا'],
  [r.items[0]?.quantity === 5, 'تعداد اقلام'],
];
let pass = 0;
for (const [ok, label] of asserts) {
  console.log(ok ? `✅ ${label}` : `❌ ${label}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${asserts.length} تست موفق`);
process.exit(pass === asserts.length ? 0 : 1);
