/**
 * اصلاح خودکار متن OCR با یادگیری از سندهای پیشین
 *
 * سه دسته خطا در متن فارسی فاکتور شایع است:
 *  ۱) واژه تکراری («کالا کالا»، «و و») که از هم‌پوشانی جعبه‌های متن می‌آید،
 *  ۲) غلط تایپی در نام کالا یا فروشنده که واژه‌نامه کاربر اصلاحش می‌کند،
 *  ۳) فاصله‌های اضافی و نویسه‌های کنترلی.
 * هیچ اصلاحی بدون تأیید کاربر روی متن اصلی اعمال نمی‌شود؛ پیشنهاد می‌دهیم،
 * کاربر تیک می‌زند و بعد متن اصلاح می‌شود.
 */

export type FixKind = 'repeat' | 'dictionary' | 'spacing' | 'control';

export interface FixSuggestion {
  id: string;
  from: string;
  to: string;
  kind: FixKind;
  reason: string;
  count: number;
}

/** فاصله ویرایشی (لونشتاین) برای تطبیق واژه نزدیک */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function normalizeWord(word: string): string {
  return word
    .replace(/[‌-‏]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/[كڪ]/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/[^\u0600-\u06FFA-Za-z0-9]/g, '')
    .toLowerCase();
}

/**
 * پیشنهاد اصلاح‌ها.
 * @param text متن خام خوانده‌شده
 * @param dictionary واژه‌نامه درست (نام کالاها و فروشندگان شناخته‌شده)
 */
export function suggestFixes(text: string, dictionary: string[] = []): FixSuggestion[] {
  const out: FixSuggestion[] = [];
  const push = (s: Omit<FixSuggestion, 'id'>) => {
    const existing = out.find((o) => o.from === s.from && o.to === s.to);
    if (existing) { existing.count += s.count; return; }
    out.push({ id: `fix_${out.length}_${s.from.slice(0, 6)}`, ...s });
  };

  // ۱) واژه‌های پشت‌سرهم تکراری
  const repeatRe = /(\S{2,})\s+\1/g;
  let m: RegExpExecArray | null;
  const seenRepeats = new Set<string>();
  while ((m = repeatRe.exec(text)) !== null) {
    if (seenRepeats.has(m[1])) continue;
    seenRepeats.add(m[1]);
    push({
      from: `${m[1]} ${m[1]}`, to: m[1], kind: 'repeat',
      reason: 'واژه تکراری از هم‌پوشانی جعبه متن', count: 1,
    });
  }

  // ۲) فاصله‌های اضافی
  if (/ {2,}/.test(text)) {
    push({ from: '  ', to: ' ', kind: 'spacing', reason: 'فاصله‌های تکراری', count: 1 });
  }

  // ۳) نویسه کنترلی و صفر پهن
  if (/[\u200b\u200e\u200f\ufeff]/.test(text)) {
    push({ from: '\u200b', to: '', kind: 'control', reason: 'نویسه نامرئی', count: 1 });
  }

  // ۴) واژه‌های نزدیک به واژه‌نامه (غلط تایپی OCR)
  // هر عبارت هم به‌صورت کامل و هم واژه‌به‌واژه بررسی می‌شود تا «پنر» → «پنیر» پیدا شود
  const dict = Array.from(new Set(
    dictionary.flatMap((entry) => [entry, ...entry.split(/\s+/)])
      .map((word) => word.trim())
      .filter(Boolean),
  ))
    .map((word) => ({ raw: word, norm: normalizeWord(word) }))
    .filter((d) => d.norm.length >= 3);
  if (dict.length) {
    const words = text.split(/\s+/).filter((w) => normalizeWord(w).length >= 3);
    const checked = new Set<string>();
    for (const word of words) {
      const norm = normalizeWord(word);
      if (checked.has(norm)) continue;
      checked.add(norm);
      if (dict.some((d) => d.norm === norm)) continue;
      let best: { raw: string; dist: number } | null = null;
      for (const d of dict) {
        const dist = editDistance(norm, d.norm);
        if (dist > 0 && dist <= (d.norm.length > 6 ? 2 : 1) && (!best || dist < best.dist)) {
          best = { raw: d.raw, dist };
        }
      }
      if (best) {
        push({
          from: word, to: best.raw, kind: 'dictionary',
          reason: `نزدیک به «${best.raw}» در واژه‌نامه شما`, count: 1,
        });
      }
    }
  }

  return out.slice(0, 60);
}

/** اعمال اصلاح‌های تأییدشده روی متن */
export function applyFixes(text: string, approved: FixSuggestion[]): string {
  let out = text;
  for (const fix of approved) {
    if (!fix.from) continue;
    if (fix.kind === 'repeat') {
      out = out.split(fix.from).join(fix.to);
    } else if (fix.kind === 'spacing') {
      out = out.replace(/ {2,}/g, ' ');
    } else if (fix.kind === 'control') {
      out = out.replace(/[\u200b\u200e\u200f\ufeff]/g, '');
    } else {
      const re = new RegExp(`(^|\\s)${escapeRe(fix.from)}(?=\\s|$)`, 'g');
      out = out.replace(re, `$1${fix.to}`);
    }
  }
  return out;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * واژه‌نامه یادگرفته‌شده از داده‌های خود کاربر:
 * نام کالاهای ثبت‌شده و نام فروشندگان.
 */
export function buildDictionary(products: { title: string }[], contacts: { name: string }[]): string[] {
  const set = new Set<string>();
  products.forEach((p) => p.title.trim() && set.add(p.title.trim()));
  contacts.forEach((c) => c.name.trim() && set.add(c.name.trim()));
  return Array.from(set).slice(0, 800);
}

/** خطاهای پرتکرار را از اختلاف متن خام با متن نهایی کاربر استخراج می‌کند */
export function learnCorrections(rawText: string, correctedTitles: string[]): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];
  const rawWords = new Set(rawText.split(/\s+/).map(normalizeWord).filter((w) => w.length >= 3));
  for (const title of correctedTitles) {
    for (const word of title.split(/\s+/)) {
      const norm = normalizeWord(word);
      if (norm.length < 4 || rawWords.has(norm)) continue;
      for (const raw of Array.from(rawWords)) {
        if (editDistance(raw, norm) === 1) {
          suggestions.push({
            id: `learn_${raw}_${norm}`, from: raw, to: word, kind: 'dictionary',
            reason: 'کاربر این واژه را در بازبینی اصلاح کرد', count: 1,
          });
          break;
        }
      }
    }
  }
  return suggestions.slice(0, 40);
}
