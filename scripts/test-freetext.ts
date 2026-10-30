// آزمون فهم معنایی متن فاکتور — روی متن واقعی استخراج‌شده از یک فاکتور فروشگاهی
import { readFileSync } from 'node:fs';
import { analyzeInvoiceText, applyFreeTextAnalysis, amountsOf, parseAmountToken, readHeader } from '../src/lib/ocr/freetext';
import { parseInvoiceText } from '../src/lib/ocr/parser';
import { invoiceFromParsed, payableOf } from '../src/lib/invoices';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, extra = '') {
  if (condition) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name} ${extra}`); }
}

// ---------------------------------------------------------- عددخوان
check('عدد با جداکننده فارسی', parseAmountToken('۲۵٬۳۲۴٬۰۰۰') === 25324000);
check('عدد با جداکننده نویزی ممیز', parseAmountToken('۱۳٫۵۹۵،۵۰۵') === 13595505);
check('عدد لاتین با کاما', parseAmountToken('4,450,000') === 4450000);
check('عدد اعشاری واقعی', parseAmountToken('۱۲٫۵') === 12.5);
check('عدد ساده', parseAmountToken('۲۵۰') === 250);
check('خط با چند عدد', JSON.stringify(amountsOf('1 ۱۳٬۵۹۵٬۵۰۵ ۱٬۳۵۹٬۰۰۰ ۱۲٬۳۳۱٬۵۰۵'))
  === JSON.stringify([1, 13595505, 1359000, 12331505]));

// ---------------------------------------------------------- سرستون
const header = readHeader('تعداد قیمت مصرف کننده مبلغ تخفیف قابل پرداخت');
check('ترتیب ستون‌ها فهمیده شد', JSON.stringify(header) === JSON.stringify(['qty', 'unitPrice', 'discount', 'total']),
  JSON.stringify(header));

// ---------------------------------------------------------- فاکتور واقعی
const raw = readFileSync(process.cwd() + '/scripts/ocr-bench/sample-real-grocery.txt', 'utf-8');
const result = analyzeInvoiceText(raw);

console.log('\n── اقلام ──');
for (const item of result.items) {
  console.log(
    `  ${item.title} | ${item.quantity} × ${item.unitPrice} | تخفیف ${item.discount} | ${item.total}`
    + (item.needsReview ? '  ⚠ نیازمند بازبینی' : ''),
  );
}
console.log('── جمع‌ها ──', result.totals);

check('شش قلم کالا شناخته شد', result.items.length === 6, `دریافت: ${result.items.length}`);
check('عنوان کالای اول درست', result.items[0]?.title.includes('سینته'), result.items[0]?.title);
check('قیمت کالای اول', result.items[0]?.unitPrice === 13595505, String(result.items[0]?.unitPrice));
check('تخفیف کالای اول', result.items[0]?.discount === 1359000, String(result.items[0]?.discount));
check('عنوان کالای دوم', result.items[1]?.title.includes('روغن سرخ کردنی'), result.items[1]?.title);
check('قیمت کالای دوم', result.items[1]?.unitPrice === 3912730, String(result.items[1]?.unitPrice));
check('مبلغ نهایی کالای دوم اصلاح شد', result.items[1]?.total === 3754995, String(result.items[1]?.total));
check('مبلغ خوانده‌شده برای بازبینی نگه داشته شد', result.items[1]?.readTotal === 30505000);
check('عنوان کالای سوم (پودر پنیر)', result.items[2]?.title.includes('پنیر'), result.items[2]?.title);
check('عنوان کالای چهارم (بیسکویت)', result.items[3]?.title.includes('بیسکویت'), result.items[3]?.title);
check('قیمت کالای چهارم', result.items[3]?.unitPrice === 900000, String(result.items[3]?.unitPrice));
check('مبلغ کالای چهارم با تخفیف', result.items[3]?.total === 719500, String(result.items[3]?.total));
check('قیمت کالای پنجم (ابمیوه)', result.items[4]?.unitPrice === 5800000, String(result.items[4]?.unitPrice));
check('مبلغ کالای پنجم محاسبه شد', result.items[4]?.total === 5220000, String(result.items[4]?.total));
check('کالای ششم (نکتار سیب)', result.items[5]?.title.includes('نکتار'), result.items[5]?.title);

check('مبلغ پرداختی سند', result.totals.payable === 25324000, String(result.totals.payable));
check('جمع کل قبل از تخفیف', result.totals.preDiscount === 22582731, String(result.totals.preDiscount));
check('سود/تخفیف کل', result.totals.discount === 1758731, String(result.totals.discount));
check('مالیات (VAT)', result.totals.tax === 417091, String(result.totals.tax));

check('شماره تلفن به‌عنوان کالا ثبت نشد',
  !result.items.some((item) => item.title.includes('تلفن')), JSON.stringify(result.items.map((i) => i.title)));
check('کد اقتصادی به‌عنوان کالا ثبت نشد',
  !result.items.some((item) => item.title.includes('اقتصادی')));
check('شماره‌های مرجع غول‌پیکر نادیده گرفته شدند',
  !result.items.some((item) => item.total > 1_000_000_000));

// ---------------------------------------------------------- متن نامرتب دیگر
const messy = `
فروشگاه نمونه
شماره فاکتور: 4421
تاریخ: 1404/06/02
کاغذ A4
تعداد ۵ عدد قیمت ۲۵۰۰۰۰
خودکار آبی
۲ ۱۵۰۰۰ ۳۰۰۰۰۰
جمع کل ۱٬۵۵۰٬۰۰۰
مبلغ قابل پرداخت ۱٬۵۵۰٬۰۰۰
`;
const second = analyzeInvoiceText(messy);
check('فاکتور ساده هم خوانده شد', second.items.length === 2, JSON.stringify(second.items));
check('مبلغ نهایی فاکتور ساده', second.totals.payable === 1550000);

// ---------------------------------------------------------- متن بی‌معنا
const empty = analyzeInvoiceText('سلام خوبی');
check('متن بی‌ربط خطا نمی‌دهد', empty.items.length === 0 && empty.warnings.length > 0);

// ---------------------------------------------------------- مقادیر ناسازگار
const broken = analyzeInvoiceText('کالای آزمون\n2 100000 500000\nجمع کل ۵۰۰٬۰۰۰');
check('تعداد و قیمت با مبلغ ناسازگار، محاسبه می‌شود',
  broken.items[0]?.total === 200000, JSON.stringify(broken.items[0]));
check('برای ردیف ناسازگار هشدار داده می‌شود', broken.items[0]?.needsReview === true);

// ---------------------------------------------------------- اتصال به فاکتور
const parsedInv = parseInvoiceText(raw, 82, 9);
const merged = applyFreeTextAnalysis(parsedInv, result);
const invoice = invoiceFromParsed(merged, {
  fileName: 'sample-real-grocery.txt', fileType: 'text/plain', thumbnail: '', pages: 1,
  rawText: raw, ocrConfidence: 82,
}, { defaultTaxRate: 9, currency: 'IRT', autoApproveThreshold: 90, businessName: 'کسب‌وکار من' } as never);

check('فاکتور نهایی شش قلم دارد', invoice.items.length === 6, String(invoice.items.length));
check('مبلغ نهایی سند در فاکتور نگه داشته شد', invoice.documentTotal === 25324000, String(invoice.documentTotal));
check('مبلغ قابل پرداخت مرجع همان مبلغ سند است', payableOf(invoice) === 25324000, String(payableOf(invoice)));
check('جمع ردیف‌ها جدا از مبلغ سند محاسبه شد', invoice.total > 0 && invoice.total !== invoice.documentTotal,
  `${invoice.total} / ${invoice.documentTotal}`);
check('مالیات سند بعد از ساخت فاکتور گم نشد', invoice.taxTotal === 417091, String(invoice.taxTotal));
check('اختلاف ردیف‌ها با مبلغ سند هشدار دارد',
  invoice.ocrWarnings?.some((w) => w.includes('اختلاف')) === true, JSON.stringify(invoice.ocrWarnings?.slice(0, 2)));

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
