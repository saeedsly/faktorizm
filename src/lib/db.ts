import Dexie, { type Table } from 'dexie';
import type { Invoice, Contact, Product, ApiKey, Webhook, Activity, AppSettings } from './types';

class FaktorizmDB extends Dexie {
  invoices!: Table<Invoice, string>;
  contacts!: Table<Contact, string>;
  products!: Table<Product, string>;
  apiKeys!: Table<ApiKey, string>;
  webhooks!: Table<Webhook, string>;
  activities!: Table<Activity, string>;
  settings!: Table<AppSettings, string>;

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
  }
}

export const db = new FaktorizmDB();

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
  autoApproveThreshold: 85,
  onboarded: false,
  seeded: false,
};

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('singleton');
  return s ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch, id: 'singleton' as const };
  await db.settings.put(next);
  return next;
}
