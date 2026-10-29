/**
 * کلاینت موتور OCR سروری (سرویس پایتون RapidOCR PP-OCRv5)
 *
 * در نسخه سروری (Node + سرویس پایتون) از این موتور قوی استفاده می‌شود؛
 * در نسخه استاتیک htdocs یا هنگام در دسترس نبودن سرویس، همه فراخوانی‌ها
 * به‌سرعت null برمی‌گردانند تا خط لوله بدون خطا به Tesseract fallback کند.
 */
import { getAccessToken } from '../api/client';

export interface ServerOcrResult {
  text: string;
  confidence: number;
  lines: Array<{ text: string; confidence: number }>;
  elapsedMs?: number;
}

let availability: 'unknown' | 'up' | 'down' = 'unknown';
let inflight: Promise<boolean> | null = null;

/** یک‌بار بررسی سلامت سرویس؛ نتیجه در طول نشست کش می‌شود */
export function checkServerOcr(): Promise<boolean> {
  if (availability === 'up') return Promise.resolve(true);
  if (availability === 'down') return Promise.resolve(false);
  if (!inflight) {
    inflight = fetch('/api/v2/ocr/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then((j) => {
        availability = j?.data?.engineAvailable ? 'up' : 'down';
        return availability === 'up';
      })
      .catch(() => {
        availability = 'down';
        return false;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** برای تست‌ها و تغییر شرایط شبکه */
export function resetServerOcrCache(): void {
  availability = 'unknown';
  inflight = null;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas encode failed'))), 'image/png');
  });
}

/**
 * شناسایی متن از روی canvas از طریق سرویس پایتون.
 * اگر سرویس نبود یا خطا داد، null (نه استثنا) برمی‌گرداند.
 */
export async function recognizeViaServer(canvas: HTMLCanvasElement): Promise<ServerOcrResult | null> {
  const available = await checkServerOcr();
  if (!available) return null;
  try {
    const blob = await canvasToBlob(canvas);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const token = getAccessToken();
    const res = await fetch('/api/v2/ocr/recognize', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'image/png',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 503 || res.status === 404) {
      availability = 'down';
      return null;
    }
    const json = await res.json();
    if (!res.ok || !json.success || !json.data) return null;
    const data = json.data;
    return {
      text: String(data.text ?? ''),
      confidence: Number(data.confidence ?? 0),
      lines: Array.isArray(data.lines) ? data.lines : [],
      elapsedMs: data.elapsedMs,
    };
  } catch {
    // خطای شبکه/مهلت: این سند با موتور داخلی خوانده می‌شود
    return null;
  }
}
