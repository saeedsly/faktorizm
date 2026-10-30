/**
 * اثر انگشت سند — برای تشخیص تکراری و کش خوانش
 *
 * دو نوع اثر انگشت ساخته می‌شود:
 *  • اثر انگشت فایل: هش بایت‌های تصویر؛ همان فایل اگر دوباره آپلود شود،
 *    بدون خوانش مجدد از نتیجه قبلی استفاده می‌شود.
 *  • اثر انگشت محتوا: هش «شماره + فروشنده + تاریخ + مبلغ»؛ دو عکس مختلف از
 *    یک فاکتور (یا کپی پی‌دی‌اف) با هم یکی شناخته می‌شوند.
 */

/** هش ۵۳ بیتی FNV-1a — سریع، بدون وابستگی، با برخورد ناچیز برای این کاربرد */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** هش محتوای باینری فایل */
export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // نمونه‌برداری یکنواخت: کل فایل برای اسناد کوچک، نمونه بزرگ برای فایل‌های حجیم
  const step = Math.max(1, Math.floor(bytes.length / 65536));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i += step) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= bytes[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const tail = `${bytes.length}:${bytes[0] ?? 0}:${bytes[bytes.length - 1] ?? 0}`;
  return hashString(`${h1.toString(16)}${h2.toString(16)}${tail}`);
}

/** نرمال‌سازی برای مقایسه: ارقام لاتین، بدون فاصله و علامت */
export function normalizeForFingerprint(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[يى]/g, 'ی')
    .replace(/[كڪ]/g, 'ک')
    .replace(/[^\u0600-\u06FFA-Za-z0-9]/g, '')
    .toLowerCase();
}

export interface DocFingerprintInput {
  number?: string;
  issuerName?: string;
  date?: string;
  total?: number;
  items?: { title: string; total: number }[];
}

/**
 * اثر انگشت محتوای سند.
 * اگر شماره سند موجود باشد، پایه مقایسه همان است (دقیق‌ترین معیار)؛
 * وگرنه فروشنده + تاریخ + مبلغ + عنوان اولین قلم.
 */
export function docFingerprint(input: DocFingerprintInput): string {
  const number = normalizeForFingerprint(input.number ?? '');
  const issuer = normalizeForFingerprint(input.issuerName ?? '');
  const date = normalizeForFingerprint(input.date ?? '').replace(/\D/g, '');
  const total = Math.round(input.total ?? 0);
  const first = normalizeForFingerprint(input.items?.[0]?.title ?? '');
  if (number && number.length >= 3) return hashString(`${number}|${issuer}|${total}`);
  return hashString(`${issuer}|${date}|${total}|${first}`);
}

export interface DuplicatePair<T> {
  a: T;
  b: T;
  reason: string;
  score: number;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let same = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] === b[i]) same++;
  return same / Math.max(a.length, b.length);
}

/**
 * گروه‌های تکراری را پیدا می‌کند.
 * دو سند تکراری‌اند اگر اثر انگشتشان یکی باشد، یا شماره و مبلغ یکی باشند،
 * یا مبلغ و فروشنده یکی و شماره‌ها خیلی نزدیک باشند (غلط تایپی OCR).
 */
export function findDuplicates<T extends DocFingerprintInput & { id: string }>(rows: T[]): DuplicatePair<T>[] {
  const out: DuplicatePair<T>[] = [];
  const norm = (s?: string) => normalizeForFingerprint(s ?? '');
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.id === b.id) continue;
      const sameTotal = Math.round(a.total ?? 0) === Math.round(b.total ?? 0) && (a.total ?? 0) > 0;
      const na = norm(a.number);
      const nb = norm(b.number);
      const sameNumber = !!na && na === nb;
      const closeNumber = !!na && !!nb && similarity(na, nb) >= 0.8;
      const sameIssuer = norm(a.issuerName) === norm(b.issuerName) && !!norm(a.issuerName);
      let score = 0;
      let reason = '';
      if (sameNumber && sameTotal) { score = 100; reason = 'شماره و مبلغ یکسان'; }
      else if (sameNumber) { score = 85; reason = 'شماره سند یکسان'; }
      else if (sameTotal && sameIssuer) { score = 90; reason = 'فروشنده و مبلغ یکسان'; }
      else if (sameTotal && closeNumber) { score = 80; reason = 'مبلغ یکسان و شماره تقریباً یکسان'; }
      if (score >= 80) out.push({ a, b, reason, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
