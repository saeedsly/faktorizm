/**
 * فهرست سرویس‌های ابری خوانش فاکتور — با تمرکز روی گزینه‌های «رایگان»
 *
 * گرفتن کلید هیچ‌کدام از این سرویس‌ها پول نمی‌خواهد و کارت بانکی لازم نیست؛
 * فقط یک ثبت‌نام دومرحله‌ای است. کلیدها را خود کاربر می‌سازد و برنامه فقط
 * جای درست گذاشتنشان را می‌داند. این فهرست هر سرویس را با آدرس پایه، مدل‌های
 * پیشنهادی، سقف مصرف رایگان و لینک گرفتن کلید می‌شناسد تا کاربر بدون خواندن
 * مستندات، در ۳۰ ثانیه به خوانش ابری برسد.
 */

export type ProviderId =
  | 'gemini'
  | 'openrouter'
  | 'github'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'custom'
  | 'openai';

export interface ProviderModel {
  id: string;
  /** نام خوانا برای کاربر */
  label: string;
  /** مناسب فاکتور فارسی؟ */
  best?: boolean;
  note?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** سرویس رایگان است؟ */
  free: 'free' | 'free-tier' | 'paid' | 'local';
  /** توضیح یک‌خطی */
  hint: string;
  /** آدرس پایه سازگار با OpenAI (بدون /chat/completions) */
  baseUrl: string;
  /** آدرس گوگل سبک خاص خودش را دارد */
  kind: 'gemini' | 'openai-compatible';
  /** لینک گرفتن کلید */
  keyUrl: string;
  /** راهنمای کوتاه محل ساخت کلید */
  keySteps: string[];
  /** سقف مصرف رایگان */
  rateNote: string;
  /** کلید لازم ندارد (مدل محلی) */
  keyless?: boolean;
  models: ProviderModel[];
  defaultModel: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'گوگل AI Studio (Gemini)',
    free: 'free-tier',
    hint: 'سخاوتمندترین سقف رایگان و بهترین دقت فارسی؛ اول این را امتحان کنید.',
    baseUrl: 'https://generativelanguage.googleapis.com',
    kind: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keySteps: ['با حساب گوگل وارد شوید', 'دکمه Create API key', 'کلید را کپی و اینجا بچسبانید'],
    rateNote: 'سقف رایگان روزانه دارد؛ برای چند ده فاکتور در روز کافی است.',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', best: true, note: 'سریع و دقیق برای فاکتور فارسی' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'دقیق‌تر، کندتر، سقف رایگان کمتر' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'نسل قبل، سقف رایگان بالاتر' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (مدل‌های :free)',
    free: 'free',
    hint: 'با یک کلید به ده‌ها مدل رایگان دسترسی دارید؛ بعضی مدل‌ها پسوند :free دارند.',
    baseUrl: 'https://openrouter.ai/api/v1',
    kind: 'openai-compatible',
    keyUrl: 'https://openrouter.ai/keys',
    keySteps: ['با گوگل یا گیت‌هاب وارد شوید', 'Create Key', 'کلید را کپی و اینجا بچسبانید'],
    rateNote: 'حدود ۵۰ تا ۲۰۰ درخواست در روز روی مدل‌های :free.',
    defaultModel: 'google/gemma-4-31b-it:free',
    models: [
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)', best: true, note: 'چندزبانه و قوی در خواندن تصویر' },
      { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B MoE (free)', note: 'سریع‌تر، سبک‌تر' },
      { id: 'qwen/qwen2.5-vl-72b-instruct:free', label: 'Qwen2.5-VL 72B (free)', note: 'قوی در جدول و ارقام' },
      { id: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 (free)' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron Nano Omni (free)', note: 'چندحالته' },
      { id: 'openrouter/free', label: 'مسیریاب خودکار رایگان', note: 'خودش یک مدل رایگان انتخاب می‌کند' },
    ],
  },
  github: {
    id: 'github',
    label: 'GitHub Models',
    free: 'free-tier',
    hint: 'با همان حساب گیت‌هاب، کلید رایگان بگیرید؛ GPT-4.1 و Llama 4 هم دارد.',
    baseUrl: 'https://models.github.ai/inference',
    kind: 'openai-compatible',
    keyUrl: 'https://github.com/settings/tokens',
    keySteps: [
      'یک Personal Access Token بسازید (fine-grained)',
      'دسترسی Models → read را بدهید',
      'توکن را اینجا بچسبانید',
    ],
    rateNote: 'سقف رایگان حدود ۵۰ تا ۱۵۰ درخواست در روز و ۸ هزار توکن ورودی در هر درخواست.',
    defaultModel: 'openai/gpt-4.1-mini',
    models: [
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini', best: true, note: 'سبک و دقیق' },
      { id: 'openai/gpt-4.1', label: 'GPT-4.1', note: 'دقیق‌تر، سقف کمتر' },
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
      { id: 'meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', note: 'متن‌باز و سریع' },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    free: 'free-tier',
    hint: 'سریع‌ترین پاسخ؛ مدل Llama 4 تصویر را می‌خواند.',
    baseUrl: 'https://api.groq.com/openai/v1',
    kind: 'openai-compatible',
    keyUrl: 'https://console.groq.com/keys',
    keySteps: ['با گوگل یا گیت‌هاب وارد شوید', 'Create API Key', 'کلید را اینجا بچسبانید'],
    rateNote: 'سقف رایگان روزانه دارد؛ مدل‌های تصویری ممکن است سهمیه جداگانه بخواهند.',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', best: true },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick', note: 'دقیق‌تر' },
    ],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    free: 'free-tier',
    hint: 'اشتراک Experiment رایگان دارد و مدل Pixtral تصویر را می‌خواند.',
    baseUrl: 'https://api.mistral.ai/v1',
    kind: 'openai-compatible',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keySteps: ['ثبت‌نام با ایمیل یا گوگل', 'Plan را روی Experiment (رایگان) بگذارید', 'API Key بسازید و اینجا بچسبانید'],
    rateNote: 'اشتراک رایگان با محدودیت نرخ؛ برای استفاده سبک مناسب است.',
    defaultModel: 'pixtral-12b-2409',
    models: [
      { id: 'pixtral-12b-2409', label: 'Pixtral 12B', best: true },
      { id: 'mistral-small-latest', label: 'Mistral Small (چندحالته)' },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'مدل محلی روی رایانه خودتان (Ollama)',
    free: 'local',
    hint: 'کاملاً رایگان و آفلاین؛ بعد از یک بار دانلود مدل، هیچ محدودیتی ندارد.',
    baseUrl: 'http://localhost:11434/v1',
    kind: 'openai-compatible',
    keyUrl: 'https://ollama.com/download',
    keySteps: [
      'Ollama را نصب کنید و اجرا نگه دارید',
      'در ترمینال: ollama pull qwen2.5vl:7b',
      'همین‌جا بدون کلید وصل شوید',
    ],
    rateNote: 'بدون سقف؛ سرعتش به سخت‌افزار رایانه شما بستگی دارد.',
    keyless: true,
    defaultModel: 'qwen2.5vl:7b',
    models: [
      { id: 'qwen2.5vl:7b', label: 'Qwen2.5-VL 7B', best: true, note: 'بهترین گزینه محلی برای فارسی' },
      { id: 'minicpm-v:8b', label: 'MiniCPM-V 8B', note: 'سبک‌تر' },
      { id: 'llama3.2-vision:11b', label: 'Llama 3.2 Vision 11B' },
      { id: 'llava:7b', label: 'LLaVA 7B', note: 'قدیمی ولی کم‌حجم' },
    ],
  },
  custom: {
    id: 'custom',
    label: 'سرویس دلخواه (OpenAI-compatible)',
    free: 'free-tier',
    hint: 'هر سرویس یا پروکسی سازگار با OpenAI؛ آدرس پایه را خودتان می‌دهید.',
    baseUrl: '',
    kind: 'openai-compatible',
    keyUrl: '',
    keySteps: ['آدرس پایه را در تنظیمات وارد کنید', 'اگر کلید دارد، بچسبانید'],
    rateNote: 'بستگی به سرویس شما دارد.',
    defaultModel: '',
    models: [],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (پرداختی)',
    free: 'paid',
    hint: 'دقیق‌ترین گزینه برای جدول‌های شلوغ، ولی رایگان نیست.',
    baseUrl: 'https://api.openai.com/v1',
    kind: 'openai-compatible',
    keyUrl: 'https://platform.openai.com/api-keys',
    keySteps: ['وارد شوید', 'Create new secret key', 'کلید را اینجا بچسبانید'],
    rateNote: 'پرداختی بر اساس مصرف.',
    defaultModel: 'gpt-4.1-mini',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', best: true },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    ],
  },
};

