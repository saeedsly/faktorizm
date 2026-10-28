import { createWorker, type Worker } from 'tesseract.js';
import type { AppSettings } from '../types';

export type ProgressCb = (status: string, progress: number) => void;

let worker: Worker | null = null;
let workerLangs = '';

const base = import.meta.env.BASE_URL;
const WORKER_PATH = `${base}vendor/tesseract/worker.min.js`;
const CORE_DIR = `${base}vendor/tesseract/core`;
const CORE_FILE = `${base}vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js`;
const LANG_DIR = `${base}vendor/tesseract/lang`;

// حالت‌های صفحه‌بندی: ستونی (۴)، بلوک یکنواخت (۶)، متن پراکنده (۱۱)
const PSM = { singleColumn: 4, singleBlock: 6, sparse: 11 } as const;

async function buildWorker(langs: string, onProgress?: ProgressCb): Promise<Worker> {
  const options = {
    workerPath: WORKER_PATH,
    corePath: CORE_DIR,
    langPath: LANG_DIR,
    gzip: true,
    cacheMethod: 'write' as const,
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && typeof m.progress === 'number') onProgress(m.status, m.progress);
    },
  };
  try {
    return await createWorker(langs, 1, options);
  } catch (err) {
    console.warn('[ocr] مسیر پوشه هسته شکست خورد، تلاش با فایل مستقیم…', err);
    return createWorker(langs, 1, { ...options, corePath: CORE_FILE });
  }
}

export async function getOcrWorker(settings: Pick<AppSettings, 'ocrLangs'>, onProgress?: ProgressCb): Promise<Worker> {
  const langs = settings.ocrLangs || 'fas+eng';
  if (worker && workerLangs === langs) return worker;
  if (worker) {
    try { await worker.terminate(); } catch { /* noop */ }
    worker = null;
  }
  onProgress?.('راه‌اندازی موتور تشخیص', 0.02);
  worker = await buildWorker(langs, onProgress);
  workerLangs = langs;
  return worker;
}

interface PassResult { text: string; confidence: number; psm: number }

async function runPass(w: Worker, image: string | HTMLCanvasElement, psm: number): Promise<PassResult> {
  await w.setParameters({
    tessedit_pageseg_mode: psm as never,
    preserve_interword_spaces: '1',
    // فرهنگ اختصاصی الگوهای پرتکرار فاکتورهای ایرانی به تشخیص دقیق‌تر کمک می‌کند
    user_defined_dpi: '300',
  });
  const result = await w.recognize(image);
  return {
    text: result?.data?.text ?? '',
    confidence: Math.round(result?.data?.confidence ?? 0),
    psm,
  };
}

export interface RecognizeInput {
  /** نسخه خاکستری کنتراست‌داده (ارجح) */
  gray: HTMLCanvasElement;
  /** نسخه باینری Otsu (اختیاری، برای اسناد کم‌کیفیت) */
  binary?: HTMLCanvasElement;
}

/**
 * شناسایی چندگذری: هر ترکیب PSM/نسخه تصویر اجرا و بهترین خروجی بر اساس
 * اطمینان Tesseract انتخاب می‌شود. اسناد جدولی معمولا با PSM 4 و
 * رسیدهای حرارتی با نسخه باینری نتیجه بهتری می‌دهند.
 */
export async function recognizeBest(
  input: RecognizeInput,
  settings: Pick<AppSettings, 'ocrLangs' | 'ocrQuality'>,
  onProgress?: ProgressCb,
): Promise<{ text: string; confidence: number; passes: PassResult[] }> {
  const w = await getOcrWorker(settings, onProgress);
  const quality = settings.ocrQuality || 'balanced';
  const passes: PassResult[] = [];

  if (quality === 'fast') {
    onProgress?.('در حال شناسایی متن', 0.6);
    passes.push(await runPass(w, input.gray, PSM.singleBlock));
  } else {
    onProgress?.('گذر اول شناسایی (بلوک متن)', 0.5);
    passes.push(await runPass(w, input.gray, PSM.singleBlock));
    onProgress?.('گذر دوم شناسایی (ستون و جدول)', 0.7);
    passes.push(await runPass(w, input.gray, PSM.singleColumn));

    if (quality === 'accurate' && input.binary) {
      onProgress?.('گذر سوم روی تصویر باینری', 0.82);
      const binPass = await runPass(w, input.binary, PSM.singleBlock);
      passes.push(binPass);
      // اگر باینری اطمینان بالاتر آورد، یک گذر ستونی هم روی آن بزن
      if (binPass.confidence >= Math.max(...passes.map((p) => p.confidence))) {
        passes.push(await runPass(w, input.binary, PSM.singleColumn));
      }
    }
  }

  // بهترین خروجی: بیشترین اطمینان، و در تساوی، متن طولانی‌تر (اطلاعات بیشتر)
  const best = [...passes].sort((a, b) =>
    b.confidence - a.confidence || b.text.length - a.text.length,
  )[0];
  return { text: best.text, confidence: best.confidence, passes };
}

/** سازگاری با فراخوانی قدیمی تک‌گذری */
export async function recognizeText(
  image: string | HTMLCanvasElement,
  settings: Pick<AppSettings, 'ocrLangs' | 'ocrQuality'>,
  onProgress?: ProgressCb,
): Promise<{ text: string; confidence: number }> {
  const result = await recognizeBest({ gray: image as HTMLCanvasElement }, settings, onProgress);
  return { text: result.text, confidence: result.confidence };
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    try { await worker.terminate(); } catch { /* noop */ }
    worker = null;
    workerLangs = '';
  }
}
