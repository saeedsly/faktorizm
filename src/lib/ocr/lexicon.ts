/**
 * واژه‌نامه اصناف — برای اینکه برنامه بفهمد کدام خط «نام کالا» است
 *
 * متن OCR فاکتور پر از خطوطی است که کالا نیستند: آدرس، تلفن، شعار فروشگاه،
 * متن جشنواره، جمع‌بندی. در مقابل، خطوط کالا معمولاً واژه‌هایی از دنیای
 * خواربار و لوازم خانگی دارند. این فهرست همان چیزی است که به موتور اقلام
 * اجازه می‌دهد بدون ستون‌بندی و بدون حدس کورکورانه تصمیم بگیرد.
 */

/** واژه‌های کالا (خواربار، لبنیات، بهداشتی، خانگی، نوشیدنی) */
export const PRODUCT_WORDS = [
  // لبنیات
  'شیر', 'ماست', 'پنیر', 'کره', 'خامه', 'دوغ', 'بستنی', 'کشک', 'سرشیر',
  // خواربار
  'روغن', 'برنج', 'ماکارونی', 'رشته', 'آرد', 'قند', 'شکر', 'نمک', 'رب گوجه', 'سس',
  'سرکه', 'ادویه', 'زعفران', 'چای', 'قهوه', 'نسکافه', 'شکلات', 'کاکائو',
  // تنقلات و شیرینی
  'بیسکویت', 'ویفر', 'کلوچه', 'کیک', 'پفک', 'چیپس', 'اسنک', 'آدامس', 'آبنبات',
  'شیرینی', 'حلوا', 'گز', 'سوهان',
  // نوشیدنی
  'آبمیوه', 'نکتار', 'نوشابه', 'آب معدنی', 'آبمیوه', 'شربت', 'ماءالشعیر', 'انرژی', 'کمپوت',
  // پروتئین
  'مرغ', 'گوشت', 'ماهی', 'تخم مرغ', 'سوسیس', 'کالباس', 'همبرگر', 'تن ماهی', 'میگو',
  // حبوبات و غلات
  'لوبیا', 'نخود', 'عدس', 'ماش', 'بلغور', 'جو پرک', 'گندم', 'ذرت', 'کنجد',
  // میوه و سبزی
  'سیب', 'موز', 'پرتقال', 'نارنگی', 'انار', 'هلو', 'انگور', 'هندوانه', 'طالبی',
  'خیار', 'گوجه', 'سیب‌زمینی', 'سیب زمینی', 'پیاز', 'سیر', 'هویج', 'کدو',
  'بادمجان', 'فلفل', 'کلم', 'کاهو', 'اسفناج', 'جعفری', 'ریحان', 'نعناع',
  // خشکبار
  'پسته', 'بادام', 'گردو', 'فندق', 'کشمش', 'خرما', 'انجیر', 'توت', 'آلو',
  // بهداشتی و شوینده
  'مایع', 'شامپو', 'صابون', 'دستمال', 'پودر', 'شوینده', 'سفیدکننده', 'ژل',
  'خمیردندان', 'مسواک', 'پوشک', 'نوار بهداشتی', 'پد بهداشتی', 'کرم', 'لوسیون', 'اسپری',
  // خانه و آشپزخانه
  'کیسه', 'ظرف', 'قاشق', 'چنگال', 'لیوان', 'بشقاب', 'دستمال کاغذی',
  'فویل', 'سلفون', 'شمع', 'کبریت', 'فیلتر', 'باتری', 'لامپ',
  // عمومی
  'بسته', 'شانه', 'کیلویی', 'بسته‌بندی', 'بسته بندی', 'ماست', 'دوغ',
];

/** واژه‌هایی که *قطعاً* تبلیغ/جشنواره/پانویس‌اند؛ حتی اگر واژه کالا هم داشته باشند */
export const STRONG_PROMO_WORDS = [
  'جشنواره', 'قرعه‌کشی', 'قرعه کشی', 'برندهای حامی', 'هر یک میلیون', 'هر ۲۵۵ هزار',
  'هر یک صد هزار', 'یک امتیاز مازاد', 'مشتری گرامی', 'به ما اعتماد', 'خرید شما',
  'کیف پول', 'اپلیکیشن', 'شماره پیگیری', 'کد رهگیری', 'ساعت کاری', 'رهگیری مرسوله',
];

/** واژه‌هایی که خط را «تبلیغ/پانویس» می‌کند، نه کالا — تنها وقتی واژه کالا نباشد */
export const PROMO_WORDS = [
  'تخفیف ویژه', 'هدیه', 'شرایط', 'قوانین', 'امتیاز', 'حامی', 'مبلغ فاکتور', 'طرح',
  'تشکر', 'شعبه دیگر', 'اینترنت', 'اعتبار',
];

