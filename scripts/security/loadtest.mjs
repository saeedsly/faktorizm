/**
 * تست بار فاکتوریزم — شبیه‌سازی ۳۰۰۰ کاربر واقعی
 * هر کاربر: ثبت‌نام → ورود → دریافت پروفایل → ارسال فاکتور → فهرست‌گیری
 * اجرا: npm run test:load
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const PORT = 8801;
const BASE = `http://127.0.0.1:${PORT}/api/v2`;
const DATA_DIR = join(root, '.tmp', `loadtest-${process.pid}`);
mkdirSync(DATA_DIR, { recursive: true });

const TOTAL_USERS = Number(process.env.LOAD_USERS || 3000);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 80);

const server = spawn(process.execPath, ['server/src/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(PORT),
    DB_DRIVER: 'memory',
    DATA_DIR,
    JWT_SECRET: 'loadtest-secret-0123456789',
    RATE_LIMIT_MAX: '50000',
    AUTH_RATE_LIMIT_MAX: '100000',
    BCRYPT_ROUNDS: '8',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

async function waitReady() {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('سرور تست بار بالا نیامد\n' + log);
}

async function req(method, path, body, token) {
  const start = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const latency = performance.now() - start;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return { latency, json: await res.json() };
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function virtualUser(i) {
  const tag = `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `load-${tag}@test.local`;
  const password = 'StrongPass123';
  const latencies = [];

  const reg = await req('POST', '/auth/register', { name: `کاربر بار ${i}`, email, password });
  latencies.push(reg.latency);
  const token = reg.json.data.accessToken;

  const login = await req('POST', '/auth/login', { email, password });
  latencies.push(login.latency);

  const me = await req('GET', '/auth/me', undefined, token);
  latencies.push(me.latency);

  const invoice = {
    id: `inv_load_${i}`, number: `LOAD-${i}`, status: 'review', total: 100000 + i,
    date: '2026-10-01', items: [{ id: 'itm1', title: 'کالای آزمون بار', quantity: 1, unitPrice: 100000, discount: 0, taxRate: 10 }],
  };
  const sync = await req('POST', '/business/invoices/bulk-sync', { items: [invoice] }, token);
  latencies.push(sync.latency);

  const list = await req('GET', '/business/invoices', undefined, token);
  latencies.push(list.latency);

  return { latencies };
}

async function poolRun(items, workers) {
  let cursor = 0;
  const failures = [];
  const allLatencies = [];
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        const r = await virtualUser(items[index]);
        allLatencies.push(...r.latencies);
      } catch (e) {
        failures.push({ index, message: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  return { failures, allLatencies };
}

try {
  await waitReady();
  console.log(`شروع تست بار: ${TOTAL_USERS} کاربر مجازی با همزمانی ${CONCURRENCY}`);
  const users = Array.from({ length: TOTAL_USERS }, (_, i) => i);
  const t0 = Date.now();
  const { failures, allLatencies } = await poolRun(users, CONCURRENCY);
  const elapsed = (Date.now() - t0) / 1000;

  allLatencies.sort((a, b) => a - b);
  const success = TOTAL_USERS - failures.length;
  const successRate = (success / TOTAL_USERS) * 100;
  const rps = (TOTAL_USERS * 5) / elapsed;

  console.log('\n===== گزارش تست بار =====');
  console.log(`کاربران موفق: ${success}/${TOTAL_USERS} (${successRate.toFixed(2)}٪)`);
  console.log(`درخواست‌های کل: ${TOTAL_USERS * 5} در ${elapsed.toFixed(1)} ثانیه (${rps.toFixed(0)} req/s)`);
  console.log(`تاخیر پاسخ — p50: ${Math.round(percentile(allLatencies, 50))}ms · p95: ${Math.round(percentile(allLatencies, 95))}ms · p99: ${Math.round(percentile(allLatencies, 99))}ms`);
  if (failures.length) console.log('نمونه خطاها:', failures.slice(0, 5));

  const health = await fetch(`${BASE}/health/ready`);
  const healthOk = health.ok;
  console.log('سلامت سرور پس از بار:', healthOk ? 'پایدار' : 'ناسالم');

  const pass = successRate >= 99 && healthOk;
  console.log(pass ? '\n✅ تست بار موفق بود؛ سامانه برای ۳۰۰۰ کاربر پایدار است' : '\n❌ سامانه زیر بار توقع را برآورده نکرد');
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  setTimeout(() => {
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(process.exitCode || 0);
  }, 400);
}
