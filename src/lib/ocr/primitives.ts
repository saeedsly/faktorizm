/**
 * پایه‌های مشترک فهم متن فاکتور
 *
 * همه لایه‌های فهم (فهم نوشتاری، موتور اقلام، توصیه‌ها) از همین توابع استفاده
 * می‌کنند: یکسان‌سازی ارقام فارسی/عربی، خواندن اعداد با جداکننده نویزی،
 * تشخیص سرستون، تشخیص خطوط جمع‌بندی و خطوط شناسنامه‌ای، و نقش‌دهی اعداد.
 */
export interface Roles { qty?: number; unitPrice?: number; discount?: number; tax?: number; total?: number }

/** دانش ذخیره‌شده از فروشنده؛ به خوانش همان فروشنده کمک می‌کند */
export interface VendorHint {
  header: string[];
  totalsKeywords: string[];
  taxRate?: number;
  currency?: 'IRR' | 'IRT';
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی/عربی به لاتین */
export function unifyDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** نرمال‌سازی کلیدواژه برای تطبیق و کلیدسازی (نام فروشنده، سرستون…) */
export function normalizeKeyword(word: string): string {
  return normalizeWord(word);
}

/** نرمال‌سازی برای تطبیق کلیدواژه: حذف نیم‌فاصله، علائم و یکسان‌سازی حروف */
export function normalizeWord(word: string): string {
  return word
    .replace(/[\u200c-\u200f\u202a-\u202e]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/[كڪ]/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[^\u0600-\u06FFA-Za-z0-9]/g, '')
    .toLowerCase();
}

/** فاصله ویرایشی تا سقف ۲ — برای تحمل غلط تایپی OCR */
export function editDistance(a: string, b: string, limit = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
    if (Math.min(...prev) > limit) return limit + 1;
  }
  return prev[b.length];
}

/** آیا یکی از واژه‌های خط به واژه مرجع نزدیک است؟ */
export function hasWord(line: string, reference: string, limit = 1): boolean {
  const target = normalizeWord(reference);
  for (const raw of line.split(/\s+/)) {
    const word = normalizeWord(raw);
    if (!word) continue;
    if (word === target) return true;
    // واژه‌های کوتاه فقط با تطبیق دقیق پذیرفته می‌شوند تا خطا زیاد نشود؛
    // واژه‌های بلند تا دو نویسه خطای تایپی OCR را تحمل می‌کنند
    const tolerance = word.length >= 6 && target.length >= 5 ? limit + 1 : limit;
    if (target.length >= 4 && word.length >= 3 && editDistance(word, target, tolerance) <= tolerance) return true;
    // واژه چسبیده به عدد («پرداختی۲۵۳۲۴۰۰۰»)
    const lettersOnly = word.replace(/[0-9]/g, '');
    if (lettersOnly !== word && lettersOnly.length >= 4 && editDistance(lettersOnly, target, tolerance) <= tolerance) return true;
  }
  return false;
}

/** آیا کلیدواژه (چندواژه‌ای) در خط هست؟ فاصله‌ها و نیم‌فاصله نادیده گرفته می‌شود */
export function containsPhrase(line: string, phrase: string): boolean {
  const flat = normalizeWord(line);
  return flat.includes(normalizeWord(phrase));
}

export const NUMBER_RUN = /[0-9][0-9\u060c\u066b\u066c,.]*/g;

/**
 * تفسیر یک رشته عددی OCR.
 * «۱۳٫۵۹۵،۵۰۵» یعنی ۱۳٬۵۹۵٬۵۰۵ (جداکننده‌ها نویزی‌اند) و «۱۲٫۵» یعنی ۱۲٫۵.
 */
export function parseAmountToken(token: string): number | null {
  const latin = unifyDigits(token).trim();
  if (!latin) return null;
  const groups = latin.split(/[٬،٫,،]/).filter((g) => g.length > 0);
  if (!groups.length) return null;
  const digitsOnly = groups.join('');
  if (!/^\d+$/.test(digitsOnly)) return null;
  if (groups.length === 1) return Number(digitsOnly);
  const tails = groups.slice(1);
  const allThree = tails.every((g) => g.length === 3);
  if (allThree) return Number(digitsOnly);
  const last = tails[tails.length - 1];
  if (last.length <= 2 && groups.slice(1, -1).every((g) => g.length === 3)) {
    const whole = Number([groups[0], ...groups.slice(1, -1)].join(''));
    return Number(`${whole}.${last}`);
  }
  // قالب نامعتبر (مثل ۱۲٫۳۴٫۵): عدد را از راه thousand-grouping می‌خوانیم
  return Number(digitsOnly);
}

/** همه اعداد یک خط، به ترتیب ظهور در متن (راست‌به‌چپ تصویر) */
export function amountsOf(line: string): number[] {
  const out: number[] = [];
  const latin = unifyDigits(line);
  for (const match of latin.match(NUMBER_RUN) ?? []) {
    const value = parseAmountToken(match);
    if (value !== null && Number.isFinite(value)) out.push(value);
  }
  return out;
}

// ------------------------------------------------------------------ سرستون‌ها

