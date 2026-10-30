// تست دود صفحه‌های تازه: اسکن، فاکتورها و ویرایش سند باید بدون خطا رندر شوند
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

async function main() {
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl" class="dark"><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'getComputedStyle',
    'MutationObserver', 'Event', 'CustomEvent', 'Location', 'localStorage', 'sessionStorage', 'File', 'Blob']) {
    // @ts-expect-error انتقال سراسری‌های مرورگر
    globalThis[key] = window[key];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};

  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String((e as PromiseRejectionEvent).reason)));

  const React = await import('react');
  const ReactDOM = await import('react-dom/client');
  const { MemoryRouter } = await import('react-router-dom');

  const { default: Scan } = await import('../src/pages/Scan');
  const { default: Invoices } = await import('../src/pages/Invoices');
  const { default: InvoiceEdit } = await import('../src/pages/InvoiceEdit');
  const { db, saveSettings } = await import('../src/lib/db');
  const { useAppStore } = await import('../src/lib/store');

  await saveSettings({ defaultTaxRate: 9, currency: 'IRT', businessName: 'کسب‌وکار تست' });
  await useAppStore.getState().load();

  const render = async (element: React.ReactElement, wait = 900) => {
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    const root = ReactDOM.createRoot(host);
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/'] }, element));
    await new Promise((r) => setTimeout(r, wait));
    const html = host.innerHTML;
    root.unmount();
    return html;
  };

  const checks: Array<[boolean, string]> = [];

  const scan = await render(React.createElement(Scan));
  checks.push([scan.includes('اسکن و استخراج هوشمند'), 'صفحه اسکن رندر شد']);
  checks.push([scan.includes('سنجش کیفیت عکس'), 'برجسب‌های کیفیت عکس و برش قاب دیده می‌شود']);
  checks.push([scan.includes('صف پردازش'), 'زبانه صف پردازش حاضر است']);
  checks.push([scan.includes('ابزارها و حافظه'), 'زبانه حافظه و ابزارها حاضر است']);

  const invoices = await render(React.createElement(Invoices));
  checks.push([invoices.includes('جستجوی هوشمند'), 'نوار جستجوی هوشمند ساخته شد']);
  checks.push([invoices.includes('ذخیره نما'), 'ذخیره نمای جستجو موجود است']);
  checks.push([invoices.includes('مرکزهای هزینه') || invoices.includes('مرکز هزینه'), 'فیلتر مرکز هزینه هست']);
  checks.push([invoices.includes('JSON'), 'خروجی JSON در نوار ابزار هست']);

  const edit = await render(React.createElement(InvoiceEdit, { mode: 'create' }), 1200);
  checks.push([edit.includes('اطلاعات فاکتور'), 'فرم ویرایش سند رندر شد']);
  checks.push([edit.includes('گردش کار'), 'زبانه پیگیری و گردش کار اضافه شد']);
  checks.push([edit.includes('اشتراک متن'), 'دکمه اشتراک متن هست']);

  // ذخیره داده در جداول تازه (نسخه ۲ پایگاه داده)
  const { logAudit, snapshot, saveInstallments, plansOf } = await import('../src/lib/invoices/workflow');
  const { learnFromInvoice, getVendor } = await import('../src/lib/vendors');
  const { recalc } = await import('../src/lib/invoices');
  const invoice = recalc({
    id: 'inv_smoke', number: 'SMK-1', kind: 'invoice', direction: 'purchase', status: 'approved',
    paymentStatus: 'unpaid', issuerName: 'فروشنده آزمون', buyerName: 'من', date: '2026-02-01',
    items: [{ id: 'i1', title: 'کالای آزمون', quantity: 2, unitPrice: 500000, discount: 0, taxRate: 0 }],
    discountTotal: 0, taxTotal: 0, total: 0, category: 'خرید', tags: [], note: '', currency: 'IRT',
    rawText: 'فروشنده آزمون\nکالای آزمون ۲ ۵۰۰۰۰۰ ۱۰۰۰۰۰۰', ocrConfidence: 90,
    fieldConfidence: { number: 92, items: 61, total: 88 }, fileName: '', fileType: '', thumbnail: '',
    pages: 1, source: 'scan', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await db.invoices.put(invoice);
  // یک سند هم‌شماره برای آزمون هشدار تکراری
  await db.invoices.put({ ...invoice, id: 'inv_smoke_dup', status: 'review' });
  await logAudit(invoice.id, 'آزمون تاریخچه');
  await snapshot(invoice, 'نسخه آزمون');
  await saveInstallments(invoice, 4, 30);
  await learnFromInvoice(invoice);

  checks.push([(await db.audit.where('invoiceId').equals(invoice.id).count()) >= 1, 'تاریخچه سند در پایگاه داده ذخیره شد']);
  checks.push([(await db.versions.where('invoiceId').equals(invoice.id).count()) >= 1, 'نسخه سند ذخیره شد']);
  checks.push([(await plansOf(invoice.id)).length === 4, 'چهار قسط در پایگاه داده ساخته شد']);
  checks.push([(await getVendor('فروشنده آزمون'))?.samples === 1, 'پروفایل فروشنده ساخته شد']);

  // پنل‌های گردش کار سند جداگانه رندر می‌شوند (تاریخچه، اقساط، پیوست، دانش فروشنده…)
  const panels = await import('../src/components/invoice/InvoicePanels');
  const panelChecks: Array<[string, unknown]> = [
    ['اقساط و برنامه پرداخت', React.createElement(panels.PaymentPlanCard, { invoice })],
    ['تاریخچه و نسخه‌ها', React.createElement(panels.HistoryCard, { invoice, onRestored: () => undefined })],
    ['پیوست‌های سند', React.createElement(panels.AttachmentsCard, { invoice, onChange: () => undefined })],
    ['دانش فروشنده', React.createElement(panels.VendorCard, { invoice, onApply: () => undefined })],
    ['اصلاح پیشنهادی متن', React.createElement(panels.AutofixCard, { invoice, onApplyText: () => undefined })],
    ['هشدار تکراری', React.createElement(panels.DuplicateAlert, { invoice, onDismiss: () => undefined })],
    ['کالاهای پرتکرار', React.createElement(panels.SuggestedItemsCard, { invoice, onAdd: () => undefined })],
    ['اطمینان فیلدها', React.createElement(panels.ConfidenceBreakdown, { invoice })],
    ['یادآور سررسید', React.createElement(panels.DueDateCard, { invoice, onChange: () => undefined })],
  ];
  for (const [label, element] of panelChecks) {
    const html = await render(element as React.ReactElement, 500);
    checks.push([html.length > 50, `پنل «${label}» بدون خطا رندر شد`]);
  }

  checks.push([errors.length === 0, `بدون خطای زمان اجرا${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`]);

  let pass = 0;
  for (const [ok, label] of checks) {
    console.log(ok ? `✅ ${label}` : `❌ ${label}`);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${checks.length} بررسی موفق`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
