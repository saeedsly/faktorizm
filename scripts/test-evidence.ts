/**
 * آزمون کارت «بازبینی فیلد‌به‌فیلد».
 *
 * بررسی می‌کند که هر فیلد استخراج‌شده به خط مبدأ خودش گره بخورد، مقدارِ نبوده
 * «missing» بماند (هیچ عدد ساختگی)، و شمارش خلاصه درست باشد.
 */
import { parseInvoiceText } from '../src/lib/ocr/parser';
import { buildFieldEvidence, evidenceSummary, digitsOf } from '../src/lib/ocr/evidence';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SAMPLE = [
  'فروشگاه لوازم خانگی آرین',
  'شماره فاکتور ۱۴۰۳۲۲۸۷ تاریخ ۱۴۰۴/۰۵/۱۲',
  'خریدار شرکت پخش کالای پارس',
  'شرح کالا تعداد مبلغ واحد مبلغ کل',
  'لپ‌تاپ لنوو 2 ۴۸٬۵۰۰٬۰۰۰ ۹۷٬۰۰۰٬۰۰۰',
  'کابل یک متری 10 ۴۵۰٬۰۰۰ ۴٬۵۰۰٬۰۰۰',
  'جمع کل ۱۰۱٬۵۰۰٬۰۰۰',
  'مالیات بر ارزش افزوده ۹٪ ۹٬۱۳۵٬۰۰۰',
  'مبلغ قابل پرداخت ۱۱۰٬۶۳۵٬۰۰۰',
].join('\n');

function main() {
  console.log('— فیلد‌به‌فیلد روی نمونهٔ سالم —');
  const parsed = parseInvoiceText(SAMPLE, 92, 9);
  const ev = buildFieldEvidence(parsed, SAMPLE);
  const byField = Object.fromEntries(ev.map((e) => [e.field, e]));

  check('همهٔ هشت فیلد شاهد دارند', ev.length === 8, `${ev.length}`);
  check('شماره سند خوانده شد', byField.number.value === parsed.number && parsed.number.length > 0, parsed.number);
  check('شماره به خط برچسب‌دار گره خورد', byField.number.source.includes('شماره فاکتور'), byField.number.source);
  check('ناحیهٔ شماره «سربرگ» است', byField.number.region === 'سربرگ', byField.number.region);
  check('تاریخ خوانده و به همان خط گره خورد', !!parsed.date && byField.date.source.includes('تاریخ'), byField.date.source);
  check('جمع کل > 0 و از خط «قابل پرداخت»', byField.total.value === String(parsed.total) && /قابل\s*پرداخت/.test(byField.total.source), byField.total.source);
  check('مالیات از خط مالیات', /مالیات/.test(byField.taxTotal.source), byField.taxTotal.source);
  check('اقلام شمارش شد', byField.items.status === 'ok' && /^\d+ ردیف$/.test(byField.items.value), byField.items.value);

  const s = evidenceSummary(ev);
  check('خلاصه جمع‌ها با فهرست می‌خواند', s.total === ev.length && s.ok + s.review + s.missing === ev.length);

  console.log('— هیچ داده‌ای ساخته نمی‌شود —');
  const empty = parseInvoiceText('یک متن بی‌ربط بدون هیچ عدد و برچسب فاکتور', 40, 9);
  const evEmpty = buildFieldEvidence(empty, 'یک متن بی‌ربط بدون هیچ عدد و برچسب فاکتور');
  const emptyNumber = evEmpty.find((e) => e.field === 'number')!;
  check('شمارهٔ نبوده = missing', emptyNumber.status === 'missing');
  check('مقدار نبوده خالی است (نه صفر ساختگی)', emptyNumber.value === '');
  check('راهنمای دستی دارد', !!emptyNumber.hint);
  const emptyTotal = evEmpty.find((e) => e.field === 'total')!;
  check('جمع کل نبوده ساخته نمی‌شود', emptyTotal.value === '' && emptyTotal.status === 'missing');

  console.log('— اطمینان پایین ⇒ نیاز به بازبینی —');
  const low = parseInvoiceText(SAMPLE, 30, 9);
  const evLow = buildFieldEvidence(low, SAMPLE);
  check('فیلدی با اطمینان < ۷۰ «review» است',
    evLow.some((e) => e.confidence > 0 && e.confidence < 70 && e.status === 'review'));

  console.log('— ارقام فارسی/عربی در تطبیق خط —');
  check('تبدیل ارقام فارسی', digitsOf('۱۲۳') === '123');
  check('تبدیل ارقام عربی', digitsOf('٣٤٥') === '345');
  check('جداکننده‌ها نادیده گرفته می‌شوند', digitsOf('۱٬۲۳۴/۵') === '12345');

  console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} موفق، ${fail} ناموفق`);
  if (fail) process.exit(1);
}

main();
