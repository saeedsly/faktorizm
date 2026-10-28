/**
 * موتور تصحیح خروجی OCR — لایه اول «دستیار خوانش فاکتور»
 *
 * خروجی Tesseract روی اسناد فارسی معمولا با این مشکلات همراه است:
 *  - قاطی‌شدن ارقام فارسی/عربی/لاتین و شکل‌های هم‌شکل (O/0، I/1، S/5)
 *  - جدا افتادن گروه‌های سه‌تایی اعداد با فاصله، ممیز فارسی ٫ و جداگرهای مختلف
 *  - فرم‌های عربی حروف (ك/ي/ة/أ/ؤ/ئ) و کشیده (ـ)
 * این ماژول جبرگرا و کاملا آفلاین، متن و اعداد را نرمال و قابل اتکا می‌کند.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** یکسان‌سازی ارقام فارسی و عربی به رقم لاتین (بدون تغییر بقیه کاراکترها) */
export function unifyDigits(input: string): string {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

const LETTER_MAP: Record<string, string> = {
  'ك': 'ک', 'ڪ': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',
  'ي': 'ی', 'ى': 'ی', 'ﻱ': 'ی', 'ﻲ': 'ی', 'ې': 'ی',
  'ة': 'ه', 'ۀ': 'ه', 'ە': 'ه', 'ﻪ': 'ه',
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ﺍ': 'ا',
  'ؤ': 'و', 'و': 'و', 'ﺅ': 'و',
  'ئ': 'ی', 'ء': '',
  'ڕ': 'ر', 'ژ': 'ژ',
};

/** نرمال‌سازی حروف، فاصله مجازی، کشیده و علائم */
export function normalizeLetters(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === 'ـ') continue; // حذف کشیده
    out += LETTER_MAP[ch] ?? ch;
  }
  return out
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, ' ') // کاراکترهای نامرئی جهت‌نما
    .replace(/[٬﹐，]/g, ',') // جداگر هزارگان فارسی/عربی/تمام‌عرض → ویرگول
    .replace(/٫/g, '.') // ممیز فارسی → ممیز لاتین
    .replace(/٪|﹪/g, '%')
    .replace(/[ﹰ-ﹴ]/g, '') // اعراب کشیده
    .replace(/[^\S\n]+/g, ' ') // فشرده‌سازی فاصله‌ها با حفظ شکست خط
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** نرمال‌سازی کامل متن خام OCR */
export function normalizeOcrText(text: string): string {
  return normalizeLetters(unifyDigits(text));
}

/**
 * تصحیح اشتباهات رایج OCR فقط داخل یک توکن عددی.
 * حروف هم‌شکل با رقم فقط وقتی تبدیل می‌شوند که توکن عمدتا عددی باشد.
 */
function fixNumericConfusions(token: string): string {
  const digitLike = token.replace(/[0-9,.\s]/g, '');
  const digitCount = (token.match(/[0-9]/g) || []).length;
  if (digitCount === 0) return token;
  // اگر بیش از دو کاراکتر غیرعددی هم‌شکل داریم، احتمالا شماره سریال ترکیبی است و دست نمی‌زنیم
  const confusable = /[OIlSBoZGs]/g;
  const hits = (digitLike.match(confusable) || []).length;
  if (hits > 2) return token;
  return token
    .replace(/O/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/G/g, '6');
}

export interface NumberToken {
  /** متن خام نرمال‌شده توکن */
  raw: string;
  /** مقدار عددی */
  value: number;
  /** آیا علامت درصد کنارش بوده */
  percent: boolean;
  /** موقعیت شروع در خط نرمال‌شده */
  index: number;
}

const NUM_RUN = /[0-9OIlSBoZGs][0-9OIlSBoZGs,.\s]*[0-9OIlSBoZGs]|[0-9OIlSBoZGs]/g;

/**
 * استخراج مطمئن اعداد از یک خط، با چسباندن گروه‌های هزارگان که با فاصله جدا شده‌اند.
 * مثلا «مبلغ 12 000 000 ریال» → یک عدد 12000000،
 * اما «5 320000 1600000» (ستون‌های جدول) → سه عدد جدا.
 */
export function extractNumberTokens(line: string): NumberToken[] {
  const unified = unifyDigits(line).replace(/[٬﹐，]/g, ',');
  const tokens: NumberToken[] = [];
  const re = new RegExp(NUM_RUN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(unified)) !== null) {
    const run = m[0].trim().replace(/\s+/g, ' ');
    const after = unified.slice(m.index + m[0].length, m.index + m[0].length + 2);
    const percent = /\s*%/.test(after);
    const groups = run.split(' ');

    const emit = (raw: string, index: number) => {
      const cleaned = fixNumericConfusions(raw.replace(/,/g, ''));
      const value = Number.parseFloat(cleaned);
      if (Number.isFinite(value)) tokens.push({ raw: cleaned, value, percent, index });
    };

    if (groups.length === 1) {
      emit(groups[0], m.index);
      continue;
    }
    // الگوی هزارگان: گروه اول ۱ تا ۳ رقم، بقیه گروه‌ها دقیقا ۳ رقم
    const isThousands = groups.slice(1).every((g) => /^\d{3}$/.test(g.replace(/,/g, '')))
      && /^\d{1,3}$/.test(groups[0].replace(/,/g, ''));
    if (isThousands) {
      emit(groups.join(''), m.index);
    } else {
      // ستون‌های جدول: هر گروه یک عدد مستقل
      let cursor = m.index;
      for (const g of groups) { emit(g, cursor); cursor += g.length + 1; }
    }
  }
  return tokens;
}

/** راحت‌ترین ورودی: همه مقادیر عددی یک خط */
export function extractNumbers(line: string): number[] {
  return extractNumberTokens(line).map((t) => t.value);
}

/** مبالغ معنادار (اعداد بزرگ که ارزش پولی دارند) */
export function extractAmounts(line: string): number[] {
  return extractNumberTokens(line)
    .filter((t) => !t.percent && t.value >= 100)
    .map((t) => t.value);
}

/**
 * تبدیل متن عدد آلوده به مبلغ، با صرف‌نظر از واحد پول و کلمات.
 * برای خطوط لنگر‌دار (مثل «قابل پرداخت: ...») استفاده می‌شود.
 */
export function parseAmountText(text: string): number {
  const amounts = extractAmounts(text);
  return amounts.length ? Math.max(...amounts) : 0;
}

/** تبدیل امن رشته تاریخ/شماره سریال: فقط ارقام و جداگرهای مجاز می‌مانند */
export function cleanSerial(text: string): string {
  return unifyDigits(text)
    .replace(/[^\w\-/]/g, (ch) => (/\d/.test(ch) ? ch : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** الگوی تاریخ شمسی با هر جداگر و رقم عربی/فارسی/لاتین */
export const PERSIAN_DATE_RE = /1[34]\d{2}[/\-.,]\d{1,2}[/\-.,]\d{1,2}/;

/** کد اقتصادی/ملی/پستی (۶ تا ۱۲ رقم که ممکن است با فاصله افتاده باشد) */
export function extractCode(line: string): string {
  const compact = unifyDigits(line).replace(/\s+/g, '');
  const m = compact.match(/\d{6,12}/);
  return m ? m[0] : '';
}

/** شماره تلفن/موبایل ایرانی */
export function extractPhone(line: string): string {
  const m = unifyDigits(line).replace(/[\s-]/g, '').match(/(?:0|98)?9\d{9}|0\d{2,3}\d{7,8}/);
  return m ? m[0] : '';
}
