/**
 * آزمایشگاه موتورها — یک تصویر، همهٔ موتورها.
 *
 * کاربر می‌خواهد بداند کدام موتور روی فاکتورهای *خودش* بهتر است. اینجا همان
 * تصویر یک‌بار به هر موتور موجود داده می‌شود و نتیجه‌ها کنار هم می‌آیند:
 * متن، اطمینان، تعداد ردیف، زمان و خطای واقعی.
 *
 * هیچ عدد ساختگی ساخته نمی‌شود؛ اگر موتوری خطا داد، همان خطا نمایش داده می‌شود.
 */
import { checkServerOcr, resetServerOcrCache } from './serverEngine';
import { recognizeWithAi, AI_PROVIDERS, keysOf, callOcrSpace } from './aiEngine';
import type { AppSettings } from '../types';
import { loadBitmap, enhanceCanvas } from './preprocess';
import { getAccessToken } from '../api/client';

export interface EngineRunResult {
  id: string;
  label: string;
  /** مسیر اجرا: محلی روی سرور · مرورگر · ابری */
  where: 'server' | 'browser' | 'cloud';
  ok: boolean;
  text: string;
  confidence: number;
  lines: number;
  items: number;
  elapsedMs: number;
  error?: string;
  /** توضیح کوتاه اینکه چرا این موتور در دسترس است یا نیست */
  note?: string;
}

export interface LabImage {
  canvas: HTMLCanvasElement;
  blob: Blob;
}

/** تصویر کاربر را برای همهٔ موتورها آماده می‌کند (حداکثر ۲۲۰۰ پیکسل) */
export async function prepareLabImage(file: Blob): Promise<LabImage> {
  const bitmap = await loadBitmap(file);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context در دسترس نیست');
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, width, height);
  const enhanced = enhanceCanvas(canvas);
  const blob = await new Promise<Blob>((resolve, reject) => {
    enhanced.toBlob((b) => (b ? resolve(b) : reject(new Error('تصویر تبدیل نشد'))), 'image/png');
  });
  return { canvas: enhanced, blob };
}

