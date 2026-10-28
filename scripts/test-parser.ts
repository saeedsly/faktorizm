import { parseInvoiceText } from '../src/lib/ocr/parser';
import { toJalali } from '../src/lib/jalali';
import { unifyDigits, normalizeLetters, extractNumberTokens, normalizeOcrText } from '../src/lib/ocr/correct';

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string) {
  console.log(ok ? `✅ ${label}` : `❌ ${label}`);
  ok ? pass++ : fail++;
}

/* ---------- تست واحد لایه تصحیح ---------- */
check(unifyDigits('١٤٠۳') === '1403', 'یکسان‌سازی ارقام عربی/فارسی');
check(normalizeLetters('ك ي ـ ة') === 'ک ی ه', 'نرمال‌سازی حروف عربی و کشیده');
const merged = extractNumberTokens('مبلغ 12 000 000 ریال');
check(merged.length === 1 && merged[0].value === 12000000, 'چسباندن گروه‌های هزارگان فضادار');
const cols = extractNumberTokens('5 320000 1600000');
check(cols.length === 3 && cols[2].value === 1600000, 'تفکیک ستون‌های جدول به‌جای چسباندن');
const confused = extractNumberTokens('مبلغ 2,4O0,000');
check(confused.length === 1 && confused[0].value === 2400000, 'تصحیح O/0 داخل توکن عددی');
check(normalizeOcrText('قيمت ٥٬٣٠٠٬٠٠٠').includes('5,300,000'), 'نرمال‌سازی جداگر هزارگان و ارقام');
check(normalizeOcrText('خط اول\nخط دوم').split('\n').length === 2, 'حفظ شکست خط در نرمال‌سازی');

/* ---------- نمونه ۱: فاکتور تمیز (سازگاری با نسخه قبل) ---------- */
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
console.log('\n— نمونه ۱ (تمیز) —');
console.log('شماره:', r.number, '| تاریخ:', r.date ? toJalali(r.date) : r.date);
console.log('اقلام:', r.items.map((i) => `${i.title} ×${i.quantity} @${i.unitPrice}`));
console.log('هشدارها:', r.warnings);

check(r.number === '1403/8725', 'نمونه۱: شماره فاکتور');
check(!!r.date && toJalali(r.date) === '۱۴۰۳/۰۵/۱۲', 'نمونه۱: تبدیل تاریخ شمسی');
check(r.issuerName.includes('بهار'), 'نمونه۱: نام فروشنده');
check(r.total === 5830000, 'نمونه۱: مبلغ قابل پرداخت');
check(r.taxTotal === 530000, 'نمونه۱: مالیات ارزش افزوده');
check(r.items.length === 2, 'نمونه۱: استخراج دو قلم کالا');
check(r.items[0]?.quantity === 5, 'نمونه۱: تعداد اقلام');

/* ---------- نمونه ۲: خروجی نویزی OCR با حروف عربی، عدد در شرح، بدون خط مالیات ---------- */
const noisy = `
فاكـتور فروش كالا
شماره فاكتور: ١٤٠٣/٩٩٨٨
تاريخ: ١٤٠٣/٠٧/٠١
فروشنده: شركت پخش سراسري البرز
خریدار: موسسه خدماتي پارس
شرح كالا تعداد قيمت واحد مبلغ كل
لپ تاپ ١٥ اينچي ٣ ٢٥٬٠٠٠٬٠٠٠ ٧٥٬٠٠٠٬٠٠٠
ماوس بيسيم ١٠ ٨٥٠٬٠٠٠ ٨٬٥٠٠٬٠٠٠
جمع كل: ٨٣٬٥٠٠٬٠٠٠
تخفيف: ٠
مبلغ قابل پرداخت: ٩١٬٨٥٠٬٠٠٠
`;

const n = parseInvoiceText(noisy, 48, 10);
console.log('\n— نمونه ۲ (نویزی) —');
console.log('شماره:', n.number, '| تاریخ:', n.date ? toJalali(n.date) : n.date);
console.log('فروشنده:', n.issuerName);
console.log('اقلام:', n.items.map((i) => `${i.title} ×${i.quantity} @${i.unitPrice}`));
console.log('مالیات:', n.taxTotal, '| کل:', n.total);
console.log('هشدارها:', n.warnings);

check(n.number === '1403/9988', 'نمونه۲: شماره با ارقام عربی');
check(!!n.date && toJalali(n.date) === '۱۴۰۳/۰۷/۰۱', 'نمونه۲: تاریخ عربی نرمال‌شده');
check(n.issuerName.includes('البرز') && n.issuerName.includes('شرکت'), 'نمونه۲: فروشنده با حروف نرمال‌شده');
check(n.items.length === 2, 'نمونه۲: هر دو ردیف استخراج شد');
check(n.items[0]?.quantity === 3, 'نمونه۲: عدد ۱۵ داخل شرح با تعداد اشتباه نشد');
check(n.items[0]?.unitPrice === 25000000 && n.items[0]?.quantity * n.items[0].unitPrice === 75000000, 'نمونه۲: قیمت و جمع سطر اول');
check(n.taxTotal === 8350000, 'نمونه۲: مالیات غایب توسط دستیار محاسبه شد');
check(n.total === 91850000, 'نمونه۲: جمع کل لنگر‌دار');
check(n.warnings.some((w) => w.includes('مالیات') && w.includes('محاسبه شد')), 'نمونه۲: هشدار محاسبه مالیات وجود دارد');
check(n.warnings.some((w) => w.includes('OCR')), 'نمونه۲: هشدار اطمینان پایین OCR وجود دارد');

/* ---------- نمونه ۳: رسید با اشتباه O/0 و جمع کل ناسازگار ---------- */
const receipt = `
رسید خرید
شماره رسید: RCP-8021
تاریخ: 1403/09/05
فروشگاه: کافی شاپ مرکزی
شرح تعداد قیمت واحد مبلغ کل
قهوه بسته ای 2 1,2O0,000 2,4O0,000
جمع کل: 2,400,000
قابل پرداخت: 3,000,000
`;

const c = parseInvoiceText(receipt, 70, 10);
console.log('\n— نمونه ۳ (رسید و ناسازگاری جمع) —');
console.log('نوع:', c.kind, '| اقلام:', c.items.map((i) => `${i.title} ×${i.quantity} @${i.unitPrice}`));
console.log('کل:', c.total, '| هشدارها:', c.warnings);

check(c.kind === 'receipt', 'نمونه۳: نوع سند رسید تشخیص داده شد');
check(c.items.length === 1 && c.items[0].unitPrice === 1200000, 'نمونه۳: تصحیح حرف O به صفر در قیمت');
check(c.items[0]?.quantity === 2 && c.items[0].quantity * c.items[0].unitPrice === 2400000, 'نمونه۳: تعداد و جمع سطر');
check(c.total === 3000000, 'نمونه۳: مبلغ قابل پرداخت از سند خوانده شد');
check(c.warnings.some((w) => w.includes('اختلاف')), 'نمونه۳: هشدار ناسازگاری جمع کل با اقلام');

console.log(`\n${pass}/${pass + fail} تست موفق`);
process.exit(fail === 0 ? 0 : 1);
