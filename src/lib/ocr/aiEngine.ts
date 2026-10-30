/**
 * موتور خوانش ابری — لایه «حداکثر دقت»
 *
 * کلید API متعلق به خود کاربر روی همان دستگاه ذخیره می‌شود؛ هیچ کلیدی در بسته
 * نرم‌افزاری یا سرور نیست و تصویر تنها با تأیید همان لحظه کاربر ارسال می‌شود.
 *
 * این لایه برای فاکتورهای فارسی نوشته شده است: مدل مستقیم تصویر را می‌بیند
 * (بدون واسطه OCR) و خروجی را در ساختار دقیق JSON می‌دهد؛ پس خطای «ارقام
 * مخدوش» و «متن تبلیغ داخل نام کالا» در آن وجود ندارد.
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
  /** تخفیف همان ردیف */
  discount?: number;
  /** درصد مالیات همان ردیف (مثلاً ۹) */
  taxRate?: number;
  /** کد کالا یا بارکد چاپ‌شده */
  code?: string;
  /** واحد شمارش: عدد، کیلوگرم، بسته… */
  unit?: string;
  /** اطمینان مدل به همین ردیف (۰ تا ۱۰۰) */
  confidence?: number;
}

export interface AiFields {
  number?: string;
  date?: string;
  issuerName?: string;
  buyerName?: string;
  issuerTaxId?: string;
  items: AiItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: 'IRR' | 'IRT';
  confidence?: number;
  notes?: string;
  /** صفحه‌ای که این داده از آن آمده (در اسناد چندصفحه‌ای) */
  page?: number;
}

export interface AiOcrResult {
  ok: boolean;
  fields?: AiFields;
  error?: string;
  elapsedMs: number;
  model?: string;
  /** حجم تصویر ارسال‌شده به کیلوبایت — برای نمایش در تأیید ارسال */
  imageKb?: number;
  /** شمار تلاش‌ها (برای خطای گذرای شبکه) */
  attempts?: number;
}

export const AI_PROVIDERS: Record<AiProvider, {
  label: string;
  defaultModel: string;
  keyUrl: string;
  hint: string;
  models: string[];
}> = {
  gemini: {
    label: 'گوگل Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    hint: 'سریع و ارزان، فارسی را خوب می‌خواند؛ برای اکثر فاکتورها کافی است.',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'],
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'دقت بالا در جدول‌های شلوغ و ارقام؛ کمی کندتر.',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  },
  openrouter: {
    label: 'OpenRouter (چند مدل با یک کلید)',
    defaultModel: 'google/gemini-2.5-flash',
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'با یک کلید به Gemini، Claude و مدل‌های دیگر دسترسی دارید.',
    models: [
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-4.1-mini',
    ],
  },
};

/** متن راهنمای مدل: خواندن دقیق فاکتور فارسی و خروجی ساخت‌یافته */
const SCHEMA_PROMPT = `تو یک موتور استخراج داده از فاکتور و صورتحساب ایرانی هستی. تصویر سند را دقیق بخوان.
فقط و فقط یک شیء JSON برگردان؛ هیچ توضیح، مقدمه یا بلوک کد اضافه نگذار.

ساختار دقیق:
{
  "number": "شماره فاکتور همان‌گونه که چاپ شده",
  "date": "تاریخ سند مثل 1404/05/01 (شمسی همان‌گونه که در سند است)",
  "issuerName": "نام فروشنده/فروشگاه",
  "buyerName": "نام خریدار یا مشتری",
  "issuerTaxId": "کد اقتصادی یا شناسه ملی فروشنده",
  "items": [
    {
      "name": "شرح کالا دقیقاً همان‌طور که در جدول چاپ شده",
      "qty": تعداد,
      "unitPrice": قیمت واحد,
      "discount": تخفیف همان ردیف,
      "taxRate": درصد مالیات همان ردیف,
      "code": "کد کالا یا بارکد اگر چاپ شده",
      "unit": "واحد شمارش مثل عدد، کیلوگرم، بسته",
      "total": مبلغ کل همان ردیف,
      "confidence": اطمینان خودت به این ردیف از ۰ تا ۱۰۰
    }
  ],
  "subtotal": جمع کل قبل از مالیات,
  "discount": تخفیف کل سند,
  "tax": مالیات یا ارزش افزوده کل,
  "total": مبلغ نهایی قابل پرداخت,
  "currency": "IRR" یا "IRT",
  "confidence": اطمینان کلی از ۰ تا ۱۰۰,
  "notes": "هر نکته‌ای که خواندن را مبهم کرده است"
}

قواعد مهم:
- فقط ردیف‌های جدول اقلام را در items بیاور. سربرگ فروشگاه، آدرس، تلفن، کد اقتصادی،
  متن جشنواره، امتیاز، شرایط، شماره کارتخوان و جمع‌بندی‌ها هرگز جزو items نیستند.
- نام کالا را کامل و تمیز بنویس؛ اگر نام در چند خط شکسته شده، یک نام یکپارچه بساز.
- همه مبالغ را عدد صحیح و بدون جداکننده هزارگان و بدون واحد پول بنویس.
- اگر ستون «قیمت واحد» و «مبلغ کل» هر دو هست، هر دو را پر کن؛ اگر فقط مبلغ کل هست،
  unitPrice را از تقسیم بر تعداد بساز.
- اگر ستون تخفیف وجود ندارد، discount را 0 بگذار. اگر نرخ مالیات ردیف مشخص نیست،
  taxRate را 0 بگذار.
- مبلغ نهایی (total فاکتور) همان «قابل پرداخت» چاپ‌شده است، نه جمع ردیف‌ها.
- اگر بخشی از تصویر ناخوانا یا قطع است، برای همان مقدار null بگذار و در notes بنویس؛
  هیچ عددی از خودت نساز و ردیفی را حذف یا ادغام نکن.
- ترتیب ردیف‌ها همان ترتیب سند باشد.
- واحد پول را از بزرگی مبالغ و متن سند تشخیص بده (تومان = IRT، ریال = IRR).`;

