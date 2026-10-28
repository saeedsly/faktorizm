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
  category: string;
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
}
