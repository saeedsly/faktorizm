// آزمون لایه خوانش ابری: نرمال‌سازی خروجی مدل و ادغام با خوانش محلی
// بدون تماس شبکه؛ پاسخ مدل شبیه‌سازی می‌شود.
import {
  normalizeFields, toAmount, extractJson, mergeAiPages, AI_PROVIDERS, modelsOf, defaultModelOf,
} from '../src/lib/ocr/aiEngine';
import { buildCloudInvoice, buildAiTranscript, itemsFromAi } from '../src/lib/ocr/cloudFirst';
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

// ۰) پیکربندی سرویس‌ها
check('سرویس OpenRouter با مدل پیش‌فرض تعریف شده', !!AI_PROVIDERS.openrouter && defaultModelOf('openrouter').length > 3);
check('برای هر سرویس چند مدل پیشنهادی داریم', modelsOf('gemini').length >= 2 && modelsOf('openrouter').length >= 3);

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

// ۴) خواندن JSON خراب مدل
check('JSON با بلوک کد و متن اضافه خوانده می‌شود',
  (extractJson('```json\n{"total": 1000}\n```') as { total: number }).total === 1000);
check('کامای اضافه انتهای JSON تحمل می‌شود',
  (extractJson('{"a": 1, "items": [{"x": 2},],}') as { a: number }).a === 1);
check('نقل‌قول تک مدل اصلاح می‌شود',
  (extractJson("{'total': 5000, 'items': []}") as { total: number }).total === 5000);
check('پاسخ بدون JSON خطای روشن می‌دهد', (() => {
  try { extractJson('متأسفم، نمی‌توانم'); return false; } catch { return true; }
})());

// ۵) اقلام با تخفیف، مالیات، کد و واحد
const richFields = normalizeFields({
  items: [
    { name: 'روغن سرخ‌کردنی ۸۱۰ گرم', qty: 2, unitPrice: 500000, discount: 50000, taxRate: 9, code: '12345', unit: 'عدد' },
    { name: '   ', qty: 1, unitPrice: 0, total: 0 },
  ],
  total: 950000,
  confidence: 88,
});
check('تخفیف و نرخ مالیات ردیف نگه داشته می‌شود',
  richFields.items[0].discount === 50000 && richFields.items[0].taxRate === 9);
check('کد و واحد ردیف خوانده می‌شود',
  richFields.items[0].code === '12345' && richFields.items[0].unit === 'عدد');
check('ردیف بی‌نام و بی‌مبلغ حذف می‌شود', richFields.items.length === 1);

// ۶) ساخت سند از خروجی ابری (بدون OCR محلی)
const cloud = buildCloudInvoice({
  number: '۱۴۰۴۲۲', date: '1404/05/01', issuerName: 'افق کوروش', buyerName: 'مشتری',
  items: [
    { name: 'روغن سرخ‌کردنی ۸۱۰ گرم', qty: 2, unitPrice: 500000, total: 950000, discount: 50000, taxRate: 9 },
    { name: 'بیسکویت کاکائویی', qty: 1, unitPrice: 719500, total: 719500, taxRate: 9 },
  ],
  subtotal: 1669500, discount: 50000, tax: 150000, total: 1769500, currency: 'IRT', confidence: 93,
}, { defaultTaxRate: 9, providerLabel: 'گوگل Gemini', model: 'gemini-2.5-flash' });
check('سند ابری دو قلم دارد', cloud.parsed.items.length === 2, String(cloud.parsed.items.length));
check('نام کالا تمیز و کامل است', cloud.parsed.items[0].title === 'روغن سرخ‌کردنی ۸۱۰ گرم');
check('مبلغ نهایی همان «قابل پرداخت» سند است', cloud.parsed.total === 1769500);
check('مالیات و تخفیف سند جدا نگه داشته شد',
  cloud.parsed.taxTotal === 150000 && cloud.parsed.discountTotal === 50000);
check('اطمینان سند از مدل گرفته شد', cloud.parsed.fieldConfidence.items === 93);
check('متن بازسازی‌شده خط سرستون دارد',
  cloud.transcript.includes('قیمت واحد') && cloud.transcript.includes('مبلغ قابل پرداخت'));
check('متن بازسازی‌شده نام کالاها را دارد', cloud.transcript.includes('بیسکویت کاکائویی'));
check('اختلاف جمع ردیف‌ها با مبلغ سند هشدار می‌گیرد',
  buildCloudInvoice({
    items: [{ name: 'کالا', qty: 1, unitPrice: 100000, total: 100000 }], total: 500000,
  }, { defaultTaxRate: 0, providerLabel: 'آزمون' }).warnings.some((w) => w.includes('اختلاف')));

// ۷) اقلام بدون مبلغ نهایی: جمع ردیف‌ها جایگزین می‌شود
const noTotal = buildCloudInvoice({
  items: [{ name: 'ماست', qty: 2, unitPrice: 100000, total: 200000 }],
}, { defaultTaxRate: 0, providerLabel: 'آزمون' });
check('مبلغ نهایی از جمع ردیف‌ها ساخته می‌شود', noTotal.parsed.total === 200000);
check('برای آن به کاربر هشدار داده می‌شود', noTotal.warnings.some((w) => w.includes('محاسبه شد')));

// ۸) چند صفحه: اقلام همه صفحه‌ها و جمع مالیات
const mergedPages = mergeAiPages([
  { items: [{ name: 'کاغذ A4', qty: 1, unitPrice: 100000, total: 100000 }], issuerName: 'فروشگاه', tax: 9000, total: 109000, confidence: 90, page: 1 },
  { items: [{ name: 'خودکار آبی', qty: 2, unitPrice: 15000, total: 30000 }], tax: 2700, total: 42700, confidence: 80, page: 2 },
]);
check('اقلام هر دو صفحه جمع می‌شوند', mergedPages.items.length === 2);
check('مالیات صفحه‌ها جمع می‌شود', mergedPages.tax === 11700);
check('مبلغ نهایی از آخرین صفحه می‌آید', mergedPages.total === 42700);
check('سربرگ از صفحه اول گرفته می‌شود', mergedPages.issuerName === 'فروشگاه');
check('اطمینان میانگین صفحه‌ها محاسبه می‌شود', mergedPages.confidence === 85);

// ۹) ردیف بدون مبلغ واحد: از مبلغ کل ساخته می‌شود
const derived = itemsFromAi({ items: [{ name: 'پنیر', qty: 4, unitPrice: 0, total: 400000 }] },
  { defaultTaxRate: 0, providerLabel: 'آزمون' });
check('قیمت واحد از مبلغ کل تقسیم می‌شود', derived[0].unitPrice === 100000);
check('متن بازسازی‌شده بدون قلم کوتاه می‌ماند',
  buildAiTranscript({ items: [] }, []) === '');

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
