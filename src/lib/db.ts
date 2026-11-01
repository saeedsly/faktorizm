import Dexie, { type Table } from 'dexie';
import type {
  Invoice, Contact, Product, ApiKey, Webhook, Activity, AppSettings,
  AuditEntry, InvoiceVersion, PaymentPlan, VendorProfile, OcrCacheEntry, AiCacheEntry,
  UsageEntry, QueuedFile,
} from './types';

class FaktorizmDB extends Dexie {
  invoices!: Table<Invoice, string>;
  contacts!: Table<Contact, string>;
  products!: Table<Product, string>;
  apiKeys!: Table<ApiKey, string>;
  webhooks!: Table<Webhook, string>;
  activities!: Table<Activity, string>;
  settings!: Table<AppSettings, string>;
  audit!: Table<AuditEntry, string>;
  versions!: Table<InvoiceVersion, string>;
  paymentPlans!: Table<PaymentPlan, string>;
  vendors!: Table<VendorProfile, string>;
  ocrCache!: Table<OcrCacheEntry, string>;
  aiCache!: Table<AiCacheEntry, string>;
  usage!: Table<UsageEntry, string>;
  queue!: Table<QueuedFile, string>;

  constructor() {
    super('faktorizm-db');
    this.version(1).stores({
      invoices: 'id, number, status, paymentStatus, direction, category, contactId, date, createdAt, updatedAt, deletedAt, source',
      contacts: 'id, name, type, createdAt',
      products: 'id, code, title, category, usageCount, createdAt',
      apiKeys: 'id, key, enabled, createdAt',
      webhooks: 'id, enabled, createdAt',
      activities: 'id, at, entity, action',
      settings: 'id',
    });
    // نسخه ۲: تاریخچه، نسخه‌ها، اقساط، پروفایل فروشنده، کش خوانش و صف پایدار
    this.version(2).stores({
      invoices: 'id, number, status, paymentStatus, direction, category, contactId, date, createdAt, updatedAt, deletedAt, source, issuerName, costCenter',
      contacts: 'id, name, type, createdAt',
      products: 'id, code, title, category, usageCount, createdAt',
      apiKeys: 'id, key, enabled, createdAt',
      webhooks: 'id, enabled, createdAt',
      activities: 'id, at, entity, action',
      settings: 'id',
      audit: 'id, invoiceId, at, action',
      versions: 'id, invoiceId, at',
      paymentPlans: 'id, invoiceId, dueDate, paidAt',
      vendors: 'id, key, name, lastSeenAt',
      ocrCache: 'key, at',
      aiCache: 'key, at',
      usage: 'day',
      queue: 'id, priority, addedAt',
    });
  }
}

export const db = new FaktorizmDB();

/**
 * پروفایل آماده — بستهٔ «تست سریع».
 *
 * کاربر این کلید را خودش ساخته و خواسته داخل برنامه باشد تا لازم نباشد دنبال
 * ساخت کلید برود. کلید فقط به‌عنوان مقدار اولیه در IndexedDB همین دستگاه
 * می‌نشیند (همان جایی که کلید دستی هم می‌نشست) و به هیچ سروری فرستاده نمی‌شود.
 * برای بسته‌های عمومی، `PRESET_KEY` را خالی کنید.
 */
const PRESET_KEY = 'K8752522415505188957';

const PRESET: Partial<AppSettings> = PRESET_KEY
  ? {
    ocrEngine: 'ai',
    aiProvider: 'ocrspace',
    aiKeys: PRESET_KEY,
    aiApiKey: '',
    aiModel: 'ara',
    aiBaseUrl: 'https://api.ocr.space',
    aiAskEachTime: false,
    onboarded: true,
  }
  : {};

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'singleton',
  businessName: 'کسب‌وکار من',
  businessEconomicCode: '',
  businessNationalId: '',
  businessPhone: '',
  businessAddress: '',
  defaultTaxRate: 10,
  currency: 'IRT',
  theme: 'dark',
  ocrLangs: 'fas+eng',
  ocrQuality: 'balanced',
  autoPreprocess: true,
  ocrEngine: 'local',
  aiProvider: 'gemini',
  aiApiKey: '',
  aiKeys: '',
  aiBaseUrl: '',
  aiModel: '',
  aiAskEachTime: true,
  autoApproveThreshold: 85,
  onboarded: false,
  seeded: false,
  ...PRESET,
};

/** شناسه‌های معتبر موتور ابری — برای پاک‌سازی داده‌های ذخیره‌شدهٔ نسخه‌های قدیمی */
const KNOWN_PROVIDERS = ['gemini', 'ocrspace', 'openrouter', 'github', 'groq', 'mistral', 'ollama', 'custom', 'openai'];
const KNOWN_ENGINES = ['local', 'ai', 'hybrid'];

/**
 * تنظیمات ذخیره‌شده ممکن است از نسخهٔ قدیمی برنامه باشد: فیلد تازه‌ای نداشته
 * باشد یا شناسهٔ حذف‌شده‌ای مثل موتور ابری قدیمی در آن مانده باشد. بدون این
 * پاک‌سازی، اولین دسترسی به `PROVIDERS[settings.aiProvider]` خطا می‌دهد و
 * صفحه سفید می‌شود.
 */
export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}), id: 'singleton' as const };
  if (!KNOWN_PROVIDERS.includes(merged.aiProvider)) merged.aiProvider = DEFAULT_SETTINGS.aiProvider;
  if (!KNOWN_ENGINES.includes(merged.ocrEngine)) merged.ocrEngine = DEFAULT_SETTINGS.ocrEngine;
  const threshold = Number(merged.autoApproveThreshold);
  merged.autoApproveThreshold = Number.isFinite(threshold) ? Math.min(100, Math.max(0, threshold)) : 85;
  const tax = Number(merged.defaultTaxRate);
  merged.defaultTaxRate = Number.isFinite(tax) ? Math.min(100, Math.max(0, tax)) : 10;
  if (merged.theme !== 'light' && merged.theme !== 'dark') merged.theme = DEFAULT_SETTINGS.theme;
  if (!['IRR', 'IRT'].includes(merged.currency)) merged.currency = DEFAULT_SETTINGS.currency;
  return merged;
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('singleton');
  const settings = normalizeSettings(stored);
  // نصب تازه/تنظیمات قبلی بدون کلید: پروفایل آماده فقط کلید و موتور را پر می‌کند
  // و انتخاب‌های دیگر کاربر (تم، نرخ مالیات، نام کسب‌وکار) را دست نمی‌زند.
  if (PRESET_KEY && !(settings.aiKeys ?? '').trim() && !(settings.aiApiKey ?? '').trim()) {
    settings.aiKeys = PRESET_KEY;
    settings.aiProvider = 'ocrspace';
    settings.aiModel = settings.aiModel || 'ara';
    settings.ocrEngine = settings.ocrEngine === 'local' ? 'ai' : settings.ocrEngine;
  }
  // پاک‌سازی یک‌بارهٔ رکورد قدیمی تا دفعهٔ بعد چیزی برای ترمیم نماند
  if (stored && JSON.stringify(stored) !== JSON.stringify(settings)) {
    await db.settings.put(settings);
  }
  return settings;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await db.settings.put(next);
  return next;
}
