import { recognizeBest } from './engine';
import { recognizeViaServer } from './serverEngine';
import type { ServerItem, ServerTotals } from './serverEngine';
import {
  loadBitmap, bitmapToCanvas, makeThumbnail, enhanceCanvas, upscaleIfSmall,
  grayscaleEnhance, deskewCanvas, canvasToBlob,
} from './preprocess';
import { autoCropCanvas, photoQuality } from './autocrop';
import type { PhotoQuality } from './autocrop';
import { hashBlob } from './fingerprint';
import { getCachedOcr, putCachedOcr } from './cache';
import { splitDocuments, documentLabel } from './splitter';
import { renderPdfPages, isPdf, isImage, isExoticImage } from './pdf';
import { parseInvoiceText } from './parser';
import type { ParsedInvoice } from './parser';
import { invoiceFromParsed } from '../invoices';
import { getSettings } from '../db';
import { recognizeWithAi, AI_PROVIDERS } from './aiEngine';
import { applyStructuredItems } from './structured';
import { analyzeInvoiceText, applyFreeTextAnalysis } from './freetext';
import type { FreeMergeInfo, VendorHint } from './freetext';
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

/** یک سند از میان چند سندِ داخل یک فایل */
export interface DocumentCandidate {
  index: number;
  label: string;
  invoice: Invoice;
  confidence: number;
}

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
  /** خلاصه فهم نوشتاری سند (مستقل از ستون‌بندی) */
  free?: FreeMergeInfo;
  /** کیفیت عکس ورودی (تاری، نور، بازتاب) */
  quality?: PhotoQuality;
  /** نتیجه از کش خوانش آمده و موتور دوباره اجرا نشده است */
  fromCache?: boolean;
  /** اگر فایل چند سند بود، همه اسناد شناسایی‌شده */
  documents?: DocumentCandidate[];
  /** زمان صرف‌شده در هر مرحله (میلی‌ثانیه) */
  timings: { stage: string; ms: number }[];
}

export type StageCb = (stage: string, progress: number) => void;

export interface ProcessOptions {
  /** تأیید کاربر برای ارسال تصویر به سرویس ابری؛ نبودش یعنی ارسال مجاز نیست */
  onAiConsent?: (info: { fileName: string; providerLabel: string }) => Promise<boolean>;
  /** دانش فروشنده برای خوانش دقیق‌تر */
  hint?: VendorHint;
  /** نادیده گرفتن کش خوانش */
  skipCache?: boolean;
  /** برش خودکار قاب سند از عکس (پیش‌فرض روشن) */
  autoCrop?: boolean;
  /** دسته و مرکز هزینه‌ای که کاربر پیش از پردازش انتخاب کرده */
  category?: string;
  costCenter?: string;
}

interface PreparedPage {
  gray: HTMLCanvasElement;
  binary?: HTMLCanvasElement;
  angle: number;
  cropped: boolean;
}

/** آماده‌سازی یک صفحه: برش قاب، بزرگ‌نمایی، تصحیح کجی و دو نسخه خاکستری/باینری */
function preparePage(canvas: HTMLCanvasElement, autoPreprocess: boolean, autoCrop: boolean): PreparedPage {
  let base = canvas;
  let cropped = false;
  if (autoCrop) {
    const result = autoCropCanvas(base);
    base = result.canvas;
    cropped = result.cropped;
  }
  base = upscaleIfSmall(base);
  const { canvas: straightened, angle } = deskewCanvas(base);
  base = straightened;
  if (!autoPreprocess) return { gray: base, binary: undefined, angle, cropped };
  const gray = grayscaleEnhance(base);
  const binary = enhanceCanvas(base);
  return { gray, binary, angle, cropped };
}

