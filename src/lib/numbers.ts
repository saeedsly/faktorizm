/**
 * موتور اعداد ایرانی — همان قراردادِ سمت پایتون (`ocr-service/persian_dict.py`)
 *
 * هدف: هر شکلی که یک عدد در فاکتور ایرانی نوشته می‌شود، یک عدد درست بدهد و
 * هیچ‌وقت عددِ ساختگی نسازد:
 *
 *   «۱٬۲۳۴٬۵۶۷» «1,234,567» «۱۲۳۴۵۶۷» «۱ ۲۳۴ ۵۶۷» «١٢٣٤٥٦٧» «۱۲۳/۴۵۶»
 *   «۱۲٬۵۰۰ ریال» «۹۷ میلیون» «۲.۵ میلیون» «دو میلیون و پانصد هزار»
 *   «(۱٬۲۰۰)» (منفی حسابداری) «−۵۰۰» «1O5» «S0O» «۱۲۳٫۴۵»
 *
 * در نبود دادهٔ معتبر `null` برمی‌گردد؛ صفرِ کاذب ساخته نمی‌شود.
 */

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** حرف‌هایی که در فونت چاپی به‌جای رقم خوانده می‌شوند */
const LOOKALIKE: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0', U: '0', Θ: '0', 'Ө': '0', 'ө': '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1', ']': '1', '[': '1',
  Z: '2', z: '2', Ƨ: '2',
  E: '3', A: '4', '@': '4',
  S: '5', s: '5', $: '5',
  b: '6', G: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

const UNITS: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7,
  هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14,
  پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16, هفده: 17, هیفده: 17,
  هجده: 18, هیجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50,
  شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100, یکصد: 100, دویست: 200,
  سیصد: 300, چهارصد: 400, پانصد: 500, پونصد: 500, ششصد: 600, شیشصد: 600,
  هفتصد: 700, هشتصد: 800, نهصد: 900,
};

const SCALES: Array<[string, number]> = [
  ['تریلیون', 1e12],
  ['هزار میلیارد', 1e12],
  ['میلیارد', 1e9],
  ['میلیون', 1e6],
  ['هزار', 1e3],
];

const CURRENCIES = ['ریال', 'تومان', 'تومانی', 'تومن', 'دلار', 'یورو', 'درهم', '﷼', 'IRR', 'IRT', 'USD', 'EUR'];

/** ارقام فارسی/عربی → لاتین (همیشه) */
export function latinDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

/** وقتی متن «باید عدد باشد»: حرف‌های شبیه‌رقم هم رقم می‌شوند */
function replaceLookalikes(text: string): string {
  return text.replace(/[OoQDUΘӨөIl i|!\]\[ZzƧEA@Ss$bGTBgq]/g, (ch) => LOOKALIKE[ch] ?? ch);
}

function stripCurrencies(text: string): string {
  let out = text;
  for (const word of CURRENCIES) out = out.split(word).join(' ');
  return out;
}

/** «دو میلیون و پانصد هزار» → 2500000 ؛ اگر عددی نوشته نشده باشد null */
export function parseNumberWords(text: string): number | null {
  if (!text) return null;
  const words = text
    .replace(/[^\u0600-\u06FF\u200c ]/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .split(/\s+/)
    .filter(Boolean);
  let total = 0;
  let current = 0;
  let hasNumberWord = false;
  for (const word of words) {
    if (word === 'و') continue;
    const unit = UNITS[word];
    if (unit !== undefined) {
      current += unit;
      hasNumberWord = true;
      continue;
    }
    const scale = SCALES.find(([name]) => name.replace(/\s/g, '') === word.replace(/\s/g, ''));
    if (scale) {
      total += (current || 1) * scale[1];
      current = 0;
    }
  }
  if (!hasNumberWord) return null;
  return total + current;
}

/**
 * متن → مبلغ صحیح یا null.
 * `allowWords:false` عددِ نوشتاری را قبول نمی‌کند (برای فیلدهای عددی خالص).
 */
export function parseIranAmount(
  input: string | number | null | undefined,
  options: { allowWords?: boolean } = {},
): number | null {
  const { allowWords = true } = options;
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;

  let text = latinDigits(input).trim();
  if (!text) return null;
  // درصد مبلغ نیست؛ برگرداندن نرخ به‌جای مبلغ، خطای حسابداری می‌سازد
  if (/[٪%]/.test(text)) return null;
  text = stripCurrencies(text).trim();

  // منفی: پرانتز حسابداری، خط تیرهٔ ابتدا/انتها، علامت یونیکد
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/^[-−—–]/.test(text)) {
    negative = true;
    text = text.slice(1);
  }
  if (/[-−]$/.test(text)) {
    negative = true;
    text = text.slice(0, -1);
  }
  text = text.trim();

  if (!/\d/.test(text)) {
    if (!allowWords) return null;
    const words = parseNumberWords(text);
    if (words === null) return null;
    return negative ? -words : words;
  }

  // رقم + ضریب نوشتاری: «۲.۵ میلیون»
  for (const [name, scale] of SCALES) {
    const match = new RegExp(`^([0-9][0-9\\s\\u00a0\\u2009٬،,.]*)\\s*${name}$`).exec(text);
    if (match) {
      const base = Number(match[1].replace(/[\s\u00a0\u2009٬،,]/g, ''));
      if (!Number.isFinite(base)) return null;
      const value = Math.round(base * scale);
      return negative ? -value : value;
    }
  }

  const body = replaceLookalikes(text).replace(/[^\d.,٬،٫]/g, '').replace(/٬|،/g, ',');
  if (!body) return null;

  const separators = (body.match(/[.,٫]/g) ?? []).length;
  let normalized: string;
  if (separators === 0) {
    normalized = body;
  } else {
    const lastIndex = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','), body.lastIndexOf('٫'));
    const decimals = body.length - lastIndex - 1;
    const isDecimal = separators === 1 && decimals > 0 && decimals <= 2;
    if (isDecimal) {
      normalized = `${body.slice(0, lastIndex)}.${body.slice(lastIndex + 1)}`;
    } else {
      normalized = body.replace(/[.,٫]/g, '');
    }
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || Math.abs(value) > 1e16) return null;
  const rounded = Math.round(value);
  return negative ? -rounded : rounded;
}

/** «۹٪» «(%9)» «۹ درصد» → 9 ؛ وگرنه null */
export function parseIranPercent(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = latinDigits(input).replace(/درصد/g, '٪');
  const match = /(\d{1,3})\s*[٪%]|[٪%]\s*[)\]}]?\s*\(?\s*(\d{1,3})/.exec(text);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

/** 1234567 → «۱٬۲۳۴٬۵۶۷» (یا با ارقام لاتین) */
export function formatIranAmount(value: number, options: { fa?: boolean; separator?: string } = {}): string {
  const { fa = true, separator = '٬' } = options;
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const grouped = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return sign + (fa ? grouped.replace(/\d/g, (d) => FA[Number(d)]) : grouped);
}

/** فقط ارقام یک متن: «۱۲۳/۴۵۶» → «123456» */
export function iranDigitsOnly(input: string | null | undefined): string {
  if (!input) return '';
  return replaceLookalikes(latinDigits(input)).replace(/\D/g, '');
}