export const HEADER_FIELDS: Array<{ field: keyof Roles; words: string[] }> = [
  { field: 'discount', words: ['تخفیف', 'تخف', 'کسور', 'discount'] },
  { field: 'tax', words: ['مالیات', 'vat', 'tax', 'عوارض'] },
  { field: 'total', words: ['قابل پرداخت', 'مبلغ قابل', 'مبلغ نهایی', 'مبلغ کل', 'قیمت کل', 'مبلغ'] },
  { field: 'unitPrice', words: ['قیمت مصرف', 'قیمت واحد', 'مبلغ واحد', 'قیمت', 'نرخ', 'فی'] },
  { field: 'qty', words: ['تعداد', 'مقدار', 'عدد', 'qty'] },
];

/** ترتیب ستون‌های جدول را از خط سرستون می‌فهمد */
export function readHeader(line: string): Array<keyof Roles> {
  const flat = normalizeWord(line);
  const found: Array<{ field: keyof Roles; at: number }> = [];
  for (const { field, words } of HEADER_FIELDS) {
    for (const word of words) {
      const at = flat.indexOf(normalizeWord(word));
      if (at >= 0) {
        found.push({ field, at });
        break;
      }
    }
  }
  found.sort((a, b) => a.at - b.at);
  // ستون‌های تکراری حذف می‌شوند تا نگاشت با اعداد درست بماند
  const seen = new Set<string>();
  return found
    .map((f) => f.field)
    .filter((f) => (seen.has(f) ? false : (seen.add(f), true)));
}

/** خط سرستون جدول است؟ (دست‌کم دو نوع ستون داشته باشد و عدد نباشد) */
export function isHeaderLine(line: string, fields: Array<keyof Roles>): boolean {
  return fields.length >= 2 && amountsOf(line).length === 0;
}

// ------------------------------------------------------------------ خطوط نویزی

export const META_WORDS = [
  'کد اقتصادی', 'شناسه ملی', 'کد ملی', 'تلفن', 'فکس', 'سایت', 'وب سایت', 'اینترنت',
  'شماره مرجع', 'شماره کارت', 'شماره حساب', 'شبا', 'کد پستی', 'کدپستی', 'امور مشتریان',
  'آدرس', 'نشانی', 'شعبه', 'تاریخ', 'ساعت', 'سریال', 'کد رهگیری', 'بارکد',
];

export function isMetaLine(line: string): boolean {
  return META_WORDS.some((word) => containsPhrase(line, word) || hasWord(line, word, 1));
}

export const SUMMARY_KEYS = {
  payable: ['مجموع پرداخت', 'مبلغ پرداخت', 'قابل پرداخت', 'مبلغ قابل', 'مبلغ نهایی', 'پرداختی'],
  preDiscount: ['جمع کل قبل', 'قبل از تخفیف', 'جمع کل', 'جمع اقلام'],
  discount: ['سود شما', 'مجموع تخفیف', 'تخفیف کل'],
  tax: ['VAT', 'مالیات', 'ارزش افزوده'],
};

export type SummaryKind = keyof typeof SUMMARY_KEYS;

/** نوع خط جمع‌بندی؛ null یعنی خط جمع‌بندی نیست */
export function summaryKind(
  line: string,
  requireAmount = true,
  extra: Partial<Record<SummaryKind, string[]>> = {},
): SummaryKind | null {
  if (requireAmount && amountsOf(line).length === 0) return null;
  for (const key of Object.keys(extra) as SummaryKind[]) {
    for (const phrase of extra[key] ?? []) {
      if (containsPhrase(line, phrase)) return key;
    }
  }
  for (const key of ['tax', 'discount', 'preDiscount', 'payable'] as SummaryKind[]) {
    for (const phrase of SUMMARY_KEYS[key]) {
      if (containsPhrase(line, phrase)) return key;
      if (phrase.length >= 4 && hasWord(line, phrase, 1) && normalizeWord(line).includes(normalizeWord(phrase).slice(0, 4))) {
        return key;
      }
    }
  }
  // کلیدواژه‌های تک‌واژه‌ای با تحمل غلط تایپی
  const words: Array<[SummaryKind, string]> = [
    ['payable', 'پرداخت'],
    ['discount', 'تخفیف'],
    ['tax', 'مالیات'],
  ];
  for (const [kind, word] of words) {
    if (hasWord(line, word, 1)) return kind;
  }
  return null;
}

// ------------------------------------------------------------------ اصلاح ریاضی

/** نزدیک‌ترین حالت با یک رقم جابه‌جا/تکراری؛ اگر معادله بسازد برمی‌گرداند */
export function repairValue(expected: number, actual: number): number | null {
  if (!expected || !actual) return null;
  if (Math.abs(expected - actual) / Math.max(actual, 1) <= 0.02) return actual;
  const digits = String(Math.round(actual));
  const candidates = new Set<number>();
  if (digits.length > 2) {
    for (let i = 0; i < digits.length; i++) {
      const trimmed = digits.slice(0, i) + digits.slice(i + 1);
      if (trimmed && trimmed !== '0') candidates.add(Number(trimmed));
    }
  }
  candidates.add(Math.round(actual / 10));
  candidates.add(actual * 10);
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate <= 0) continue;
    const diff = Math.abs(candidate - expected) / Math.max(candidate, 1);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return bestDiff <= 0.02 ? best : null;
}

