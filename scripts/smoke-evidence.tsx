// تست رندر کارت «بازبینی فیلد‌به‌فیلد» در محیط شبیه‌سازی مرورگر.
// بررسی می‌کند کارت با یک سند خوانده‌شده ساخته شود، خط مبدأ هر فیلد را نشان دهد
// و با فیلدهای نبوده، مقدار ساختگی نسازد.
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

async function main() {
  const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>', {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'getComputedStyle',
    'MutationObserver', 'Event', 'CustomEvent', 'Location', 'localStorage', 'sessionStorage']) {
    // @ts-expect-error انتقال سراسری‌های مرورگر
    globalThis[key] = window[key];
  }
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { FieldEvidenceCard } = await import('../src/components/invoice/InvoicePanels');
  const { parseInvoiceText } = await import('../src/lib/ocr/parser');

  const rawText = [
    'فروشگاه لوازم خانگی آرین',
    'شماره فاکتور ۱۴۰۳۲۲۸۷ تاریخ ۱۴۰۴/۰۵/۱۲',
    'خریدار شرکت پخش کالای پارس',
    'شرح کالا تعداد مبلغ واحد مبلغ کل',
    'لپ‌تاپ لنوو 2 ۴۸٬۵۰۰٬۰۰۰ ۹۷٬۰۰۰٬۰۰۰',
    'جمع کل ۹۷٬۰۰۰٬۰۰۰',
    'مالیات بر ارزش افزوده ۹٪ ۸٬۷۳۰٬۰۰۰',
    'مبلغ قابل پرداخت ۱۰۵٬۷۳۰٬۰۰۰',
  ].join('\n');

  const parsed = parseInvoiceText(rawText, 90, 9);
  const invoice: Record<string, unknown> = {
    id: 'inv_test', number: parsed.number, kind: 'invoice', direction: 'purchase',
    status: 'draft', paymentStatus: 'unpaid', issuerName: parsed.issuerName,
    buyerName: parsed.buyerName, date: parsed.date ?? '2025-01-01', items: parsed.items,
    discountTotal: parsed.discountTotal, taxTotal: parsed.taxTotal, total: parsed.total,
    category: parsed.category, tags: [], note: '', currency: 'IRT', rawText,
    ocrConfidence: 90, fieldConfidence: parsed.fieldConfidence, fileName: 'test.png',
    fileType: 'image/png', thumbnail: '', pages: 1, source: 'scan',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const html = renderToStaticMarkup(
    React.createElement(FieldEvidenceCard, {
      invoice,
      onChange: () => {},
    }) as never,
  );

  const checks: Array<[string, boolean]> = [
    ['کارت رندر شد', html.includes('بازبینی فیلد‌به‌فیلد')],
    ['برچسب فیلدها هست', html.includes('شماره سند') && html.includes('فروشنده') && html.includes('تخفیف')],
    ['شمارهٔ کادر نمایش داده شد', /کادر/.test(html)],
    ['ناحیهٔ سند نمایش داده شد', html.includes('سربرگ')],
    ['دکمهٔ اصلاح هست', html.includes('اصلاح')],
    ['خط مبدأ شماره دیده می‌شود', html.includes('شماره فاکتور')],
    ['درصد اطمینان نمایش داده شد', /٪/.test(html)],
    ['هیچ NaN در خروجی نیست', !html.includes('NaN')],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    if (ok) console.log(`  ✓ ${name}`);
    else { failed += 1; console.error(`  ✗ ${name}`); }
  }

  // سند بدون متن OCR: کارت نباید چیزی رندر کند (نه پیام خطا، نه عدد ساختگی)
  const emptyHtml = renderToStaticMarkup(
    React.createElement(FieldEvidenceCard, { invoice: { ...invoice, rawText: '' }, onChange: () => {} }) as never,
  );
  if (emptyHtml === '') console.log('  ✓ بدون متن OCR کارتی ساخته نمی‌شود');
  else { failed += 1; console.error('  ✗ بدون متن OCR هم کارت ساخته شد'); }

  console.log(`\n${failed === 0 ? 'OK' : 'FAIL'} — ${checks.length + 1 - failed} موفق، ${failed} ناموفق`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