/** مدل‌های پیشنهادی سرویس */
export function modelsOf(provider: AiProvider): string[] {
  return AI_PROVIDERS[provider]?.models ?? [];
}

export function defaultModelOf(provider: AiProvider): string {
  return AI_PROVIDERS[provider]?.defaultModel ?? AI_PROVIDERS.gemini.defaultModel;
}

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
  const normalized = toEnglishDigits(value).replace(/[٬،٫]/g, ',');
  const digits = normalized.replace(/[^\d]/g, '');
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

/** پیام فارسی برای کدهای رایج HTTP */
function httpError(label: string, status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new Error(`${label}: کلید API پذیرفته نشد (کد ${status}). کلید را دوباره بررسی کنید.`);
  }
  if (status === 404) {
    return new Error(`${label}: مدل انتخابی پیدا نشد (کد 404). نام مدل را در تنظیمات اصلاح کنید.`);
  }
  if (status === 429) {
    return new Error(`${label}: سهمیه یا محدودیت درخواست (کد 429). چند لحظه بعد دوباره تلاش کنید.`);
  }
  if (status >= 500) {
    return new Error(`${label}: سرویس موقتاً در دسترس نیست (کد ${status}).`);
  }
  return new Error(`${label} ${status}: ${body.slice(0, 180)}`);
}

/** خطای گذرا که تلاش دوباره ارزش دارد */
function isRetryable(err: unknown): boolean {
  const text = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /کد 429|کد 5\d\d|موقت|timeout|aborted|network|failed to fetch|fetch failed/.test(text);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** کوچک‌کردن تصویر برای ارسال: کیفیت کافی برای خوانش، حجم کم برای سرعت و هزینه */
async function prepareImage(blob: Blob, maxSide = 2000): Promise<{ mime: string; base64: string; kb: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('این تصویر در مرورگر باز نشد (فرمت HEIC/TIFF یا فایل خراب). آن را به JPG تبدیل کنید.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('پردازش تصویر در این مرورگر ممکن نیست');
  // زمینه سفید: تصاویر شفاف (PNG) سیاه نشوند
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1] ?? '';
  return { mime: 'image/jpeg', base64, kb: Math.round((base64.length * 3) / 4 / 1024) };
}

/** JSON را از پاسخ مدل بیرون می‌کشد؛ حتی وقتی مدل ساختار را کمی خراب کرده باشد */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('پاسخ مدل JSON نبود');
  const body = cleaned.slice(start, end + 1);

  // اصلاح خرابی‌های رایج: کامای اضافه، نقل‌قول تک، کامنت، عدد با جداکننده هزارگان
  const candidates = [
    body,
    body.replace(/,\s*([}\]])/g, '$1'),
    body.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"'),
    body
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
      .replace(/(:\s*)"([\d٬،,\.\s]+)"/g, (_m, p, v: string) => `:${p}"${v.replace(/[٬،,]/g, '')}"`),
  ];
  let lastError = 'پاسخ مدل JSON نبود';
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`پاسخ مدل قابل خواندن نبود (${lastError.slice(0, 80)})`);
}

