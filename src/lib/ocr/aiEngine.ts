/**
 * موتور خوانش ابری — لایه «حداکثر دقت»
 *
 * این لایه اختیاری است و کلید API متعلق به خود کاربر در تنظیمات دستگاه ذخیره
 * می‌شود؛ هیچ کلیدی در بسته نرم‌افزاری یا سرور قرار ندارد. تصویر تنها زمانی
 * ارسال می‌شود که کاربر در همان لحظه تأیید کند.
 */
import type { AiProvider } from '../types';

export interface AiOcrConfig {
  provider: AiProvider;
  apiKey: string;
  model?: string;
}

export interface AiItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface AiFields {
  number?: string;
  date?: string;
  issuerName?: string;
  buyerName?: string;
  items: AiItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: 'IRR' | 'IRT';
  confidence?: number;
  notes?: string;
}

export interface AiOcrResult {
  ok: boolean;
  fields?: AiFields;
  error?: string;
  elapsedMs: number;
  model?: string;
}

export const AI_PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; keyUrl: string }> = {
  gemini: {
    label: 'گوگل Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
};

/** متن راهنمای مدل: خروجی ساخت‌یافته و بدون تفسیر آزاد */
const SCHEMA_PROMPT = `تو یک موتور استخراج داده از فاکتور و صورتحساب ایرانی هستی.
فقط و فقط یک شیء JSON برگردان؛ هیچ توضیح، مقدمه یا بلوک کد اضافه نگذار.

ساختار دقیق:
{
  "number": "شماره فاکتور همان‌گونه که چاپ شده",
  "date": "تاریخ سند به شکل YYYY/MM/DD (شمسی یا میلادی، همان‌گونه که در سند است)",
  "issuerName": "نام فروشنده یا صادرکننده",
  "buyerName": "نام خریدار یا مشتری",
  "items": [
    { "name": "شرح کالا یا خدمت", "qty": تعداد, "unitPrice": مبلغ واحد, "total": مبلغ کل ردیف }
  ],
  "subtotal": جمع کل قبل از مالیات,
  "discount": تخفیف,
  "tax": مالیات یا ارزش افزوده,
  "total": مبلغ نهایی قابل پرداخت,
  "currency": "IRR" یا "IRT",
  "confidence": عددی بین ۰ تا ۱۰۰ از میزان اطمینان خودت,
  "notes": "هر نکته‌ای که خواندن را مبهم کرده است"
}

قواعد:
- همه مبالغ و تعداد را عدد صحیح و بدون جداکننده هزارگان بنویس.
- ارقام فارسی را به لاتین تبدیل کن، اما متن فارسی را دقیقاً حفظ کن.
- اگر مقداری در سند نیست، null بگذار؛ هیچ عددی از خودت نساز.
- ردیف‌های جدول را کامل و به ترتیب سند بیاور.
- واحد پول را از متن یا بزرگی مبالغ تشخیص بده (معمولاً ریال یا تومان).`;

function toEnglishDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** تبدیل هر ورودی مدل به عدد سالم (بدون جداکننده و نویسه اضافه) */
export function toAmount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const digits = toEnglishDigits(value).replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

/** نمایش ایمن خطا بدون افشای کلید */
function safeError(err: unknown, apiKey: string): string {
  let message = err instanceof Error ? err.message : String(err);
  if (apiKey) message = message.split(apiKey).join('***');
  return message.slice(0, 300);
}

/** کوچک‌کردن تصویر برای ارسال: کیفیت کافی برای خوانش، حجم کم برای سرعت و هزینه */
async function prepareImage(blob: Blob, maxSide = 1800): Promise<{ mime: string; base64: string }> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { mime: 'image/jpeg', base64: dataUrl.split(',')[1] ?? '' };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('پاسخ مدل JSON نبود');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** نرمال‌سازی خروجی مدل به ساختار تایپ‌شده و رد مقادیر نامعتبر */
export function normalizeFields(raw: unknown): AiFields {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
  const items: AiItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const name = toText(item.name) ?? toText(item.title) ?? '';
    const qty = toAmount(item.qty ?? item.quantity) ?? 1;
    let unitPrice = toAmount(item.unitPrice ?? item.price ?? item.rate);
    let total = toAmount(item.total ?? item.amount);
    if (total === undefined && unitPrice !== undefined) total = unitPrice * qty;
    if (unitPrice === undefined && total !== undefined && qty > 0) unitPrice = Math.round(total / qty);
    if (!name && !total) continue;
    items.push({ name: name || 'کالا', qty: qty || 1, unitPrice: unitPrice ?? 0, total: total ?? (unitPrice ?? 0) * (qty || 1) });
  }

  const currency = obj.currency === 'IRR' || obj.currency === 'IRT' ? obj.currency : undefined;
  return {
    number: toText(obj.number)?.replace(/\s+/g, ''),
    date: toText(obj.date),
    issuerName: toText(obj.issuerName) ?? toText(obj.seller),
    buyerName: toText(obj.buyerName) ?? toText(obj.buyer),
    items,
    subtotal: toAmount(obj.subtotal),
    tax: toAmount(obj.tax),
    discount: toAmount(obj.discount),
    total: toAmount(obj.total),
    currency,
    confidence: toAmount(obj.confidence),
    notes: toText(obj.notes),
  };
}

