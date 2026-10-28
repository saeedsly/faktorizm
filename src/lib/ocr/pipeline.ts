import { recognizeBest } from './engine';
import {
  loadBitmap, bitmapToCanvas, makeThumbnail, enhanceCanvas, upscaleIfSmall,
  grayscaleEnhance, deskewCanvas,
} from './preprocess';
import { renderPdfPages, isPdf, isImage } from './pdf';
import { parseInvoiceText } from './parser';
import { invoiceFromParsed } from '../invoices';
import { getSettings } from '../db';
import type { AppSettings, Invoice } from '../types';

export interface FileMeta {
  fileName: string;
  fileType: string;
  thumbnail: string;
  pages: number;
}

export interface ProcessResult {
  invoice: Invoice;
  rawText: string;
  confidence: number;
  meta: FileMeta;
}

export type StageCb = (stage: string, progress: number) => void;

/** آماده‌سازی یک صفحه: بزرگ‌نمایی، تصحیح کجی و ساخت دو نسخه خاکستری/باینری */
function preparePage(canvas: HTMLCanvasElement, autoPreprocess: boolean) {
  let base = upscaleIfSmall(canvas);
  const { canvas: straightened, angle } = deskewCanvas(base);
  base = straightened;
  if (!autoPreprocess) return { gray: base, binary: undefined, angle };
  const gray = grayscaleEnhance(base);
  const binary = enhanceCanvas(base);
  return { gray, binary, angle };
}

export async function processFile(
  file: File,
  settings: AppSettings,
  onStage: StageCb,
): Promise<ProcessResult> {
  let canvases: HTMLCanvasElement[] = [];
  let thumbnail = '';
  let pages = 1;

  onStage('آماده‌سازی سند', 0.05);

  if (isPdf(file)) {
    onStage('استخراج صفحات PDF', 0.12);
    canvases = await renderPdfPages(file, settings.ocrQuality === 'accurate' ? 2.6 : 2);
    pages = canvases.length;
    thumbnail = canvases[0].toDataURL('image/jpeg', 0.72);
  } else if (isImage(file)) {
    const bitmap = await loadBitmap(file);
    const canvas = bitmapToCanvas(bitmap);
    thumbnail = makeThumbnail(bitmap);
    bitmap.close?.();
    canvases = [canvas];
  } else {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود؛ فقط تصویر (JPG/PNG/WEBP) و PDF');
  }

  const textParts: string[] = [];
  let confSum = 0;
  let deskewAngle = 0;

  for (let i = 0; i < canvases.length; i++) {
    onStage(`بهبود کیفیت و تصحیح کجی صفحه ${i + 1}`, 0.18 + (i / canvases.length) * 0.14);
    const prepared = preparePage(canvases[i], settings.autoPreprocess);
    deskewAngle = Math.max(deskewAngle, Math.abs(prepared.angle));

    onStage(`خواندن متن صفحه ${i + 1} از ${pages}`, 0.34 + (i / canvases.length) * 0.55);
    const { text, confidence } = await recognizeBest(prepared, settings, (_s, p) =>
      onStage(`خواندن متن صفحه ${i + 1}`, 0.34 + ((i + p) / canvases.length) * 0.55),
    );
    textParts.push(text);
    confSum += confidence;
  }

  onStage('استخراج و تصحیح هوشمند فیلدها', 0.92);
  const rawText = textParts.join('\n\n');
  const confidence = Math.round(confSum / canvases.length);
  const fullSettings = settings ?? (await getSettings());
  const parsed = parseInvoiceText(rawText, confidence, fullSettings.defaultTaxRate);
  if (deskewAngle >= 0.5) {
    parsed.warnings.unshift(`سند حدود ${deskewAngle.toFixed(1)} درجه کج بود و پیش از خوانش تصحیح شد.`);
  }
  const invoice = invoiceFromParsed(parsed, {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    thumbnail,
    pages,
    rawText,
    ocrConfidence: confidence,
  }, fullSettings);

  onStage('تکمیل شد', 1);
  return { invoice, rawText, confidence, meta: { fileName: file.name, fileType: file.type, thumbnail, pages } };
}
