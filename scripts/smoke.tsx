// تست دود: بوت کامل اپ در محیط شبیه‌سازی مرورگر (jsdom + IndexedDB مجازی)
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

async function main() {
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl" class="dark"><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5173/',
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
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};

  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));

  const ReactDOM = await import('react-dom/client');
  const { default: App } = await import('../src/App');

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<App />);

  await new Promise((r) => setTimeout(r, 2800));

  const html = document.getElementById('root')!.innerHTML;
  const checks: Array<[boolean, string]> = [
    [html.includes('فاکتوریزم'), 'نام برند رندر شد'],
    [html.includes('داشبورد'), 'داشبورد رندر شد'],
    [html.includes('اسکن'), 'منوی اسکن وجود دارد'],
    [html.includes('API'), 'منوی API وجود دارد'],
    [html.length > 5000, `درخت DOM ساخته شد (${html.length} کاراکتر)`],
  ];

  const { db } = await import('../src/lib/db');
  const invCount = await db.invoices.count();
  const contactCount = await db.contacts.count();
  checks.push([invCount >= 10, `داده نمونه فاکتور بارگذاری شد (${invCount} فاکتور)`]);
  checks.push([contactCount >= 5, `طرفین حساب نمونه ساخته شد (${contactCount} مورد)`]);

  let pass = 0;
  for (const [ok, label] of checks) {
    console.log(ok ? `✅ ${label}` : `❌ ${label}`);
    if (ok) pass++;
  }
  if (errors.length) console.log('خطاهای زمان اجرا:', errors.slice(0, 5));
  console.log(`\n${pass}/${checks.length} بررسی موفق`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
