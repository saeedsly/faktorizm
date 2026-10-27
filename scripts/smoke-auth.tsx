// تست دود عمیق E2E: ورود واقعی از مسیر پروکسی Vite به سرور زنده + رندر کامل اپ پس از ورود
// پیش‌نیاز: سرور API روی 8787 و Vite روی 5173 بالا باشند (همان پیش‌نمایش زنده).
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';

async function main() {
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl" class="dark"><body><div id="root"></div></body></html>', {
    url: `${BASE}/`,
    pretendToBeVisual: true,
  });

  const { window } = dom;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'getComputedStyle', 'MutationObserver', 'Event', 'CustomEvent', 'Location', 'localStorage', 'sessionStorage']) {
    // @ts-expect-error انتقال سراسری‌های مرورگر
    globalThis[key] = window[key];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.scrollTo = () => {};
  // rAF جِی‌دی‌اِم روی window است؛ بعضی کتابخانه‌ها (recharts/sonner) آن را global می‌خواهند
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};

  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + String(e)));

  // درخواست‌های نسبی /api را به سرور زنده پشت پروکسی Vite هدایت کن
  const realFetch = globalThis.fetch.bind(globalThis);
  // @ts-expect-error سراسری fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const target = url.startsWith('/') ? `${BASE}${url}` : url;
    return realFetch(target, init);
  };

  // ثبت یک کاربر تازه روی سرور واقعی (اولین کاربر هر سازمان، مالک است)
  const email = `e2e_${Date.now()}@faktorizm.ir`;
  const password = 'StrongPass123';
  const reg = await realFetch(`${BASE}/api/v2/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'مدیر آزمایشی', email, password }),
  });
  const regJson = await reg.json();
  if (!regJson.success) throw new Error('ثبت‌نام سرور واقعی شکست خورد: ' + JSON.stringify(regJson));

  const ReactDOM = await import('react-dom/client');
  const { default: App } = await import('../src/App');
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<App />);
  await new Promise((r) => setTimeout(r, 2500));

  // ورود از طریق فرم واقعی با کاربر تازه
  const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
  const passInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  nativeSet.call(emailInput, email);
  emailInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  nativeSet.call(passInput, password);
  passInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  (document.querySelector('form') as HTMLFormElement).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  // صبر برای همگام‌سازی خودکار و رفت‌وبرگشت واقعی داده
  await new Promise((r) => setTimeout(r, 5000));

  const html = document.getElementById('root')!.innerHTML;
  const checks: Array<[boolean, string]> = [
    [html.includes('داشبورد مدیریتی'), 'داشبورد پس از ورود واقعی رندر شد (صفحه سفید نیست)'],
    [html.includes('کل فاکتورها'), 'کارت‌های آماری داشبورد ساخته شدند'],
    [html.includes('مدیر آزمایشی'), 'نام کاربر واقعی در چیدمان دیده می‌شود'],
    [html.includes('اشتراک و لایسنس'), 'منوی سازمان رندر شد'],
    [!html.includes('در حال آماده‌سازی'), 'صفحه اسپلش گیر نکرده است'],
    [errors.length === 0, `خطای زمان اجرا رخ نداده است (${errors.length} مورد)`],
  ];

  let pass = 0;
  for (const [ok, label] of checks) {
    console.log(ok ? `✅ ${label}` : `❌ ${label}`);
    if (ok) pass++;
  }
  if (errors.length) console.log('خطاها:', errors.slice(0, 5));
  console.log(`\n${pass}/${checks.length} بررسی موفق`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