/** واژه‌های سرستون بلوک پرداخت/خریدار که هیچ‌وقت نام کالا نیستند */
export const PAYMENT_WORDS = [
  'مبلغ پرداخت', 'شماره مرجع', 'کارتخوان', 'دستگاه کارتخوان', 'شبکه پرداخت',
  'خریدار', 'فروشنده', 'مبلغ پرداختی', 'شماره تراکنش', 'شماره پیگیری بانک',
  'مانده', 'بدهکار', 'بستانکار', 'شرح', 'کد کالا', 'بارکد کالا',
];

/** واژه‌های آدرس/فروشگاه که خط را شناسنامه‌ای می‌کند */
export const PLACE_WORDS = ['فروشگاه', 'هایپر', 'سوپرمارکت', 'بازار', 'خیابان', 'بلوار', 'کوچه', 'پلاک', 'واحد'];

/** واژه‌های واحد شمارش که معمولاً بعد از عدد می‌آیند */
export const UNIT_WORDS: Record<string, string> = {
  'عدد': 'عدد', 'دانه': 'دانه', 'بسته': 'بسته', 'کارتن': 'کارتن',
  'کیلو': 'کیلوگرم', 'کیلوگرم': 'کیلوگرم', 'گرم': 'گرم', 'لیتر': 'لیتر',
  'میلی': 'میلی‌لیتر', 'بطری': 'بطری', 'قوطی': 'قوطی', 'شانه': 'شانه',
  'برگ': 'برگ', 'متر': 'متر', 'حلقه': 'حلقه',
};

/** دسته‌بندی خودکار بر پایه واژه‌ها */
const CATEGORIES: Array<{ name: string; words: string[] }> = [
  { name: 'لبنیات', words: ['شیر', 'ماست', 'پنیر', 'کره', 'خامه', 'دوغ', 'بستنی', 'کشک'] },
  { name: 'نوشیدنی', words: ['آبمیوه', 'نکتار', 'نوشابه', 'شربت', 'ماءالشعیر', 'کمپوت', 'انرژی'] },
  { name: 'تنقلات و شیرینی', words: ['بیسکویت', 'ویفر', 'کیک', 'کلوچه', 'پفک', 'چیپس', 'شکلات', 'آدامس', 'شیرینی'] },
  { name: 'خواربار', words: ['روغن', 'برنج', 'ماکارونی', 'آرد', 'قند', 'شکر', 'نمک', 'رب', 'سس', 'چای', 'ادویه'] },
  { name: 'پروتئین', words: ['مرغ', 'گوشت', 'ماهی', 'تخم', 'سوسیس', 'کالباس', 'تن ماهی'] },
  { name: 'میوه و سبزی', words: ['سیب', 'موز', 'پرتقال', 'خیار', 'گوجه', 'پیاز', 'سیب‌زمینی', 'کاهو', 'هویج'] },
  { name: 'بهداشتی و شوینده', words: ['مایع', 'شامپو', 'صابون', 'دستمال', 'شوینده', 'سفیدکننده', 'خمیردندان', 'پوشک'] },
  { name: 'خانه و آشپزخانه', words: ['کیسه', 'ظرف', 'قاشق', 'لیوان', 'فویل', 'سلفون', 'شمع', 'کبریت', 'باتری', 'لامپ'] },
  { name: 'خشکبار', words: ['پسته', 'بادام', 'گردو', 'فندق', 'کشمش', 'خرما', 'انجیر'] },
];