/** پاک‌سازی نام کالای برگشتی از مدل */
function cleanName(name: string): string {
  return name
    .replace(/[|¦]/g, ' ')
    .replace(/[★☆•●▪◦※]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** نرمال‌سازی خروجی مدل به ساختار تایپ‌شده و رد مقادیر نامعتبر */
export function normalizeFields(raw: unknown): AiFields {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
  const items: AiItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const name = cleanName(toText(item.name) ?? toText(item.title) ?? '');
    const qty = toAmount(item.qty ?? item.quantity) ?? 1;
    let unitPrice = toAmount(item.unitPrice ?? item.price ?? item.rate);
    let total = toAmount(item.total ?? item.amount);
    if (total === undefined && unitPrice !== undefined) total = unitPrice * Math.max(1, qty);
    if (unitPrice === undefined && total !== undefined && qty > 0) unitPrice = Math.round(total / qty);
    if (!name && !total) continue;
    const discount = toAmount(item.discount);
    const taxRateRaw = toAmount(item.taxRate ?? item.tax);
    const confidence = toAmount(item.confidence);
    items.push({
      name: name || 'کالا',
      qty: qty > 0 ? qty : 1,
      unitPrice: unitPrice ?? 0,
      total: total ?? (unitPrice ?? 0) * Math.max(1, qty),
      discount: discount && discount > 0 ? discount : undefined,
      taxRate: taxRateRaw && taxRateRaw > 0 && taxRateRaw <= 100 ? taxRateRaw : undefined,
      code: toText(item.code ?? item.barcode ?? item.sku),
      unit: toText(item.unit ?? item.uom),
      confidence: confidence && confidence > 0 && confidence <= 100 ? confidence : undefined,
    });
  }

  const currency = obj.currency === 'IRR' || obj.currency === 'IRT' ? obj.currency : undefined;
  return {
    number: toText(obj.number)?.replace(/\s+/g, ''),
    date: toText(obj.date),
    issuerName: toText(obj.issuerName) ?? toText(obj.seller),
    buyerName: toText(obj.buyerName) ?? toText(obj.buyer),
    issuerTaxId: toText(obj.issuerTaxId) ?? toText(obj.taxId),
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

/**
 * ادغام خوانش چند صفحه از یک سند.
 * اقلام به ترتیب صفحه‌ها کنار هم می‌آیند و فیلدهای سربرگ از اولین صفحه‌ای
 * که مقدار داشته‌اند برداشته می‌شود؛ مبلغ نهایی از آخرین صفحه‌ای می‌آید که
 * «قابل پرداخت» داشته باشد.
 */
export function mergeAiPages(pages: AiFields[]): AiFields {
  const merged: AiFields = { items: [] };
  for (const page of pages) {
    merged.items.push(...page.items);
    merged.number ??= page.number;
    merged.date ??= page.date;
    merged.issuerName ??= page.issuerName;
    merged.buyerName ??= page.buyerName;
    merged.issuerTaxId ??= page.issuerTaxId;
    merged.currency ??= page.currency;
    merged.subtotal ??= page.subtotal;
    merged.discount ??= page.discount;
    if (page.tax) merged.tax = (merged.tax ?? 0) + page.tax;
    if (page.total) merged.total = page.total;
    if (page.notes) merged.notes = [merged.notes, page.notes].filter(Boolean).join(' | ');
  }
  const confidences = pages.map((page) => page.confidence).filter((c): c is number => typeof c === 'number');
  if (confidences.length) merged.confidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  if (merged.items.length > 1) {
    const pageLevel = pages.flatMap((page) => (page.page ? [page.page] : []));
    if (pageLevel.length) merged.page = Math.max(...pageLevel);
  }
  return merged;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw httpError('سرویس ابری', response.status, await response.text());
  return response.json();
}

async function callGemini(image: { mime: string; base64: string }, cfg: AiOcrConfig, signal?: AbortSignal): Promise<string> {
  const model = cfg.model?.trim() || AI_PROVIDERS.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = await postJson(url, {
    contents: [{
      role: 'user',
      parts: [
        { text: SCHEMA_PROMPT },
        { inline_data: { mime_type: image.mime, data: image.base64 } },
      ],
    }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  }, { 'x-goog-api-key': cfg.apiKey }, signal) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text) throw new Error('پاسخ خالی از Gemini');
  return text;
}

/** OpenAI و هر سرویس سازگار با آن (OpenRouter) */
async function callOpenAiCompatible(
  image: { mime: string; base64: string },
  cfg: AiOcrConfig,
  options: { url: string; label: string; extraHeaders?: Record<string, string> },
  signal?: AbortSignal,
): Promise<string> {
  const model = cfg.model?.trim() || defaultModelOf(cfg.provider);
  const payload = await postJson(options.url, {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SCHEMA_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'این تصویر فاکتور است؛ همه ردیف‌های جدول را طبق ساختار JSON استخراج کن.' },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: 'high' } },
        ],
      },
    ],
  }, { Authorization: `Bearer ${cfg.apiKey}`, ...(options.extraHeaders ?? {}) }, signal) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`پاسخ خالی از ${options.label}`);
  return text;
}

