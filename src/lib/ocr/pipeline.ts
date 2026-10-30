import { recognizeBest } from './engine';
import { recognizeViaServer } from './serverEngine';
import type { ServerItem, ServerTotals } from './serverEngine';
import {
  loadBitmap, bitmapToCanvas, makeThumbnail, enhanceCanvas, upscaleIfSmall,
  grayscaleEnhance, deskewCanvas, canvasToBlob,
} from './preprocess';
import { renderPdfPages, isPdf, isImage } from './pdf';
import { parseInvoiceText } from './parser';
import { invoiceFromParsed } from '../invoices';
import { getSettings } from '../db';
import { recognizeWithAi, AI_PROVIDERS } from './aiEngine';
import { applyStructuredItems } from './structured';
import { mergeAiIntoParsed } from './merge';
import type { AiOcrResult } from './aiEngine';
import type { AppSettings, Invoice } from '../types';

export interface FileMeta {
  fileName: string;
  fileType: string;
  thumbnail: string;
  pages: number;
}

/** منبع خوانش نهایی سند */
export type OcrSource = 'local' | 'ai' | 'hybrid';

export interface ProcessResult {
  invoice: Invoice;
  rawText: string;
  confidence: number;
  meta: FileMeta;
  source: OcrSource;
  /** تصویر بهبودیافته با کیفیت بالا برای پیش‌نمایش و بازبینی */
  preview: string;
  /** خطای لایه ابری در صورت شکست (خوانش محلی انجام شده است) */
  aiError?: string;
}

export type StageCb = (stage: string, progress: number) => void;

export interface ProcessOptions {
  /** تأیید کاربر برای ارسال تصویر به سرویس ابری؛ نبودش یعنی ارسال مجاز نیست */
  onAiConsent?: (info: { fileName: string; providerLabel: string }) => Promise<boolean>;
}

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
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  let canvases: HTMLCanvasElement[] = [];
  let thumbnail = '';
  let pages = 1;

  onStage('آماده‌سازی سند', 0.05);

  if (isPdf(file)) {
    onStage('استخراج صفحات PDF', 0.12);
    canvases = await renderPdfPages(file, settings.ocrQuality === 'accurate' ? 2.6 : 2);
    pages = canvases.length;
  } else if (isImage(file)) {
    const bitmap = await loadBitmap(file);
    canvases = [bitmapToCanvas(bitmap)];
    bitmap.close?.();
  } else {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود؛ فقط تصویر (JPG/PNG/WEBP) و PDF');
  }

  // تصمیم ارسال به سرویس ابری، یک‌بار برای هر سند و با تأیید صریح کاربر
  const aiConfigured = settings.ocrEngine !== 'local' && !!settings.aiApiKey?.trim();
  let aiAllowed = false;
  if (aiConfigured) {
    if (!settings.aiAskEachTime) {
      aiAllowed = true;
    } else if (options.onAiConsent) {
      aiAllowed = await options.onAiConsent({
        fileName: file.name,
        providerLabel: AI_PROVIDERS[settings.aiProvider]?.label ?? 'سرویس ابری',
      });
    }
  }

  const textParts: string[] = [];
  let confSum = 0;
  let deskewAngle = 0;
  let serverEngineUsed = false;
  let aiResult: AiOcrResult | undefined;
  let preview = '';
  let enhancedForAi: Blob | null = null;
  const structuredItems: ServerItem[] = [];
  let structuredTotals: ServerTotals | undefined;

  for (let i = 0; i < canvases.length; i++) {
    onStage(`بهبود کیفیت و تصحیح کجی صفحه ${i + 1}`, 0.18 + (i / canvases.length) * 0.14);
    const prepared = preparePage(canvases[i], settings.autoPreprocess);
    deskewAngle = Math.max(deskewAngle, Math.abs(prepared.angle));

    // پیش‌نمایش از نسخه بهبودیافته ساخته می‌شود تا در بازبینی، متن خوانا باشد
    if (i === 0) {
      thumbnail = makeThumbnail(prepared.gray, 720);
      preview = makeThumbnail(prepared.gray, 1500);
    }

    onStage(`خواندن متن صفحه ${i + 1} از ${pages}`, 0.34 + (i / canvases.length) * 0.5);

    // لایه ابری به‌صورت موازی با خوانش محلی اجرا می‌شود تا زمان انتظار کوتاه بماند
    const aiPromise: Promise<AiOcrResult> | null = (
      aiAllowed && i === 0 && !aiResult
        ? (async () => {
          enhancedForAi = await canvasToBlob(prepared.gray, 0.94);
          return recognizeWithAi(enhancedForAi, {
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
          });
        })()
        : null
    );

    // موتور قوی سروری (RapidOCR PP-OCRv5)؛ در نبودش خودکار به Tesseract برمی‌گردیم
    const serverResult = await recognizeViaServer(prepared.gray);
    let pageText = '';
    let pageConfidence = 0;
    if (serverResult && serverResult.text.trim()) {
      serverEngineUsed = true;
      pageText = serverResult.text;
      pageConfidence = serverResult.confidence;
      if (serverResult.items?.length) structuredItems.push(...serverResult.items);
      if (serverResult.totals) structuredTotals = { ...structuredTotals, ...serverResult.totals };
    } else {
      const local = await recognizeBest(prepared, settings, (_s, p) =>
        onStage(`خواندن متن صفحه ${i + 1}`, 0.34 + ((i + p) / canvases.length) * 0.5),
      );
      pageText = local.text;
      pageConfidence = local.confidence;
    }
    textParts.push(pageText);
    confSum += pageConfidence;

    if (aiPromise) {
      onStage(`مقایسه با موتور ابری صفحه ${i + 1}`, 0.9);
      aiResult = await aiPromise;
    }
  }

  onStage('استخراج و تصحیح هوشمند فیلدها', 0.94);
  const rawText = textParts.join('\n\n');
  let confidence = Math.round(confSum / canvases.length);
  const fullSettings = settings ?? (await getSettings());
  let parsed = parseInvoiceText(rawText, confidence, fullSettings.defaultTaxRate);

  // اقلام از فهم ساختار جدول: جای درست هر ستون، نه حدس از ترتیب متن
  if (structuredItems.length) {
    parsed = applyStructuredItems(parsed, structuredItems, structuredTotals);
  }

  let source: OcrSource = 'local';
  if (serverEngineUsed) {
    parsed.warnings.unshift('این سند با موتور قوی PP-OCRv5 (پردازش محلی) خوانده شد.');
  }

  if (aiResult?.ok && aiResult.fields) {
    const localParsed = parsed;
    parsed = mergeAiIntoParsed(localParsed, aiResult.fields, {
      model: aiResult.model,
      aiConfidence: aiResult.fields.confidence,
    });
    source = serverEngineUsed ? 'hybrid' : 'hybrid';
    confidence = Math.max(confidence, Math.round(aiResult.fields.confidence ?? 90));
  } else if (aiResult && !aiResult.ok) {
    parsed.warnings.unshift(
      `سرویس ابری پاسخ نداد و سند با موتور محلی خوانده شد: ${aiResult.error ?? 'خطای نامشخص'}`,
    );
  }
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
  return {
    invoice,
    rawText,
    confidence,
    meta: { fileName: file.name, fileType: file.type, thumbnail, pages },
    source,
    preview,
    aiError: aiResult && !aiResult.ok ? aiResult.error : undefined,
  };
}
