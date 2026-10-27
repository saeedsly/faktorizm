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

export async function recognizeText(
  image: string | HTMLCanvasElement,
  settings: Pick<AppSettings, 'ocrLangs' | 'ocrQuality'>,
  onProgress?: ProgressCb,
): Promise<{ text: string; confidence: number }> {
  const w = await getOcrWorker(settings, onProgress);
  const psm = settings.ocrQuality === 'accurate' ? 3 : settings.ocrQuality === 'fast' ? 6 : 6;
  await w.setParameters({
    tessedit_pageseg_mode: psm as never,
    preserve_interword_spaces: '1',
  });
  onProgress?.('در حال شناسایی متن', 0.55);
  const result = await w.recognize(image);
  const text = result?.data?.text ?? '';
  const confidence = result?.data?.confidence ?? 0;
  return { text, confidence: Math.round(confidence) };
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    try { await worker.terminate(); } catch { /* noop */ }
    worker = null;
    workerLangs = '';
  }
}