const norm = (text: string) => text
  .replace(/[يى]/g, 'ی')
  .replace(/[كک]/g, 'ک')
  .replace(/[‌-‏]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const PRODUCT_SET = PRODUCT_WORDS.map(norm);
const PROMO_SET = PROMO_WORDS.map(norm);
const STRONG_PROMO_SET = STRONG_PROMO_WORDS.map(norm);
const PAYMENT_SET = PAYMENT_WORDS.map(norm);
const PLACE_SET = PLACE_WORDS.map(norm);

/** واژه‌های چندبخشی، بدون فاصله و با فاصله، هر دو بررسی می‌شوند */
function wordMatch(flat: string, spaced: string, word: string): boolean {
  const target = norm(word);
  if (target.includes(' ')) return ` ${spaced} `.includes(` ${target} `) || flat.includes(target.replace(/\s+/g, ''));
  // واژه‌های کوتاه فقط به‌صورت کامل؛ واژه‌های بلند با پسوند/پیشوند فارسی هم می‌خوانند
  const boundary = `(?:^|[^\\p{L}\\p{N}])${target}${target.length >= 4 ? '' : '(?:$|[^\\p{L}\\p{N}])'}`;
  return new RegExp(boundary, 'u').test(spaced);
}

/** آیا خط واژه کالا دارد؟ */
export function hasProductWord(text: string): boolean {
  const spaced = norm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const flat = spaced.replace(/\s+/g, '');
  return PRODUCT_SET.some((word) => wordMatch(flat, spaced, word));
}

/** آیا خط بوی تبلیغ/جشنواره می‌دهد؟ (واژه‌های قطعی یا واژه‌های ضعیف بدون نام کالا) */
export function looksPromotional(text: string): boolean {
  const spaced = norm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const flat = spaced.replace(/\s+/g, '');
  if (STRONG_PROMO_SET.some((word) => wordMatch(flat, spaced, word))) return true;
  return PROMO_SET.some((word) => wordMatch(flat, spaced, word)) && !PRODUCT_SET.some((word) => wordMatch(flat, spaced, word));
}

/** سرستون یا خط بلوک پرداخت (شماره مرجع، کارتخوان، خریدار…) */
export function looksLikePaymentHeader(text: string): boolean {
  const spaced = norm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const flat = spaced.replace(/\s+/g, '');
  return PAYMENT_SET.some((word) => wordMatch(flat, spaced, word));
}

/** آدرس/نام فروشگاه */
export function looksLikePlace(text: string): boolean {
  const spaced = norm(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const flat = spaced.replace(/\s+/g, '');
  return PLACE_SET.some((word) => wordMatch(flat, spaced, word));
}

/** دسته تقریبی کالا از نامش */
export function guessCategory(title: string): string | undefined {
  const flat = norm(title);
  for (const group of CATEGORIES) {
    if (group.words.some((word) => flat.includes(norm(word)))) return group.name;
  }
  return undefined;
}

/** واحد شمارش داخل متن */
export function findUnit(text: string): string | undefined {
  const flat = norm(text);
  for (const [word, unit] of Object.entries(UNIT_WORDS)) {
    if (new RegExp(`(^|\\s)${norm(word)}(\\s|$)`).test(flat)) return unit;
  }
  return undefined;
}

/**
 * پاک‌سازی نام کالا از چیزهایی که OCR از ستون‌های کنار چسبانده:
 * کد کالا، واحد، نویسه‌های تحریف‌شده و واژه‌های تبلیغاتی.
 */
export function cleanTitle(raw: string): string {
  const title = norm(raw)
    // رقم چسبیده به واژه («۱۸۰۵۰۵فراگوشت») را جدا می‌کند تا کد حذف شود
    .replace(/([0-9۰-۹]+)([\u0621-\u064A\u066E-\u06D3])/g, '$1 $2')
    .replace(/([\u0621-\u064A\u066E-\u06D3])([0-9۰-۹]+)/g, '$1 $2')
    .replace(/[★☆•●▪◦※\[\]{}«»"'`©®]/g, ' ')
    .replace(/(^|\s)(?:جشنواره|تخفیف ویژه|هدیه|امتیاز)(?=\s|$)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = title.split(' ').filter((word) => word.length > 0);
  const persianWords = parts.filter((word) => /[\u0621-\u064A\u066E-\u06D3]{2,}/.test(word)).length;
  const cleaned = parts.filter((word) => {
    // رقم چسبیده (کد کالا یا مبلغی که OCR داخل عنوان انداخته)
    if (/^[0-9۰-۹]{4,}$/.test(word)) return false;
    // حرف تک‌حرفی: نویز
    if (word.length === 1) return false;
    // واژه لاتین بی‌معنا («Aleg»، «Gm»)، ولی «A4» کد کالاست و می‌ماند
    if (persianWords >= 2 && /^[A-Za-z]{2,}$/.test(word)) return false;
    return true;
  });
  return (cleaned.length ? cleaned : parts).join(' ').trim();
}

/** کد کالا/بارکد احتمالی در متن خط */
export function findItemCode(text: string): string | undefined {
  const digits = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const match = digits.match(/(?:^|\s)(\d{5,14})(?=\s|$)/);
  if (!match) return undefined;
  // کدی که شبیه مبلغ با جداکننده نیست و طولش با شماره تلفن (۱۱ رقم با ۰۹) فرق دارد
  const code = match[1];
  if (code.startsWith('09') && code.length === 11) return undefined;
  return code.length >= 5 ? code : undefined;
}
