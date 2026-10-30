/**
 * آزمون موتور اقلام
 * هر بررسی، یکی از قابلیت‌های ناحیه «اقلام» را می‌سنجد.
 */
import { readFileSync } from 'node:fs';
import {
  classifyLines, detectItems, mergeDuplicateItems, suggestTitleFixes,
  compareWithHistory, rejectedLines,
} from '../src/lib/ocr/items';
import { guessCategory, findUnit, cleanTitle, hasProductWord } from '../src/lib/ocr/lexicon';
import { recoverToken, amountsOf } from '../src/lib/ocr/primitives';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, info = '') {
  if (ok) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${info ? ` — ${info}` : ''}`); }
}

const raw = readFileSync(`${process.cwd()}/scripts/ocr-bench/sample-real-grocery.txt`, 'utf-8');
const analysis = detectItems(raw);
const lines = analysis.lines;
const roleOf = (needle: string) => lines.find((line) => line.text.includes(needle))?.role;

/* ---------------------------------------------------- ۱) نقش‌دهی به خطوط */
check('خط جشنواره هرگز عنوان کالا نمی‌شود', roleOf('جشنواره بهترین') === 'promo', String(roleOf('جشنواره بهترین')));
check('خط تلفن/کد اقتصادی شناسنامه‌ای شناخته می‌شود', roleOf('تلفن امور مشتریان') === 'meta');
check('سرستون جدول با چهار ستون شناخته شد', analysis.headerFields.length === 4, JSON.stringify(analysis.headerFields));
check('جمع‌بندی سند (قابل پرداخت) از اقلام جدا شد', analysis.totals.payable === 25324000, String(analysis.totals.payable));
check('مالیات سند خوانده شد', analysis.totals.tax === 417091, String(analysis.totals.tax));

/* ---------------------------------------------------- ۲) اقلام فاکتور واقعی */
check('شش قلم از فاکتور واقعی خوانده شد', analysis.items.length === 6, String(analysis.items.length));
check('هیچ عنوانی متن تبلیغاتی یا آدرس ندارد',
  !analysis.items.some((item) => /جشنواره|تلفن|آدرس|فروشگاه|کد اقتصادی/.test(item.title)),
  JSON.stringify(analysis.items.map((item) => item.title)));
check('هیچ مبلغ غیرواقعی (بیش از یک میلیارد) در اقلام نیست',
  !analysis.items.some((item) => item.total > 1_000_000_000));
check('برای هر قلم دلیل خوانده‌شدن ثبت شده است',
  analysis.items.every((item) => item.reasons.length >= 2));
check('اطمینان میانگین اقلام بالای ۶۰ است', analysis.stats.averageConfidence > 60, String(analysis.stats.averageConfidence));

/* ---------------------------------------------------- ۳) عنوان چندخطی */
const multiline = detectItems(`
فروشگاه نمونه
تعداد قیمت واحد مبلغ
روغن سرخ کردنی
بدون پالم ۸۱۰ گرم
2 ۳۹۱٬۲۷۳ ۷۸۲٬۵۴۶
جمع کل ۷۸۲٬۵۴۶
`);
check('عنوان دوخطی به یک قلم تبدیل شد', multiline.items.length === 1, JSON.stringify(multiline.items.map((i) => i.title)));
check('خط دوم عنوان به خط اول چسبید',
  multiline.items[0]?.title.includes('روغن') && multiline.items[0]?.title.includes('پالم'),
  multiline.items[0]?.title);

/* ---------------------------------------------------- ۴) ردیف گمشده */
check('ردیف گمشده با مبلغ تشخیص داده شد',
  analysis.missing.length === 1 && analysis.missing[0].amount > 1000,
  JSON.stringify(analysis.missing));

/* ---------------------------------------------------- ۵) جایگزین‌ها */
const ambiguous = detectItems(`
کالای نمونه
1 ۴۰۰٬۰۰۰ ۸۱٬۰۰۰ ۳۱۹٬۵۵۵
جمع کل ۳۱۹٬۵۵۵
`);
check('برای ردیف مبهم تفسیر جایگزین ساخته شد',
  (ambiguous.items[0]?.alternatives.length ?? 0) >= 2,
  String(ambiguous.items[0]?.alternatives.length));

/* ---------------------------------------------------- ۶) خطوط ردشده */
check('خطوط ردشده برای بازبینی کاربر لیست شده‌اند',
  rejectedLines(analysis).length >= 8, String(rejectedLines(analysis).length));

/* ---------------------------------------------------- ۷) ویرایش دستی نقش */
const rawOverride = 'سینته مغ فراکوشت\n1 ۱۰۰٬۰۰۰ ۱۰۰٬۰۰۰\nجمع کل ۱۰۰٬۰۰۰';
const before = detectItems(rawOverride);
const after = detectItems(rawOverride, undefined, { 0: 'promo' });
check('تغییر دستی نقش خط، قلم را حذف می‌کند',
  before.items.length === 1 && after.items.length === 0,
  `${before.items.length} → ${after.items.length}`);

/* ---------------------------------------------------- ۸) کیفیت ستون‌ها */
check('کیفیت هر ستون گزارش می‌شود',
  analysis.columns.length === 4 && analysis.columns.every((col) => col.present >= 0));

/* ---------------------------------------------------- ۹) واژه‌نامه اصناف */
check('دسته کالا از نامش حدس زده شد', guessCategory('روغن سرخ کردنی') === 'خواربار', String(guessCategory('روغن سرخ کردنی')));
check('واحد شمارش از متن خوانده شد', findUnit('برنج ۱۰ کیلو') === 'کیلوگرم');
check('واژه‌های کوتاه داخل واژه‌های دیگر تطبیق نمی‌خورند', !hasProductWord('جشنواره بهترین ها'));
check('نویسه‌های تبلیغاتی از عنوان پاک می‌شوند',
  !cleanTitle('★ بیسکویت کاکائویی جشنواره').includes('جشنواره'));

/* ---------------------------------------------------- ۱۰) ادغام و اصلاح عنوان */
const duplicated = detectItems(`
کاغذ A4
2 ۵۰٬۰۰۰ ۱۰۰٬۰۰۰
کاغذ A4
3 ۵۰٬۰۰۰ ۱۵۰٬۰۰۰
جمع کل ۲۵۰٬۰۰۰
`);
const merged = mergeDuplicateItems(duplicated.items);
check('ردیف‌های هم‌نام و هم‌قیمت ادغام شدند',
  duplicated.items.length === 2 && merged.items.length === 1 && merged.items[0].quantity === 5,
  JSON.stringify(merged.items.map((item) => [item.title, item.quantity])));

const fixes = suggestTitleFixes(duplicated.items, ['کاغذ A4']);
check('اصلاح خودکار عنوان بر پایه کالاهای ثبت‌شده کار می‌کند',
  fixes.every((fix) => fix.to === 'کاغذ A4'));

const changes = compareWithHistory(
  analysis.items,
  [{ title: analysis.items[0].title, unitPrice: Math.round(analysis.items[0].unitPrice * 1.5) }],
);
check('تغییر قیمت نسبت به خرید قبلی گزارش می‌شود',
  changes.length === 1 && changes[0].percent <= -30, JSON.stringify(changes));

/* ---------------------------------------------------- ۱۱) پایداری */
const again = detectItems(raw);
check('تحلیل متن یکسان، نتیجه یکسان می‌دهد',
  again.items.length === analysis.items.length && again.itemsTotal === analysis.itemsTotal);

/* ---------------------------------------------------- ۱۲) متن بی‌ربط */
const empty = detectItems('سلام، خوبی؟ امروز هوا خوب است');
check('متن غیرفاکتور هیچ قلمی نمی‌سازد', empty.items.length === 0);
check('برای متن غیرفاکتور هشدار داده می‌شود', empty.warnings.some((w) => w.includes('هیچ ردیف')));

/* ---------------------------------------- ۱۲.۵) متن OCR مخدوش (فاکتور واقعی) */
const dirty = readFileSync(`${process.cwd()}/scripts/ocr-bench/sample-real-ocr.txt`, 'utf-8');
const dirtyAnalysis = detectItems(dirty);

check('در متن مخدوش هم شش کالا شناخته می‌شود', dirtyAnalysis.items.length === 6,
  JSON.stringify(dirtyAnalysis.items.map((item) => item.title)));
check('نام کالاها از آشغال اسکن پاک است',
  dirtyAnalysis.items.every((item) => !/[|©»\[]|Aleg|Gog|\bGm\b/.test(item.title)),
  JSON.stringify(dirtyAnalysis.items.map((item) => item.title)));
check('کد چسبیده به نام کالا حذف شد',
  dirtyAnalysis.items[0].title === 'سیته مرغ با کتف فراگوشت', dirtyAnalysis.items[0].title);
check('خطوط لاتین بی‌معنا کالا نشدند',
  !dirtyAnalysis.items.some((item) => /TTI|IDOI|ogra|Vi%eee/i.test(item.title)));
check('سربرگ فروشگاه کالا نشد', !dirtyAnalysis.items.some((item) => item.title.includes('افق‌کوروش')));
check('پانویس و متن جشنواره کالا نشد',
  !dirtyAnalysis.items.some((item) => /جشنواره|امتیاز|فروشگاه/.test(item.title)));
check('مبلغ بازسازی‌شده از نویسه مخدوش جعل نمی‌شود',
  dirtyAnalysis.items.every((item) => item.unitPrice === 0 && item.total === 0));
check('ردیف‌های بی‌مبلغ برای بازبینی علامت خورده‌اند',
  dirtyAnalysis.items.every((item) => item.needsReview === true));
check('هشدار «مبلغ خوانده نشد» به کاربر داده می‌شود',
  dirtyAnalysis.warnings.some((warning) => warning.includes('هیچ مبلغی')),
  JSON.stringify(dirtyAnalysis.warnings));
check('تخفیف تنها و بی‌پشتوانه از جمع‌ها حذف شد', dirtyAnalysis.totals.discount === undefined,
  JSON.stringify(dirtyAnalysis.totals));

/* ---------------------------------------------------- ۱۲.۶) بازیابی رقم */
check('عدد با نویسه‌های شبیه رقم بازیابی می‌شود', recoverToken('QOAe,000') === 4000, String(recoverToken('QOAe,000')));
check('واژه لاتین شبیه رقم، عدد نمی‌شود', recoverToken('IDOI') === null);
check('واژه انگلیسی معمولی عدد نمی‌شود', recoverToken('P.QVeoce') === null);
check('رقم چسبیده به واژه فارسی مبلغ نمی‌شود', amountsOf('۱۸۰۵۰۵فراگوشت').length === 0);
check('جداکننده فارسی هزارگان درست خوانده می‌شود',
  amountsOf('۲۵٬۳۲۴٬۰۰۰')[0] === 25324000, String(amountsOf('۲۵٬۳۲۴٬۰۰۰')[0]));

/* ---------------------------------------------------- ۱۳) خطوط تکی */
const single = classifyLines('۲۱٬۷۰۱٬۵۳۱٬۹۵۵٬۱۸۵');
check('عدد غول‌آسا به‌عنوان ردیف کالا ثبت نمی‌شود', single[0].role === 'noise', single[0].role);

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
