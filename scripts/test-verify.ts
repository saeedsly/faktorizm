// آزمون لایهٔ تأیید خوانش (فاز ۱ نقشهٔ راه)
// سه‌شاخهٔ اطمینان، بررسی حسابداری، whitelist عدد و انتخاب خودکار موتور.
// بدون شبکه و بدون مدل؛ منطق خالص مرور می‌شود.
import type { OcrVerification } from '../src/lib/types';

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

/* --------------------------------------------------- منطق آستانه (آینهٔ پایتون) */

const AUTO_CONFIRM = 85;
const REVIEW_FLOOR = 70;

function levelFor(confidence: number): OcrVerification['status'] {
  if (!Number.isFinite(confidence)) return 'unsafe';
  if (confidence >= AUTO_CONFIRM) return 'ok';
  if (confidence >= REVIEW_FLOOR) return 'review';
  return 'unsafe';
}

check('اطمینان ۹۵٪ تأییدشده است', levelFor(95) === 'ok');
check('مرز ۸۵٪ تأییدشده است', levelFor(85) === 'ok');
check('۸۴٪ بازبینی اختیاری است', levelFor(84) === 'review');
check('مرز ۷۰٪ بازبینی است', levelFor(70) === 'review');
check('۶۹٪ قابل تأیید نیست', levelFor(69) === 'unsafe');

/* --------------------------------------------------- حسابداری */

const TOL = 0.01;

function totalsMatch(items: number[], tax: number, discount: number, printed: number): boolean {
  const net = items.reduce((sum, value) => sum + value, 0);
  const expected = net + tax - discount;
  return Math.abs(expected - printed) <= Math.max(TOL, Math.abs(printed) * 0.002);
}

check('جمع هم‌خوان تأیید می‌شود', totalsMatch([1000000, 2000000], 240000, 0, 3240000));
check('اختلاف ۳۰۰٬۰۰۰ ریال گرفته می‌شود', !totalsMatch([1000000, 2000000], 240000, 0, 3540000));
check('اختلاف گرد کردن (یک ریال) تحمل می‌شود', totalsMatch([1000000], 0, 0, 1000001));
check('اختلاف ۱۰٬۰۰۰ ریال گرفته می‌شود', !totalsMatch([1000000], 0, 0, 1010000));
check('تخفیف در معادله وارد می‌شود', totalsMatch([1000000], 90000, 50000, 1040000));

function rowMismatch(qty: number, unit: number, total: number): boolean {
  return Math.abs(qty * unit - total) > Math.max(TOL, Math.abs(total) * 0.01);
}

check('ردیف هم‌خوان سالم است', !rowMismatch(2, 500000, 1000000));
check('رقم جاافتاده در ردیف گرفته می‌شود', rowMismatch(1, 20000001, 2000000));

/* --------------------------------------------------- whitelist عدد */

const LETTER_TO_DIGIT: Record<string, string> = { O: '0', o: '0', D: '0', B: '8', S: '5', I: '1', l: '1', Z: '2', G: '6' };

function cleanNumber(text: string): string {
  const latin = text
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٬,،\s]/g, '');
  const fixed = latin.replace(/[OoDBSIlZG]/g, (ch) => LETTER_TO_DIGIT[ch] ?? ch);
  return fixed.replace(/[^0-9./-]/g, '');
}

check('ارقام فارسی به لاتین تبدیل می‌شوند', cleanNumber('۱۲۳۴۵') === '12345');
check('حرف O به صفر اصلاح می‌شود', cleanNumber('1O5') === '105');
check('حرف B به هشت اصلاح می‌شود', cleanNumber('1B0') === '180');
check('حرف S به پنج اصلاح می‌شود', cleanNumber('S0') === '50');
check('جداکنندهٔ هزارگان حذف می‌شود', cleanNumber('۱٬۲۵۰٬۰۰۰') === '1250000');
check('متن غیرعددی خالی می‌شود', cleanNumber('نامشخص') === '');
check('علامت منفی حفظ می‌شود', cleanNumber('-۲۵۰۰') === '-2500');

/* --------------------------------------------------- تاریخ و شمارهٔ فاکتور */

function inRange(year: number): boolean {
  return (year >= 1390 && year <= 1405) || (year >= 2010 && year <= 2026);
}

check('سال ۱۴۰۳ شمسی مجاز است', inRange(1403));
check('سال ۱۳۸۵ شمسی رد می‌شود', !inRange(1385));
check('سال ۲۰۲۴ میلادی مجاز است', inRange(2024));
check('سال ۲۰۰۹ میلادی رد می‌شود', !inRange(2009));
check('شمارهٔ فاکتور با حرف و خط تیره پذیرفته می‌شود', /^(?=.*\d)[A-Za-z0-9\-/]{4,24}$/.test('1403-00845'));
check('شمارهٔ کوتاه رد می‌شود', !/^(?=.*\d)[A-Za-z0-9\-/]{4,24}$/.test('12'));

/* --------------------------------------------------- انتخاب خودکار موتور */

const ENGINE_PRIORITY = ['falcon', 'ppocrv6', 'ppocrv5'];

function pickEngine(availability: Record<string, boolean>): string | null {
  return ENGINE_PRIORITY.find((id) => availability[id]) ?? null;
}

check('Falcon اولویت اول است', pickEngine({ falcon: true, ppocrv6: true, ppocrv5: true }) === 'falcon');
check('نبود Falcon، PP-OCRv6 انتخاب می‌شود',
  pickEngine({ falcon: false, ppocrv6: true, ppocrv5: true }) === 'ppocrv6');
check('نبود هر دو، PP-OCRv5 می‌ماند',
  pickEngine({ falcon: false, ppocrv6: false, ppocrv5: true }) === 'ppocrv5');
check('هیچ موتوری نیست، null برمی‌گردد', pickEngine({}) === null);

/* --------------------------------------------------- بدترین وضعیت بین صفحه‌ها */

const RANK: Record<OcrVerification['status'], number> = { ok: 0, review: 1, unsafe: 2 };

function worst(statuses: OcrVerification['status'][]): OcrVerification['status'] {
  return statuses.reduce((acc, status) => (RANK[status] > RANK[acc] ? status : acc), 'ok' as OcrVerification['status']);
}

check('دو صفحهٔ سالم، تأییدشده', worst(['ok', 'ok']) === 'ok');
check('یک صفحهٔ نارنجی، کل سند نارنجی', worst(['ok', 'review']) === 'review');
check('یک صفحهٔ قرمز، کل سند قرمز', worst(['review', 'unsafe']) === 'unsafe');
check('خروجی تأییدنشده هرگز سبز نمی‌شود', worst(['ok']) !== 'unsafe');

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
