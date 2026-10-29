// آزمون لایه خوانش ابری: نرمال‌سازی خروجی مدل و ادغام با خوانش محلی
// بدون تماس شبکه؛ پاسخ مدل شبیه‌سازی می‌شود.
import { normalizeFields, toAmount } from '../src/lib/ocr/aiEngine';
import { mergeAiIntoParsed } from '../src/lib/ocr/merge';
import { parseInvoiceText } from '../src/lib/ocr/parser';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, extra = '') {
  if (condition) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name} ${extra}`);
  }
}

// ۱) تبدیل اعداد فارسی و جداکننده‌ها
check('عدد فارسی با جداکننده', toAmount('۱۲٬۹۶۶٬۰۰۰') === 12966000);
check('عدد عربی', toAmount('٤٥٠٠٠٠') === 450000);
check('عدد با واحد متن', toAmount('۱۲۳,۴۵۶ ریال') === 123456);
check('مقدار خالی', toAmount('') === undefined && toAmount(null) === undefined);

// ۲) نرمال‌سازی پاسخ خام مدل با کلیدهای متفاوت
const rawModel = {
  number: '۱۴۰۳۲۲۸۷',
  date: '1404/05/12',
  seller: 'فروشگاه لوازم خانگی آرین',
  buyer: 'شرکت پخش کالای پارس',
  items: [
    { title: 'لپ‌تاپ لنوو', quantity: '۲', price: '۴۸٬۵۰۰٬۰۰۰' },
    { name: 'ماوس بی‌سیم', qty: 5, unitPrice: 890000, amount: '۴٬۴۵۰٬۰۰۰' },
  ],
  subtotal: '116,950,000',
  tax: 0,
  total: '121,400,000',
  currency: 'IRR',
  confidence: 95,
};

const fields = normalizeFields(rawModel);
check('شماره فاکتور نرمال شد', fields.number === '۱۴۰۳۲۲۸۷');
check('نام فروشنده از کلید seller', fields.issuerName === 'فروشگاه لوازم خانگی آرین');
check('دو ردیف کالا', fields.items.length === 2);
check('تعداد فارسی تبدیل شد', fields.items[0].qty === 2);
check('مبلغ کل ردیف از ضرب ساخته شد', fields.items[0].total === 97000000);
check('مبلغ واحد از کل تقسیم شد', fields.items[1].unitPrice === 890000);
check('مبلغ نهایی', fields.total === 121400000);
check('ارز', fields.currency === 'IRR');

// ۳) ادغام با نتیجه محلی
const localText = [
  'فروشگاه لوازم خانگی آرین',
  'شماره فاکتور: 12345',
  'تاریخ: 1404/05/12',
  'شرح کالا تعداد مبلغ واحد مبلغ کل',
  'لپ‌تاپ 2 48500000 97000000',
  'جمع کل 97000000',
].join('\n');
const local = parseInvoiceText(localText, 70, 9);
const merged = mergeAiIntoParsed(local, fields, { model: 'gemini-test', aiConfidence: 96 });

check('شماره از موتور ابری', merged.number === '۱۴۰۳۲۲۸۷');
check('ردیف‌ها از موتور ابری', merged.items.length === 2);
check('جمع نهایی از موتور ابری', merged.total === 121400000);
check('اطمینان فیلدها بالا رفت', (merged.fieldConfidence.number ?? 0) >= 96);
check('هشدار منبع ابری ثبت شد',
  merged.warnings.some((w) => w.includes('موتور ابری')),
  JSON.stringify(merged.warnings));
check('هشدار اختلاف جمع ثبت شد',
  merged.warnings.some((w) => w.includes('هم‌خوان نیست')),
  JSON.stringify(merged.warnings));

// ۴) محافظت: پاسخ خالی مدل نباید خوانش محلی را خراب کند
const empty = normalizeFields({});
const safe = mergeAiIntoParsed(local, empty, { aiConfidence: 90 });
check('پاسخ خالی، داده محلی را نگه می‌دارد', safe.items.length === local.items.length);
check('تاریخ محلی حفظ شد', safe.date === local.date);

// ۵) آرایه‌های نامعتبر نباید خطا بدهند
const messy = normalizeFields({ items: [null, 'x', { name: '', total: 0 }] as unknown[] });
check('ردیف‌های نامعتبر حذف شدند', messy.items.length === 0);

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
