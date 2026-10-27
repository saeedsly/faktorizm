/**
 * سرور مرجع REST API فاکتوریزم — بدون هیچ وابستگی خارجی (Node 18+)
 * اجرا: npm run server  (پیش‌فرض پورت ۸۷۸۷)
 * داده‌ها در data/db.json ذخیره می‌شوند.
 *
 * احراز هویت: هدر x-api-key — کلیدها از بخش مرکز API داخل اپ قابل ساخت هستند
 * و می‌توانید آن‌ها را در فایل data/db.json بخش apiKeys قرار دهید.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(root, '..', 'data');
const DB_FILE = join(DATA_DIR, 'db.json');
const PORT = process.env.PORT || 8787;

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function loadDB() {
  if (!existsSync(DB_FILE)) {
    await mkdir(DATA_DIR, { recursive: true });
    const seed = { invoices: [], contacts: [], products: [], apiKeys: [{
      id: uid('key_'), name: 'کلید پیش‌فرض', enabled: true,
      key: 'fk_live_demo_change_me_after_first_run',
      createdAt: new Date().toISOString(),
    }] };
    await writeFile(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(await readFile(DB_FILE, 'utf8'));
}

async function saveDB(db) {
  await writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function json(res, status, payload) {
  const body = JSON.stringify({ success: status < 400, ...payload, timestamp: new Date().toISOString() });
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(body);
}

const recalc = (inv) => {
  const subtotal = (inv.items || []).reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  inv.taxTotal = (inv.items || []).reduce((s, it) =>
    s + Math.round((it.quantity * it.unitPrice - (it.discount || 0)) * ((it.taxRate || 0) / 100)), 0);
  inv.discountTotal = (inv.items || []).reduce((s, it) => s + (it.discount || 0), 0) + (inv.discountTotal || 0);
  inv.total = subtotal - inv.discountTotal + inv.taxTotal;
  return inv;
};

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split('/').filter(Boolean); // ['api','v1', resource, id, action]
  const [, , resource, resourceId, action] = segments;
  const db = await loadDB();

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/ping') {
      return json(res, 200, { data: { pong: true, app: 'faktorizm-server' } });
    }

    const key = req.headers['x-api-key'];
    const valid = db.apiKeys.find((k) => k.key === key && k.enabled);
    if (!valid) return json(res, 401, { error: 'کلید API نامعتبر یا غیرفعال است (x-api-key)' });
    valid.lastUsedAt = new Date().toISOString();

    const readBody = () => new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
      req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    });

    if (resource === 'invoices') {
      if (!resourceId && req.method === 'GET') {
        let rows = db.invoices.filter((i) => !i.deletedAt);
        const status = url.searchParams.get('status');
        const q = url.searchParams.get('q')?.toLowerCase();
        if (status) rows = rows.filter((i) => i.status === status);
        if (q) rows = rows.filter((i) => [i.number, i.issuerName, i.category].join(' ').toLowerCase().includes(q));
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 20);
        await saveDB(db);
        return json(res, 200, { data: { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit } });
      }
      if (!resourceId && req.method === 'POST') {
        const body = await readBody();
        if (!body) return json(res, 400, { error: 'بدنه JSON نامعتبر است' });
        const now = new Date().toISOString();
        const invoice = recalc({
          id: uid('inv_'), number: body.number || `API-${Date.now()}`,
          kind: 'invoice', direction: 'purchase', status: 'review', paymentStatus: 'unpaid',
          issuerName: '', buyerName: '', date: now.slice(0, 10), items: [],
          discountTotal: 0, taxTotal: 0, total: 0, category: 'از طریق API',
          tags: [], note: '', currency: 'IRT', source: 'api',
          createdAt: now, updatedAt: now, ...body,
        });
        db.invoices.push(invoice);
        await saveDB(db);
        return json(res, 201, { data: invoice });
      }
      const invoice = db.invoices.find((i) => i.id === resourceId);
      if (!invoice) return json(res, 404, { error: 'فاکتور یافت نشد' });
      if (req.method === 'GET') return json(res, 200, { data: invoice });
      if (req.method === 'PUT') {
        Object.assign(invoice, await readBody(), { id: invoice.id, updatedAt: new Date().toISOString() });
        recalc(invoice);
        await saveDB(db);
        return json(res, 200, { data: invoice });
      }
      if (req.method === 'DELETE') {
        db.invoices = db.invoices.filter((i) => i.id !== invoice.id);
        await saveDB(db);
        return json(res, 200, { data: { deleted: true } });
      }
      if (req.method === 'POST' && action === 'approve') {
        invoice.status = 'approved';
        await saveDB(db);
        return json(res, 200, { data: { id: invoice.id, status: 'approved' } });
      }
    }

    if (resource === 'contacts' && !resourceId) {
      if (req.method === 'GET') return json(res, 200, { data: db.contacts });
      if (req.method === 'POST') {
        const body = await readBody();
        const c = { id: uid('cnt_'), type: 'both', createdAt: new Date().toISOString(), ...body };
        db.contacts.push(c);
        await saveDB(db);
        return json(res, 201, { data: c });
      }
    }
    if (resource === 'products' && req.method === 'GET' && !resourceId) {
      return json(res, 200, { data: db.products });
    }
    if (resource === 'stats' && req.method === 'GET') {
      const invoices = db.invoices.filter((i) => !i.deletedAt);
      return json(res, 200, { data: {
        invoices: invoices.length,
        totalAmount: invoices.reduce((s, i) => s + i.total, 0),
        taxAmount: invoices.reduce((s, i) => s + i.taxTotal, 0),
        pendingReview: invoices.filter((i) => i.status === 'review').length,
        contacts: db.contacts.length,
        products: db.products.length,
      } });
    }
    return json(res, 404, { error: 'مسیر پیدا نشد' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[faktorizm-api] سرور مرجع روی http://0.0.0.0:${PORT} اجرا شد`);
  console.log(`[faktorizm-api] مستندات: GET /api/v1/ping — دیتابیس: ${DB_FILE}`);
});
