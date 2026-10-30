export type InvoiceStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'archived';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type InvoiceDirection = 'purchase' | 'sale';
export type InvoiceKind = 'invoice' | 'receipt' | 'bill';

export interface InvoiceItem {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}

export interface FieldConfidence {
  [field: string]: number;
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  direction: InvoiceDirection;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  issuerName: string;
  buyerName: string;
  contactId?: string;
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  discountTotal: number;
  taxTotal: number;
  total: number;
  /** مبلغ نهایی چاپ‌شده روی خود سند؛ اگر با جمع ردیف‌ها فرق داشته باشد همین عدد مرجع است */
  documentTotal?: number;
  category: string;
  /** مرکز هزینه یا پروژه‌ای که این سند به آن تخصیص می‌یابد */
  costCenter?: string;
  /** پیوست‌های تکمیلی سند (قرارداد، رسید پرداخت، عکس دوم) */
  attachments?: InvoiceAttachment[];
  /** شماره سند فروشنده برای تشخیص تکراری */
  issuerRef?: string;
  tags: string[];
  note: string;
  currency: 'IRR' | 'IRT';
  rawText: string;
  ocrConfidence: number;
  fieldConfidence: FieldConfidence;
  /** هشدارهای دستیار هوشمند OCR برای بازبینی انسانی */
  ocrWarnings?: string[];
  fileName: string;
  fileType: string;
  thumbnail: string;
  pages: number;
  source: 'scan' | 'manual' | 'api';
  createdAt: string;
  updatedAt: string;
  deletedAt?: number;
}

export interface InvoiceAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** data URL برای نگهداری آفلاین داخل مرورگر */
  data: string;
  addedAt: string;
}

/** یک رخداد در تاریخچه گردش کار سند */
export interface AuditEntry {
  id: string;
  invoiceId: string;
  at: string;
  action: string;
  from?: string;
  to?: string;
  note?: string;
  actor?: string;
}

/** نسخه ذخیره‌شده سند برای بازگردانی */
export interface InvoiceVersion {
  id: string;
  invoiceId: string;
  at: string;
  label: string;
  /** JSON کامل سند در همان لحظه */
  data: string;
  amount: number;
}

/** قسط یا برنامه پرداخت سند */
export interface PaymentPlan {
  id: string;
  invoiceId: string;
  title: string;
  amount: number;
  dueDate: string;
  paidAt?: string;
  method?: string;
  note?: string;
}

/** پروفایل فروشنده که از اسناد تأییدشده یاد گرفته می‌شود */
export interface VendorProfile {
  id: string;
  name: string;
  key: string;
  samples: number;
  lastSeenAt: string;
  header: string[];
  totalsKeywords: string[];
  currency: 'IRR' | 'IRT';
  defaultTaxRate: number;
  avgTotal: number;
  category?: string;
  costCenter?: string;
}

/** نتیجه کش‌شده خوانش برای جلوگیری از پردازش تکراری */
export interface OcrCacheEntry {
  key: string;
  text: string;
  confidence: number;
  source: string;
  at: string;
}

/** پاسخ کش‌شده سرویس ابری */
export interface AiCacheEntry {
  key: string;
  payload: string;
  at: string;
}

/** شمارنده مصرف روزانه سرویس ابری */
export interface UsageEntry {
  day: string;
  calls: number;
  chars: number;
}

/** فایل در انتظار پردازش که در مرورگر نگه داشته می‌شود */
export interface QueuedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  priority: number;
  addedAt: string;
  data: Blob;
}

export interface Contact {
  id: string;
  name: string;
  type: 'customer' | 'vendor' | 'both';
  economicCode?: string;
  nationalId?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  code: string;
  title: string;
  unit: string;
  unitPrice: number;
  taxRate: number;
  category: string;
  usageCount: number;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastStatus?: number;
  lastAttemptAt?: string;
}

export interface Activity {
  id: string;
  at: string;
  action: string;
  entity: 'invoice' | 'contact' | 'product' | 'api' | 'system' | 'export';
  entityId?: string;
  detail: string;
}

/** ارائه‌دهنده سرویس ابری خوانش فاکتور (کلید متعلق به خود کاربر) */
export type AiProvider = 'gemini' | 'openai';

/** حالت موتور خوانش: محلی آفلاین، ابری، یا ترکیبی (حداکثر دقت) */
export type OcrEngineMode = 'local' | 'ai' | 'hybrid';

export interface AppSettings {
  id: 'singleton';
  businessName: string;
  businessEconomicCode: string;
  businessNationalId: string;
  businessPhone: string;
  businessAddress: string;
  defaultTaxRate: number;
  currency: 'IRR' | 'IRT';
  theme: 'dark' | 'light';
  ocrLangs: 'fas' | 'eng' | 'fas+eng';
  ocrQuality: 'fast' | 'balanced' | 'accurate';
  autoPreprocess: boolean;
  /** موتور خوانش؛ پیش‌فرض محلی و کاملاً آفلاین */
  ocrEngine: OcrEngineMode;
  aiProvider: AiProvider;
  aiApiKey: string;
  aiModel: string;
  /** پیش از هر ارسال به سرویس ابری از کاربر تأیید گرفته شود */
  aiAskEachTime: boolean;
  autoApproveThreshold: number;
  onboarded: boolean;
  seeded: boolean;
}

export interface OcrJob {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  thumbnail: string;
  status: 'queued' | 'preparing' | 'recognizing' | 'parsing' | 'done' | 'error';
  progress: number;
  message: string;
  invoice?: Invoice;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  /** اولویت در صف؛ عدد بزرگ‌تر زودتر پردازش می‌شود */
  priority?: number;
  /** مرحله‌های زمانی برای گزارش سرعت */
  stages?: { stage: string; at: number }[];
  /** منبع خوانش نهایی */
  source?: 'local' | 'ai' | 'hybrid';
}