async function callGemini(image: { mime: string; base64: string }, cfg: AiOcrConfig, signal?: AbortSignal): Promise<string> {
  const model = cfg.model?.trim() || AI_PROVIDERS.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: SCHEMA_PROMPT },
          { inline_data: { mime_type: image.mime, data: image.base64 } },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('پاسخ خالی از Gemini');
  return text;
}

async function callOpenAi(image: { mime: string; base64: string }, cfg: AiOcrConfig, signal?: AbortSignal): Promise<string> {
  const model = cfg.model?.trim() || AI_PROVIDERS.openai.defaultModel;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SCHEMA_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'این تصویر فاکتور است؛ داده‌ها را طبق ساختار استخراج کن.' },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: 'high' } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('پاسخ خالی از OpenAI');
  return text;
}

/** آزمون اتصال کلید بدون ارسال فاکتور واقعی */
export async function testAiConnection(cfg: AiOcrConfig): Promise<{ ok: boolean; error?: string; model?: string }> {
  const model = cfg.model?.trim() || AI_PROVIDERS[cfg.provider].defaultModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    if (cfg.provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
        { headers: { 'x-goog-api-key': cfg.apiKey }, signal: controller.signal },
      );
      if (!res.ok) return { ok: false, error: `کد ${res.status}` };
      return { ok: true, model };
    }
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `کد ${res.status}` };
    return { ok: true, model };
  } catch (err) {
    return { ok: false, error: safeError(err, cfg.apiKey) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * خوانش تصویر با مدل بینایی.
 * زمان‌بند امن دارد تا صف پردازش روی شبکه کند قفل نشود.
 */
export async function recognizeWithAi(blob: Blob, cfg: AiOcrConfig, timeoutMs = 120000): Promise<AiOcrResult> {
  const started = performance.now();
  const model = cfg.model?.trim() || AI_PROVIDERS[cfg.provider].defaultModel;
  if (!cfg.apiKey.trim()) {
    return { ok: false, error: 'کلید API تنظیم نشده است', elapsedMs: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const image = await prepareImage(blob);
    const text = cfg.provider === 'gemini'
      ? await callGemini(image, cfg, controller.signal)
      : await callOpenAi(image, cfg, controller.signal);
    const fields = normalizeFields(extractJson(text));
    return {
      ok: true,
      fields,
      model,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      model,
      error: aborted ? 'پاسخ سرویس ابری در زمان مجاز نرسید' : safeError(err, cfg.apiKey),
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}
