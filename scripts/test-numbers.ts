// آزمون موتور اعداد ایرانی (سمت مرورگر) — آینهٔ ocr-service/persian_dict.py
// همهٔ شکل‌های عدد در فاکتور ایرانی باید یک عدد درست بدهند و هیچ عدد ساختگی نه.
import {
  parseIranAmount, parseIranPercent, formatIranAmount, iranDigitsOnly, latinDigits,
} from '../src/lib/numbers';
import { parseNumber, formatMoney } from '../src/lib/utils';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, extra = '') {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`❌ ${name} ${extra}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `→ ${String(actual)} ≠ ${String(expected)}`);
}

/* ------------------------------------------------------------ ارقام و جداکننده */
eq('ارقام فارسی', parseIranAmount('۱۴۵'), 145);
eq('ارقام عربی', parseIranAmount('١٤٥'), 145);
eq('بدون جداکننده', parseIranAmount('۱۲۳۴۵۶۷'), 1234567);
eq('جداکننده ممیز فارسی', parseIranAmount('۱٬۲۳۴٬۵۶۷'), 1234567);
eq('جداکننده کاما', parseIranAmount('1,234,567'), 1234567);
eq('جداکننده عربی', parseIranAmount('۱،۲۳۴،۵۶۷'), 1234567);
eq('جداکننده فاصله', parseIranAmount('۱ ۲۳۴ ۵۶۷'), 1234567);
eq('جداکننده اسلش', parseIranAmount('۱۲۳/۴۵۶'), 123456);
eq('ارقام قاطی', parseIranAmount('1۲3'), 123);
eq('عدد اعشاری', parseIranAmount('۱۲٫۵'), 13);
eq('اعشاری سه‌رقمی = هزارگان', parseIranAmount('۱۲٫۴۴۹'), 12449);
eq('ارقام لاتین خالص', latinDigits('۱۲۳۴'), '1234');

/* --------------------------------------------------------------- واحد و علامت */
eq('پسوند ریال', parseIranAmount('۱۲٬۵۰۰ ریال'), 12500);
eq('پسوند تومان', parseIranAmount('۹۷٬۰۰۰٬۰۰۰ تومان'), 97000000);
eq('پرانتز منفی', parseIranAmount('(۱٬۲۰۰)'), -1200);
eq('خط تیره منفی', parseIranAmount('-۵۰۰'), -500);
eq('منفی یونیکد', parseIranAmount('−۵۰۰'), -500);

/* ------------------------------------------------------------------ ضریب‌ها */
eq('دو میلیون', parseIranAmount('۲ میلیون'), 2000000);
eq('دو و نیم میلیون', parseIranAmount('۲.۵ میلیون'), 2500000);
eq('یک میلیارد', parseIranAmount('۳ میلیارد'), 3000000000);
eq('عدد نوشتاری', parseIranAmount('دو میلیون و پانصد هزار'), 2500000);
eq('عدد نوشتاری ساده', parseIranAmount('سیصد و پنجاه'), 350);
eq('هزار تنها عدد نیست', parseIranAmount('هزار'), null);

/* ------------------------------------------------------------------ حرف‌های شبیه رقم */
eq('O به‌جای صفر', parseIranAmount('1O5'), 105);
eq('S به‌جای پنج', parseIranAmount('S0'), 50);
eq('B به‌جای هشت', parseIranAmount('B5O'), 850);

/* ------------------------------------------------------------------ درصد */
eq('درصد با ٪', parseIranPercent('۹٪'), 9);
eq('درصد پرانتزی', parseIranPercent('(%9)'), 9);
eq('درصد نوشتاری', parseIranPercent('۹ درصد'), 9);
eq('درصد در جمله', parseIranPercent('مالیات 9%'), 9);
eq('بدون درصد', parseIranPercent('جمع کل'), null);

/* ------------------------------------------------------------- هیچ عدد ساختگی */
eq('متن خالی', parseIranAmount(''), null);
eq('نامشخص', parseIranAmount('نامشخص'), null);
eq('خط تیره تنها', parseIranAmount('—'), null);
eq('درصد به‌جای مبلغ', parseIranAmount('۹٪'), null);
eq('null', parseIranAmount(null), null);

/* ------------------------------------------------------------------ قالب‌بندی */
eq('قالب فارسی', formatIranAmount(1234567), '۱٬۲۳۴٬۵۶۷');
eq('قالب منفی', formatIranAmount(-4500), '-۴٬۵۰۰');
eq('فقط ارقام', iranDigitsOnly('۱۲۳/۴۵۶'), '123456');

/* ------------------------------------------------ سازگاری با توابع قدیمی برنامه */
eq('parseNumber قدیمی', parseNumber('۱٬۲۳۴٬۵۶۷ ریال'), 1234567);
eq('parseNumber خرابی', parseNumber('نامشخص'), 0);
check('formatMoney', formatMoney(127966000, 'IRT', true).includes('۱۲۷,۹۶۶,۰۰۰'),
  formatMoney(127966000, 'IRT', true));

console.log(
  failed === 0
    ? `✅ ${passed}/${passed} بررسی عددی موفق`
    : `❌ ${failed} بررسی ناموفق از ${passed + failed}`,
);
if (failed > 0) process.exit(1);
