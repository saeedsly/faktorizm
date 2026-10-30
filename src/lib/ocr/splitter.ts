/**
 * جدا کردن چند سند از یک فایل
 *
 * کاربران زیاد پیش می‌آید که یک عکس از دو رسید بگیرند یا PDF چند فاکتوری را
 * یک‌جا اسکن کنند. این ماژول متن خام را به «سند» می‌شکند؛ هر جا نشانه شروع
 * سند تازه دیده شود (شماره فاکتور، کلمه فاکتور/رسید در ابتدای خط، خط جداکننده)
 * یک سند جدید آغاز می‌شود. اگر نشانه‌ای نبود، کل متن یک سند است.
 */

const START_MARKERS = [
  /^\s*(?:فاکتور|صورتحساب|رسید|قبض|بارنامه|صورت\s*حساب)\s*(?:فروش|خرید|فروشنده|شماره)?/i,
  /^\s*(?:شماره|سریال)\s*(?:فاکتور|سند|رسید|صورتحساب)\s*[:#-]?\s*\S+/i,
  /^\s*(?:invoice|receipt|bill)\b/i,
  /^\s*[-=_*]{6,}\s*$/,
];

export interface TextDocument {
  index: number;
  text: string;
  /** خط‌های متن این سند */
  lines: string[];
  /** نشانه‌ای که سند را شروع کرد */
  marker?: string;
}

/**
 * متن را به سندهای مستقل می‌شکند.
 * قاعده: سند تازه فقط وقتی آغاز می‌شود که از سند فعلی دست‌کم ۳ خط معنادار
 * گذشته باشد، تا سرصفحه‌های چندخطی یک سند را تکه‌تکه نکنیم.
 */
export function splitDocuments(raw: string, minLines = 3): TextDocument[] {
  const lines = raw.split(/\r?\n/);
  const docs: TextDocument[] = [];
  let current: string[] = [];
  let marker: string | undefined;

  const flush = () => {
    const body = current.join('\n').trim();
    if (!body) { current = []; marker = undefined; return; }
    docs.push({ index: docs.length, text: body, lines: current.filter((l) => l.trim()), marker });
    current = [];
    marker = undefined;
  };

  for (const line of lines) {
    const isStart = line.trim().length > 0 && START_MARKERS.some((re) => re.test(line));
    if (isStart) {
      const meaningful = current.filter((l) => l.trim().length > 2).length;
      if (meaningful >= minLines) flush();
      if (!marker && /[\u0600-\u06FFA-Za-z]{2,}/.test(line)) marker = line.trim().slice(0, 60);
    }
    current.push(line);
  }
  flush();

  // اگر شکستن بی‌معنا بود (همه سندها کوچک‌اند)، کل متن یک سند است
  if (docs.length > 1 && docs.every((d) => d.lines.length < minLines)) {
    return [{ index: 0, text: raw.trim(), lines: lines.filter((l) => l.trim()) }];
  }
  return docs;
}

/** آیا این متن واقعاً چند سند است؟ */
export function looksMultiDocument(raw: string): boolean {
  return splitDocuments(raw).length > 1;
}

/** عنوان کوتاه هر سند برای نمایش در انتخابگر */
export function documentLabel(doc: TextDocument): string {
  const firstText = doc.lines.find((l) => /[\u0600-\u06FFA-Za-z]{3,}/.test(l));
  const trimmed = (doc.marker || firstText || `سند ${doc.index + 1}`).trim();
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}