/** سقف واقع‌گرایانه مبلغ در یک سند خرد؛ بزرگ‌تر از آن نویز است */
export const MAX_PLAUSIBLE = 10_000_000_000;

export function plausible(value: number): boolean {
  return value > 0 && value < MAX_PLAUSIBLE;
}

/** ارزیابی یک چیدمان: آیا معادله مالی ردیف را می‌سازد؟ */
export function scoreRoles(roles: Roles): number {
  const qty = roles.qty ?? 1;
  const unit = roles.unitPrice ?? 0;
  const discount = roles.discount ?? 0;
  const tax = roles.tax ?? 0;
  let total = roles.total ?? 0;

  if (roles.qty !== undefined && (!Number.isInteger(qty) || qty <= 0 || qty > 10000)) return Number.NEGATIVE_INFINITY;
  if (unit < 0 || discount < 0) return Number.NEGATIVE_INFINITY;

  if (!total) {
    if (!unit) return Number.NEGATIVE_INFINITY;
    total = unit * qty - discount;
  }
  if (total <= 0) return Number.NEGATIVE_INFINITY;
  if (discount > unit * qty) return Number.NEGATIVE_INFINITY;

  const net = unit * qty - discount;
  const candidates = [net, tax > 0 && tax <= 100 ? net * (1 + tax / 100) : null, tax > 100 ? net + tax : null]
    .filter((v): v is number => v !== null && v > 0);
  if (!candidates.length) return Number.NEGATIVE_INFINITY;
  const best = Math.min(...candidates.map((v) => Math.abs(v - total) / Math.max(total, 1)));
  let score = 1 - Math.min(best, 1);
  if (roles.total !== undefined) score += 0.05;
  if (roles.qty !== undefined) score += 0.03;
  return score;
}

/** همه ترکیب‌های حفظ‌ترتیب از ستون‌ها به‌اندازه تعداد اعداد */
export function combinations(length: number, size: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < length; i++) {
      acc.push(i);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

/**
 * نقش هر عدد را تعیین می‌کند.
 * اگر سرستون سند را بشناسیم، همه هم‌ترازی‌های ممکن با ستون‌ها آزموده و
 * هم‌ترازی‌ای برگزیده می‌شود که معادله ردیف را بسازد (تحمل ستون ناخوانده).
 */
export function assignRoles(numbers: number[], hint: Array<keyof Roles> = []): Roles {
  if (!numbers.length) return {};

  if (hint.length >= numbers.length && numbers.length >= 1) {
    let best: { roles: Roles; score: number } | null = null;
    for (const combo of combinations(hint.length, numbers.length)) {
      const roles: Roles = {};
      numbers.forEach((value, index) => {
        const field = hint[combo[index]];
        if (field === 'qty') roles.qty = value;
        else if (field === 'unitPrice') roles.unitPrice = value;
        else if (field === 'discount') roles.discount = value;
        else if (field === 'tax') roles.tax = value;
        else if (field === 'total') roles.total = value;
      });
      const score = scoreRoles(roles);
      if (!best || score > best.score) best = { roles, score };
    }
    if (best && Number.isFinite(best.score)) {
      const roles = best.roles;
      const qty = roles.qty ?? 1;
      if (!roles.total && roles.unitPrice) {
        roles.total = Math.round(roles.unitPrice * qty - (roles.discount ?? 0));
      }
      if (!roles.unitPrice && roles.total) {
        roles.unitPrice = Math.round((roles.total + (roles.discount ?? 0)) / qty);
      }
      return roles;
    }
  }

  const result: Roles = {};
  if (numbers.length === 1) {
    result.unitPrice = numbers[0];
    result.total = numbers[0];
    return result;
  }

  const total = Math.max(...numbers);
  result.total = total;
  const rest = [...numbers];
  rest.splice(rest.indexOf(total), 1);

  // تعداد: عدد کوچک صحیح
  const smallIndex = rest.findIndex((v) => Number.isInteger(v) && v > 0 && v < 1000);
  let remaining = rest;
  if (smallIndex >= 0) {
    result.qty = rest[smallIndex];
    remaining = rest.filter((_, i) => i !== smallIndex);
  }

  if (remaining.length === 1) {
    // عدد باقی‌مانده همان قیمت چاپ‌شده واحد است؛ تخفیف از اختلاف ساخته می‌شود
    result.unitPrice = remaining[0];
  } else if (remaining.length >= 2) {
    result.unitPrice = Math.max(...remaining);
    result.discount = Math.min(...remaining);
    if (result.discount === result.unitPrice) result.discount = 0;
  }

  if (!result.unitPrice && result.qty && total) {
    const expected = (total + (result.discount ?? 0)) / result.qty;
    if (Number.isFinite(expected)) result.unitPrice = Math.round(expected);
  }
  return result;
}

