/**
 * کش خوانش — پردازش تکراری را حذف می‌کند
 *
 * اگر همان فایل دوباره آپلود شود (یا همان سند از دستگاه دیگری برگردد)،
 * متن و اطمینان قبلی از حافظه محلی برداشته می‌شود؛ نه وقت تلف می‌شود نه
 * پهنای باند. کش سرویس ابری جداگانه و کوتاه‌عمر است، چون نتیجه مدل‌های
 * زبانی ممکن است تغییر کند.
 */
import { db } from '../db';
import type { AiCacheEntry, OcrCacheEntry } from '../types';
import { hashString } from './fingerprint';

const MAX_OCR_ENTRIES = 400;
const MAX_AI_ENTRIES = 120;
const AI_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface CachedOcr {
  text: string;
  confidence: number;
  source: string;
  at: string;
}

export async function getCachedOcr(key: string): Promise<CachedOcr | null> {
  const hit = await db.ocrCache.get(key);
  if (!hit) return null;
  return { text: hit.text, confidence: hit.confidence, source: hit.source, at: hit.at };
}

export async function putCachedOcr(key: string, text: string, confidence: number, source = 'local'): Promise<void> {
  if (!text.trim()) return;
  const entry: OcrCacheEntry = { key, text, confidence, source, at: new Date().toISOString() };
  await db.ocrCache.put(entry);
  await trimCache(db.ocrCache, MAX_OCR_ENTRIES);
}

export async function clearOcrCache(): Promise<void> {
  await db.ocrCache.clear();
}

export async function getCachedAi(prompt: string): Promise<string | null> {
  const key = hashString(prompt);
  const hit = await db.aiCache.get(key);
  if (!hit) return null;
  if (Date.now() - new Date(hit.at).getTime() > AI_TTL_MS) {
    await db.aiCache.delete(key);
    return null;
  }
  return hit.payload;
}

export async function putCachedAi(prompt: string, payload: string): Promise<void> {
  const entry: AiCacheEntry = { key: hashString(prompt), payload, at: new Date().toISOString() };
  await db.aiCache.put(entry);
  await trimCache(db.aiCache, MAX_AI_ENTRIES);
}

export async function cacheStats(): Promise<{ ocrEntries: number; aiEntries: number; bytes: number }> {
  const [ocr, ai] = await Promise.all([db.ocrCache.toArray(), db.aiCache.toArray()]);
  const bytes = ocr.reduce((s, e) => s + e.text.length * 2, 0)
    + ai.reduce((s, e) => s + e.payload.length * 2, 0);
  return { ocrEntries: ocr.length, aiEntries: ai.length, bytes };
}

export async function clearAllCaches(): Promise<void> {
  await Promise.all([db.ocrCache.clear(), db.aiCache.clear()]);
}

/** نگه‌داشتن آخرین N رکورد و حذف قدیمی‌ترها */
async function trimCache<T extends { at: string }>(table: { orderBy: (k: string) => { toArray: () => Promise<T[]> }; delete: (k: string) => Promise<unknown> }, keep: number) {
  const rows = await table.orderBy('at').toArray();
  if (rows.length <= keep) return;
  const extra = rows.slice(0, rows.length - keep);
  await Promise.all(extra.map((r) => table.delete((r as unknown as { key: string }).key)));
}

/** مصرف روزانه سرویس ابری — برای نمایش سهمیه و هزینه تقریبی */
export async function trackUsage(chars: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db.usage.get(day);
  await db.usage.put({ day, calls: (row?.calls ?? 0) + 1, chars: (row?.chars ?? 0) + chars });
}

export async function usageSummary(): Promise<{ today: number; week: number; month: number; chars: number }> {
  const rows = await db.usage.orderBy('day').toArray();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const sum = (list: typeof rows) => list.reduce((s, r) => s + r.calls, 0);
  return {
    today: sum(rows.filter((r) => r.day === today)),
    week: sum(rows.filter((r) => r.day >= weekAgo)),
    month: sum(rows.filter((r) => r.day >= monthAgo)),
    chars: rows.filter((r) => r.day >= monthAgo).reduce((s, r) => s + r.chars, 0),
  };
}
