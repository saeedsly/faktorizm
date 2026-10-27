import { db } from '../db';
import { recalc } from '../invoices';
import { makeApiKey, uid } from '../utils';
import { logActivity } from '../activity';
import type { ApiKey, Invoice, Webhook } from '../types';

export interface ApiResponse {
  status: number;
  json: unknown;
}

export async function createApiKey(name: string): Promise<ApiKey> {
  const key: ApiKey = {
    id: uid('key_'),
    name: name.trim() || 'کلید جدید',
    key: makeApiKey(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await db.apiKeys.put(key);
  logActivity('ساخت کلید API', 'api', `کلید «${key.name}» ایجاد شد`);
  return key;
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.apiKeys.delete(id);
  logActivity('لغو کلید API', 'api', 'یک کلید دسترسی لغو شد');
}

async function authenticate(provided?: string): Promise<ApiKey | null> {
  if (!provided) return null;
  const key = await db.apiKeys.filter((k) => k.key === provided && k.enabled).first();
  if (key) {
    await db.apiKeys.update(key.id, { lastUsedAt: new Date().toISOString() });
  }
  return key ?? null;
}

function ok(data: unknown, status = 200): ApiResponse {
  return { status, json: { success: true, data, timestamp: new Date().toISOString() } };
}
function fail(error: string, status = 400): ApiResponse {
  return { status, json: { success: false, error, timestamp: new Date().toISOString() } };
}

/** موتور REST واقعی روی دیتابیس محلی — همان قراردادی که سرور Node نمونه اجرا می‌کند */
export async function handleApiRequest(
  method: string,
  path: string,
  body: unknown,
  apiKey?: string,
): Promise<ApiResponse> {
  try {
    const m = method.toUpperCase();
    if (m === 'GET' && path === '/api/v1/ping') return ok({ pong: true });

    const key = await authenticate(apiKey);
    if (!key) return fail('کلید API نامعتبر یا غیرفعال است (هدر x-api-key)', 401);

    const cleanPath = path.split('?')[0].replace(/\/+$/, '') || '/';
    const segments = cleanPath.split('/').filter(Boolean); // ['api','v1',resource,id,action]
    const [, , resource, resourceId, action] = segments;
    const query = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');

    // /api/v1/invoices
    if (resource === 'invoices' && !resourceId) {
      if (m === 'GET') {
        let rows = (await db.invoices.toArray()).filter((i) => !i.deletedAt);
        const status = query.get('status');
        const q = query.get('q')?.toLowerCase();
        if (status) rows = rows.filter((i) => i.status === status);
        if (q) rows = rows.filter((i) =>
          [i.number, i.issuerName, i.buyerName, i.category].join(' ').toLowerCase().includes(q));
        const page = Number(query.get('page') || 1);
        const limit = Number(query.get('limit') || 20);
        const start = (page - 1) * limit;
        return ok({ items: rows.slice(start, start + limit), total: rows.length, page, limit });
      }
      if (m === 'POST') {
        const input = (body ?? {}) as Partial<Invoice>;
        const now = new Date().toISOString();
        const invoice: Invoice = recalc({
          number: input.number || `API-${Date.now()}`,
          kind: input.kind || 'invoice',
          direction: input.direction || 'purchase',
          status: 'review',
          paymentStatus: input.paymentStatus || 'unpaid',
          issuerName: input.issuerName || '',
          buyerName: input.buyerName || '',
          date: input.date || now.slice(0, 10),
          items: input.items || [],
          discountTotal: 0, taxTotal: 0, total: 0,
          category: input.category || 'از طریق API',
          tags: input.tags || [],
          note: input.note || '',
          currency: input.currency || 'IRT',
          rawText: '', ocrConfidence: 0, fieldConfidence: {},
          fileName: 'api-import', fileType: 'application/json', thumbnail: '', pages: 0,
          source: 'api',
          createdAt: now, updatedAt: now,
          ...input,
          id: input.id || uid('inv_'),
        } as Invoice);
        await db.invoices.put(invoice);
        logActivity('ایجاد از طریق API', 'invoice', `فاکتور ${invoice.number} از API دریافت شد`, invoice.id);
        return ok(invoice, 201);
      }
      return fail('متد مجاز نیست', 405);
    }

    // /api/v1/invoices/:id ...
    if (resource === 'invoices' && resourceId) {
      const invoice = await db.invoices.get(resourceId);
      if (!invoice) return fail('فاکتور یافت نشد', 404);
      if (m === 'GET') return ok(invoice);
      if (m === 'PUT') {
        const merged = recalc({ ...invoice, ...(body as object), id: invoice.id } as Invoice);
        merged.updatedAt = new Date().toISOString();
        await db.invoices.put(merged);
        return ok(merged);
      }
      if (m === 'DELETE') {
        await db.invoices.delete(invoice.id);
        return ok({ deleted: true });
      }
      if (m === 'POST' && action === 'approve') {
        await db.invoices.update(invoice.id, { status: 'approved', updatedAt: new Date().toISOString() });
        return ok({ id: invoice.id, status: 'approved' });
      }
    }

    if (resource === 'contacts' && !resourceId) {
      if (m === 'GET') return ok(await db.contacts.toArray());
      if (m === 'POST') {
        const input = (body ?? {}) as Partial<import('../types').Contact>;
        const contact = {
          id: uid('cnt_'), type: 'both' as const, createdAt: new Date().toISOString(), ...input,
        } as import('../types').Contact;
        await db.contacts.put(contact);
        return ok(contact, 201);
      }
    }

    if (resource === 'products' && m === 'GET' && !resourceId) {
      return ok(await db.products.toArray());
    }

    if (resource === 'stats' && m === 'GET') {
      const invoices = (await db.invoices.toArray()).filter((i) => !i.deletedAt);
      return ok({
        invoices: invoices.length,
        totalAmount: invoices.reduce((s, i) => s + i.total, 0),
        taxAmount: invoices.reduce((s, i) => s + i.taxTotal, 0),
        pendingReview: invoices.filter((i) => i.status === 'review').length,
        contacts: await db.contacts.count(),
        products: await db.products.count(),
      });
    }

    return fail(`مسیر ${m} ${cleanPath} پیدا نشد`, 404);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'خطای داخلی', 500);
  }
}

export const API_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/ping', auth: false, desc: 'بررسی زنده بودن سرویس' },
  { method: 'GET', path: '/api/v1/invoices', auth: true, desc: 'فهرست فاکتورها (page, limit, status, q)' },
  { method: 'POST', path: '/api/v1/invoices', auth: true, desc: 'ایجاد فاکتور جدید از سیستم حسابداری' },
  { method: 'GET', path: '/api/v1/invoices/:id', auth: true, desc: 'دریافت یک فاکتور' },
  { method: 'PUT', path: '/api/v1/invoices/:id', auth: true, desc: 'به‌روزرسانی فاکتور' },
  { method: 'DELETE', path: '/api/v1/invoices/:id', auth: true, desc: 'حذف فاکتور' },
  { method: 'POST', path: '/api/v1/invoices/:id/approve', auth: true, desc: 'تایید فاکتور' },
  { method: 'GET', path: '/api/v1/contacts', auth: true, desc: 'فهرست طرفین حساب' },
  { method: 'POST', path: '/api/v1/contacts', auth: true, desc: 'ثبت طرف حساب جدید' },
  { method: 'GET', path: '/api/v1/products', auth: true, desc: 'فهرست کالاها و خدمات' },
  { method: 'GET', path: '/api/v1/stats', auth: true, desc: 'آمار کلیدی سامانه' },
];