/** اجرای یک موتور سروری با اجبار موتور مشخص */
async function runServerEngine(
  image: LabImage,
  engineId: string,
  label: string,
  token: string | null,
): Promise<EngineRunResult> {
  const started = performance.now();
  const empty = (error: string): EngineRunResult => ({
    id: engineId, label, where: 'server', ok: false, text: '', confidence: 0,
    lines: 0, items: 0, elapsedMs: Math.round(performance.now() - started), error,
  });
  try {
    const query = engineId && engineId !== 'auto' ? `?engine=${encodeURIComponent(engineId)}` : '';
    const res = await fetch(`/api/v2/ocr/recognize${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: image.blob,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      const message = json?.error?.message || `خطای سرور (${res.status})`;
      return empty(message);
    }
    const data = json.data ?? {};
    return {
      id: data.engine?.id ?? engineId,
      label: data.engine?.label ?? label,
      where: 'server',
      ok: true,
      text: String(data.text ?? ''),
      confidence: Number(data.confidence ?? 0),
      lines: Array.isArray(data.lines) ? data.lines.length : String(data.text ?? '').split('\n').length,
      items: Array.isArray(data.items) ? data.items.length : 0,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return empty(err instanceof Error ? `ارتباط با سرور برقرار نشد: ${err.message}` : 'خطای نامشخص');
  }
}

/**
 * موتور مرورگر قابل جایگزینی برای آزمون‌ها.
 * (worker مرورگر در محیط نود بارگذاری نمی‌شود؛ با این قلاب، منطق آزمایشگاه
 * بدون مرورگر هم آزمون می‌شود.)
 */
type BrowserRunner = (image: LabImage, settings: AppSettings) => Promise<{ text: string; confidence: number }>;
let browserRunner: BrowserRunner | null = null;

export function installBrowserRunner(runner: BrowserRunner | null): void {
  browserRunner = runner;
}

/** موتور مرورگر (Tesseract) — همیشه در دسترس */
async function runBrowserEngine(image: LabImage, settings: AppSettings): Promise<EngineRunResult> {
  const started = performance.now();
  try {
    let result: { text: string; confidence: number };
    if (browserRunner) {
      result = await browserRunner(image, settings);
    } else {
      // تنبل وارد می‌شود تا در آزمون‌های محیط نود، worker مرورگر بارگذاری نشود
      const { recognizeBest } = await import('./engine');
      result = await recognizeBest(
        { gray: image.canvas },
        { ocrLangs: settings.ocrLangs || 'fas', ocrQuality: settings.ocrQuality || 'balanced' },
      );
    }
    return {
      id: 'tesseract-browser',
      label: 'Tesseract (درون مرورگر)',
      where: 'browser',
      ok: true,
      text: result.text,
      confidence: result.confidence,
      lines: result.text.split('\n').filter((l) => l.trim()).length,
      items: 0,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      id: 'tesseract-browser',
      label: 'Tesseract (درون مرورگر)',
      where: 'browser',
      ok: false,
      text: '',
      confidence: 0,
      lines: 0,
      items: 0,
      elapsedMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : 'موتور مرورگر خطا داد',
    };
  }
}

/** تبدیل blob به base64 بدون پیشوند data: */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
    reader.onerror = () => reject(new Error('تصویر به base64 تبدیل نشد'));
    reader.readAsDataURL(blob);
  });
}

/** سرویس ابری — برای OCR.Space متن خام برمی‌گردد، برای بقیه فیلدهای ساخت‌یافته */
async function runCloudEngine(image: LabImage, settings: AppSettings): Promise<EngineRunResult> {
  const started = performance.now();
  const info = AI_PROVIDERS[settings.aiProvider];
  const label = `ابر: ${info?.label ?? settings.aiProvider}`;
  const base: EngineRunResult = {
    id: 'cloud', label, where: 'cloud', ok: false, text: '', confidence: 0,
    lines: 0, items: 0, elapsedMs: 0,
  };
  const keys = keysOf(settings);
  if (!keys.length && !info?.keyless) {
    return {
      ...base,
      elapsedMs: Math.round(performance.now() - started),
      error: 'کلید API ثبت نشده است (تنظیمات ← وضعیت خوانش ابری ← «دیدن و ویرایش کلید»)',
      note: 'کلید OCR.Space باید ۳۶ نویسه باشد و با K شروع شود.',
    };
  }

  const cfg = {
    provider: settings.aiProvider,
    apiKey: keys[0] ?? '',
    keys,
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModel,
  };

  try {
    // OCR.Space متن خام می‌دهد؛ مسیر مستقیم دقیق‌ترین گزارش را دارد
    if (settings.aiProvider === 'ocrspace') {
      const b64 = await blobToBase64(image.blob);
      const text = await callOcrSpace({ mime: 'image/png', base64: b64 }, cfg);
      const note = keys[0] && keys[0].length !== 36
        ? `کلید ثبت‌شده ${keys[0].length} نویسه است؛ کلیدهای OCR.Space ۳۶ نویسه‌اند (احتمال کپی ناقص).`
        : undefined;
      return {
        ...base,
        ok: !!text.trim(),
        text,
        lines: text.split('\n').filter((line: string) => line.trim()).length,
        elapsedMs: Math.round(performance.now() - started),
        error: text.trim() ? undefined : 'سرویس متنی برنگرداند',
        note,
      };
    }

    const result = await recognizeWithAi(image.blob, cfg);
    const text = result.fields
      ? [
        result.fields.number ? `شماره: ${result.fields.number}` : '',
        result.fields.date ? `تاریخ: ${result.fields.date}` : '',
        result.fields.issuerName ? `فروشنده: ${result.fields.issuerName}` : '',
        (result.fields.items ?? []).map((it) => `${it.name ?? ''} ${it.total ?? ''}`).join('\n'),
      ].filter(Boolean).join('\n')
      : '';
    return {
      ...base,
      ok: result.ok,
      text,
      confidence: Number(result.fields?.confidence ?? 0),
      lines: text.split('\n').filter((line: string) => line.trim()).length,
      items: (result.fields?.items ?? []).length,
      elapsedMs: Math.round(performance.now() - started),
      error: result.ok ? undefined : result.error,
    };
  } catch (err) {
    return {
      ...base,
      elapsedMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : 'خطای سرویس ابری',
    };
  }
}

/** امتیاز ساده برای مقایسه (فقط برای مرتب‌کردن، نه برای تصمیم مالی) */
export function scoreOf(run: EngineRunResult): number {
  if (!run.ok) return -1;
  const textScore = Math.min(40, run.text.trim().length / 40);
  const itemScore = Math.min(30, run.items * 6);
  const confScore = Math.min(30, (run.confidence / 100) * 30);
  return Math.round(textScore + itemScore + confScore);
}

/**
 * اجرای همهٔ موتورها روی یک تصویر.
 * ترتیب: موتورهای سروری (خودکار، اجبار PP-OCR، اجبار Falcon) → مرورگر → ابری
 */
export async function runAllEngines(
  image: LabImage,
  settings: AppSettings,
  options: { token?: string | null; includeCloud?: boolean; onStep?: (label: string) => void } = {},
): Promise<EngineRunResult[]> {
  resetServerOcrCache();
  const serverUp = await checkServerOcr();
  const results: EngineRunResult[] = [];

  if (serverUp) {
    options.onStep?.('موتور محلی: انتخاب خودکار');
    results.push(await runServerEngine(image, 'auto', 'محلی — انتخاب خودکار', options.token ?? getAccessToken() ?? null));
    options.onStep?.('موتور محلی: PP-OCR عربی');
    results.push(await runServerEngine(image, 'ppocrv5', 'PP-OCR عربی (اجباری)', options.token ?? getAccessToken() ?? null));
    options.onStep?.('موتور محلی: Falcon');
    results.push(await runServerEngine(image, 'falcon', 'Falcon-OCR', options.token ?? getAccessToken() ?? null));
    options.onStep?.('موتور محلی: PP-OCR multi (لاتین)');
    results.push(await runServerEngine(image, 'multi', 'PP-OCR multi (لاتین/انگلیسی)', options.token ?? getAccessToken() ?? null));
  } else {
    results.push({
      id: 'server', label: 'سرویس محلی (پایتون)', where: 'server', ok: false, text: '',
      confidence: 0, lines: 0, items: 0, elapsedMs: 0,
      error: 'سرویس محلی روشن نیست — setup.bat و start.bat را اجرا کنید',
      note: 'بدون این سرویس، PP-OCR و Falcon در دسترس نیستند.',
    });
  }

  options.onStep?.('موتور مرورگر (Tesseract)');
  results.push(await runBrowserEngine(image, settings));

  if (options.includeCloud !== false) {
    options.onStep?.('سرویس ابری');
    results.push(await runCloudEngine(image, settings));
  }
  return results;
}