/** ساخت فاکتور از یک متن، با همه لایه‌های فهم */
function buildParsed(
  text: string,
  confidence: number,
  taxRate: number,
  structuredItems: ServerItem[],
  structuredTotals: ServerTotals | undefined,
  hint?: VendorHint,
): { parsed: ParsedInvoice; free?: FreeMergeInfo } {
  let parsed = parseInvoiceText(text, confidence, taxRate);
  if (structuredItems.length) {
    parsed = applyStructuredItems(parsed, structuredItems, structuredTotals);
  }
  const freeAnalysis = analyzeInvoiceText(text, hint);
  const withFree = applyFreeTextAnalysis(parsed, freeAnalysis, {
    keepExistingItems: structuredItems.length > 0,
  });
  return { parsed: withFree, free: withFree.free };
}

export async function processFile(
  file: File,
  settings: AppSettings,
  onStage: StageCb,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const timings: { stage: string; ms: number }[] = [];
  const mark = (stage: string, startedAt: number) => {
    timings.push({ stage, ms: Math.round(performance.now() - startedAt) });
  };

  let canvases: HTMLCanvasElement[] = [];
  let thumbnail = '';
  let pages = 1;
  let quality: PhotoQuality | undefined;

  onStage('آماده‌سازی سند', 0.05);

  if (isPdf(file)) {
    const t0 = performance.now();
    onStage('استخراج صفحات PDF', 0.12);
    canvases = await renderPdfPages(file, settings.ocrQuality === 'accurate' ? 2.6 : 2);
    pages = canvases.length;
    mark('استخراج PDF', t0);
  } else if (isImage(file)) {
    const t0 = performance.now();
    let bitmap: ImageBitmap;
    try {
      bitmap = await loadBitmap(file);
    } catch {
      throw new Error(isExoticImage(file)
        ? 'این فرمت تصویر (HEIC/TIFF) در این مرورگر باز نمی‌شود؛ در گالری گوشی آن را به JPG تبدیل کنید یا با دوربین برنامه عکس بگیرید.'
        : 'فایل تصویری خراب یا پشتیبانی‌نشده است؛ JPG یا PNG امتحان کنید.');
    }
    const canvas = bitmapToCanvas(bitmap);
    bitmap.close?.();
    // سنجش کیفیت روی تصویر اصلی، پیش از هر بهبودی
    quality = photoQuality(canvas);
    canvases = [canvas];
    mark('بارگذاری تصویر', t0);
  } else {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود؛ فقط تصویر (JPG/PNG/WEBP) و PDF');
  }

  // اثر انگشت فایل برای کش خوانش
  const tHash = performance.now();
  const fileKey = await hashBlob(file);
  mark('اثر انگشت فایل', tHash);
  const cached = options.skipCache ? null : await getCachedOcr(fileKey);

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
  let cropped = false;
  let serverEngineUsed = false;
  let aiResult: AiOcrResult | undefined;
  let preview = '';
  const structuredItems: ServerItem[] = [];
  let structuredTotals: ServerTotals | undefined;

  for (let i = 0; i < canvases.length; i++) {
    const tPrep = performance.now();
    onStage(`بهبود کیفیت و تصحیح کجی صفحه ${i + 1}`, 0.18 + (i / canvases.length) * 0.14);
    const prepared = preparePage(canvases[i], settings.autoPreprocess, options.autoCrop !== false);
    deskewAngle = Math.max(deskewAngle, Math.abs(prepared.angle));
    cropped = cropped || prepared.cropped;
    mark(`آماده‌سازی صفحه ${i + 1}`, tPrep);

    // پیش‌نمایش از نسخه بهبودیافته ساخته می‌شود تا در بازبینی، متن خوانا باشد
    if (i === 0) {
      thumbnail = makeThumbnail(prepared.gray, 720);
      preview = makeThumbnail(prepared.gray, 1500);
    }

    // صفحه اول از کش: موتور دوباره اجرا نمی‌شود
    if (i === 0 && cached) {
      textParts.push(cached.text);
      confSum += cached.confidence;
      continue;
    }

    onStage(`خواندن متن صفحه ${i + 1} از ${pages}`, 0.34 + (i / canvases.length) * 0.5);

    // لایه ابری به‌صورت موازی با خوانش محلی اجرا می‌شود تا زمان انتظار کوتاه بماند
    const aiPromise: Promise<AiOcrResult> | null = (
      aiAllowed && i === 0 && !aiResult
        ? (async () => {
          const blob = await canvasToBlob(prepared.gray, 0.94);
          return recognizeWithAi(blob, {
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
          });
        })()
        : null
    );

    const tOcr = performance.now();
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
    mark(`خوانش صفحه ${i + 1}`, tOcr);
    textParts.push(pageText);
    confSum += pageConfidence;

    if (aiPromise) {
      onStage(`مقایسه با موتور ابری صفحه ${i + 1}`, 0.9);
      const tAi = performance.now();
      aiResult = await aiPromise;
      mark('لایه ابری', tAi);
    }
  }

  const rawText = textParts.join('\n\n');
  // نتیجه باکیفیت را برای پردازش‌های بعدی نگه دار
  if (!cached && rawText.trim()) {
    const avg = Math.round(confSum / Math.max(1, canvases.length));
    await putCachedOcr(fileKey, rawText, avg, serverEngineUsed ? 'server' : 'local');
  }

  const tParse = performance.now();
  onStage('استخراج و تصحیح هوشمند فیلدها', 0.94);
  let confidence = Math.round(confSum / Math.max(1, canvases.length));
  const fullSettings = settings ?? (await getSettings());
  const built = buildParsed(rawText, confidence, fullSettings.defaultTaxRate, structuredItems, structuredTotals, options.hint);
  let parsed = built.parsed;
  const freeInfo = built.free;

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
  if (cropped) {
    parsed.warnings.unshift('قاب سند از عکس جدا و پرسپکتیو آن تصحیح شد.');
  }
  if (quality && quality.verdict !== 'good') {
    quality.hints.forEach((hintText) => parsed.warnings.push(hintText));
  }
  if (cached) {
    parsed.warnings.unshift('این فایل قبلاً خوانده شده بود؛ نتیجه از حافظه محلی بازیابی شد.');
  }

  const makeInvoice = (p: ParsedInvoice) => invoiceFromParsed(p, {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    thumbnail,
    pages,
    rawText,
    ocrConfidence: confidence,
  }, fullSettings);

  const invoice = makeInvoice(parsed);

  // چند سند در یک فایل: همه اسناد شناسایی و آماده انتخاب می‌شوند
  let documents: DocumentCandidate[] | undefined;
  const parts = splitDocuments(rawText);
  if (parts.length > 1) {
    const candidates: DocumentCandidate[] = [];
    for (const [index, part] of parts.entries()) {
      const partBuilt = buildParsed(part.text, confidence, fullSettings.defaultTaxRate, [], undefined, options.hint);
      const partInvoice = makeInvoice(partBuilt.parsed);
      partInvoice.id = `${invoice.id}_doc${index}`;
      candidates.push({
        index,
        label: documentLabel(part),
        invoice: partInvoice,
        confidence,
      });
    }
    documents = candidates;
    parsed.warnings.push(`این فایل شامل ${parts.length} سند جداگانه است؛ سند مورد نظر را انتخاب کنید.`);
  }

  mark('استخراج فیلدها', tParse);

  const finalInvoice: Invoice = {
    ...invoice,
    category: options.category || invoice.category,
    costCenter: options.costCenter || invoice.costCenter,
  };

  onStage('تکمیل شد', 1);
  return {
    invoice: finalInvoice,
    rawText,
    confidence,
    meta: { fileName: file.name, fileType: file.type, thumbnail, pages },
    source,
    preview,
    aiError: aiResult && !aiResult.ok ? aiResult.error : undefined,
    free: freeInfo,
    quality,
    fromCache: !!cached,
    documents,
    timings,
  };
}