/** ترتیب پیشنهادی: اول گزینه‌های رایگان و بی‌دردسر */
export const FREE_FIRST: ProviderId[] = ['gemini', 'openrouter', 'github', 'groq', 'mistral', 'ollama', 'custom', 'openai'];

export function providerInfo(id: string | undefined): ProviderInfo {
  return PROVIDERS[(id as ProviderId) ?? 'gemini'] ?? PROVIDERS.gemini;
}

export function modelsOf(id: string | undefined): ProviderModel[] {
  return providerInfo(id).models;
}

export function defaultModelOf(id: string | undefined): string {
  return providerInfo(id).defaultModel;
}

/** برچسب کوتاه رایگان‌بودن برای نمایش در رابط کاربری */
export const FREE_BADGE: Record<ProviderInfo['free'], { label: string; tone: string }> = {
  free: { label: 'رایگان', tone: 'bg-accent-soft text-accent' },
  'free-tier': { label: 'سقف رایگان', tone: 'bg-info-soft text-info' },
  local: { label: 'آفلاین و بی‌نهایت', tone: 'bg-primary-soft text-primary' },
  paid: { label: 'پرداختی', tone: 'bg-warning-soft text-warning' },
};

/**
 * کلیدهای کاربر: هر خط یک کلید.
 * چند کلید یعنی اگر یکی به سقف خورد، بعدی امتحان می‌شود.
 */
export function keysOf(settings: { aiKeys?: string; aiApiKey?: string }): string[] {
  const raw = `${settings.aiKeys ?? ''}\n${settings.aiApiKey ?? ''}`;
  const keys = raw
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter((key) => key.length >= 8);
  return [...new Set(keys)];
}

/** آدرس پایه مؤثر: اگر کاربر آدرس دلخواه داده، همان مقدم است */
export function baseUrlOf(providerId: string | undefined, customBase?: string): string {
  const trimmed = (customBase ?? '').trim().replace(/\/+$/, '');
  if (trimmed) return trimmed;
  return providerInfo(providerId).baseUrl.replace(/\/+$/, '');
}
