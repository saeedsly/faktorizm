/**
 * کلاینت موتور OCR سروری (سرویس پایتون با انتخاب خودکار موتور)
 *
 * سرویس پایتون خودش تصمیم می‌گیرد کدام موتور بخواند: Falcon-OCR-Arabic در
 * اولویت است و اگر وزن مدل یا کتابخانه‌اش نبود، PP-OCRv6 (تشخیص) + رکونایزر
 * عربی PP-OCRv5. پاسخ همیشه همراه «لایهٔ تأیید» می‌آید که می‌گوید خروجی
 * قابل‌اعتماد است یا نه.
 *
 * در نسخه استاتیک htdocs یا هنگام در دسترس نبودن سرویس، همه فراخوانی‌ها
 * به‌سرعت null برمی‌گردانند و خط لوله با موتور پشتیبان ادامه می‌دهد؛ ولی
 * نتیجهٔ آن موتور هرگز «تأییدشده» علامت نمی‌خورد.
 */
import { getAccessToken } from '../api/client';

/** ردیف کالای ساخت‌یافته از فهم ساختار جدول در سرویس */
export interface ServerItem {
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount?: number;
  total: number;
  /** در سرویس تشخیص داده شد که تعداد × قیمت واحد با مبلغ ردیف نمی‌خواند */
  needsReview?: boolean;
}

/** نتیجهٔ لایهٔ تأیید سرویس (validate.py) */
export interface ServerVerification {
  status: 'ok' | 'review' | 'unsafe';
  confidence: number;
  autoConfirm: number;
  reviewFloor: number;
  flags: string[];
  notes: string[];
}

/** موتور فعال در سرویس */
export interface ServerEngineInfo {
  id?: string | null;
  label?: string | null;
}

export interface ServerTotals {
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
}

export interface ServerOcrResult {
  text: string;
  confidence: number;
  lines: Array<{ text: string; confidence: number }>;
  elapsedMs?: number;
  /** اقلام جدول که بر پایه موقعیت ستون‌ها استخراج شده‌اند */
  items?: ServerItem[];
  totals?: ServerTotals;
  variant?: string;
  /** نتیجهٔ تأیید حسابداری و آستانهٔ اطمینان */
  verification?: ServerVerification;
  /** موتوری که سرویس انتخاب کرده است */
  engine?: ServerEngineInfo;
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
    const items: ServerItem[] = Array.isArray(data.items)
      ? data.items
        .filter((it: unknown) => !!it && typeof it === 'object')
        .map((it: Record<string, unknown>) => ({
          title: String(it.title ?? ''),
          quantity: Number(it.quantity ?? 1) || 1,
          unitPrice: Number(it.unitPrice ?? 0) || 0,
          discount: Number(it.discount ?? 0) || 0,
          taxRate: Number(it.taxRate ?? 0) || 0,
          taxAmount: Number(it.taxAmount ?? 0) || 0,
          total: Number(it.total ?? 0) || 0,
          needsReview: it.needsReview === true ? true : undefined,
        }))
        .filter((it: ServerItem) => it.title.length > 0)
      : [];
    return {
      text: String(data.text ?? ''),
      confidence: Number(data.confidence ?? 0),
      lines: Array.isArray(data.lines) ? data.lines : [],
      elapsedMs: data.elapsedMs,
      items,
      totals: data.totals && typeof data.totals === 'object' ? data.totals : undefined,
      variant: typeof data.variant === 'string' ? data.variant : undefined,
      verification: data.verification && typeof data.verification === 'object'
        ? {
          status: data.verification.status === 'ok' || data.verification.status === 'review'
            ? data.verification.status
            : 'unsafe',
          confidence: Number(data.verification.confidence ?? 0) || 0,
          autoConfirm: Number(data.verification.autoConfirm ?? 85) || 85,
          reviewFloor: Number(data.verification.reviewFloor ?? 70) || 70,
          flags: Array.isArray(data.verification.flags) ? data.verification.flags.map(String) : [],
          notes: Array.isArray(data.verification.notes) ? data.verification.notes.map(String) : [],
        }
        : undefined,
      engine: data.engine && typeof data.engine === 'object'
        ? { id: data.engine.id ?? null, label: data.engine.label ?? null }
        : undefined,
    };
  } catch {
    // خطای شبکه/مهلت: این سند با موتور داخلی خوانده می‌شود
    return null;
  }
}