export function buildOpenApiSpec(baseUrl = 'https://your-server.example.com') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Faktorizm REST API',
      version: '1.0.0',
      description: 'API رسمی سامانه فاکتوریزم برای اتصال به نرم‌افزارهای حسابداری',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: Object.fromEntries(API_ENDPOINTS.map((e) => [
      e.path.replace(/:id/g, '{id}'),
      { [e.method.toLowerCase()]: { summary: e.desc, security: e.auth ? [{ ApiKeyAuth: [] }] : [] } },
    ])),
  };
}

export async function createWebhook(url: string, events: string[]): Promise<Webhook> {
  const hook: Webhook = {
    id: uid('wh_'), url, events, enabled: true, createdAt: new Date().toISOString(),
  };
  await db.webhooks.put(hook);
  logActivity('تعریف وب‌هوک', 'api', `وب‌هوک ${url}`);
  return hook;
}

export async function testWebhook(hook: Webhook): Promise<number | string> {
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test.ping', at: new Date().toISOString(), data: { ok: true } }),
      mode: 'cors',
    });
    await db.webhooks.update(hook.id, { lastStatus: res.status, lastAttemptAt: new Date().toISOString() });
    return res.status;
  } catch (err) {
    await db.webhooks.update(hook.id, { lastStatus: 0, lastAttemptAt: new Date().toISOString() });
    return err instanceof Error ? err.message : 'خطای شبکه';
  }
}