async function callProvider(image: { mime: string; base64: string }, cfg: AiOcrConfig, signal?: AbortSignal): Promise<string> {
  if (cfg.provider === 'gemini') return callGemini(image, cfg, signal);
  if (cfg.provider === 'openrouter') {
    return callOpenAiCompatible(image, cfg, {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      label: 'OpenRouter',
      extraHeaders: { 'HTTP-Referer': 'https://faktorizm.ir', 'X-Title': 'Faktorizm' },
    }, signal);
  }
  return callOpenAiCompatible(image, cfg, {
    url: 'https://api.openai.com/v1/chat/completions',
    label: 'OpenAI',
  }, signal);
}

/** آزمون اتصال کلید بدون ارسال فاکتور واقعی */
export async function testAiConnection(cfg: AiOcrConfig): Promise<{ ok: boolean; error?: string; model?: string }> {
  const model = cfg.model?.trim() || defaultModelOf(cfg.provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    if (cfg.provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
        { headers: { 'x-goog-api-key': cfg.apiKey }, signal: controller.signal },
      );
      if (!res.ok) return { ok: false, error: httpError('Gemini', res.status, await res.text()).message };
      return { ok: true, model };
    }
    const url = cfg.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/models' : 'https://api.openai.com/v1/models';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: controller.signal });
    if (!res.ok) return { ok: false, error: httpError(AI_PROVIDERS[cfg.provider].label, res.status, await res.text()).message };
    return { ok: true, model };
  } catch (err) {
    return { ok: false, error: safeError(err, cfg.apiKey) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * خوانش تصویر با مدل بینایی.
 * خطاهای گذرا (۴۲۹ و ۵۰۰) یک بار دیگر با تأخیر کوتاه تلاش می‌شوند و اگر مدل
 * JSON معیوب برگرداند، یک بار با درخواست اصلاح دوباره پرسیده می‌شود.
 */
export async function recognizeWithAi(blob: Blob, cfg: AiOcrConfig, timeoutMs = 120000): Promise<AiOcrResult> {
  const started = performance.now();
  const model = cfg.model?.trim() || defaultModelOf(cfg.provider);
  if (!cfg.apiKey.trim()) {
    return { ok: false, error: 'کلید API تنظیم نشده است؛ در تنظیمات وارد کنید.', elapsedMs: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let image: { mime: string; base64: string; kb: number } | undefined;
  let attempts = 0;
  try {
    image = await prepareImage(blob);
    let lastError: unknown;
    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      attempts = attempt + 1;
      try {
        text = await callProvider(image, cfg, controller.signal);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt > 0) throw error;
        await sleep(1200);
      }
    }
    if (lastError) throw lastError;

    let fields: AiFields;
    try {
      fields = normalizeFields(extractJson(text));
    } catch {
      // یک بار دیگر با تأکید بر JSON خالص می‌پرسیم
      text = await callProvider(image, cfg, controller.signal);
      fields = normalizeFields(extractJson(text));
    }

    return {
      ok: true,
      fields,
      model,
      imageKb: image.kb,
      attempts,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const aborted = (err instanceof DOMException && err.name === 'AbortError')
      || (err instanceof Error && /aborted|abort/i.test(err.message));
    return {
      ok: false,
      model,
      attempts,
      imageKb: image?.kb,
      error: aborted
        ? 'پاسخ سرویس ابری در زمان مجاز نرسید؛ اتصال اینترنت یا مدل را بررسی کنید.'
        : safeError(err, cfg.apiKey),
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}
