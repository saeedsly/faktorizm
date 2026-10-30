// آزمون ۳۰ ویژگی تازه: برش قاب، اثر انگشت، تقسیم چندسندی، اصلاح متن، جستجوی هوشمند و گردش کار
import {
  solveHomography, findDocumentQuad, isValidQuad, quadSize, toGray,
} from '../src/lib/ocr/autocrop';
import { hashBlob, docFingerprint, findDuplicates, normalizeForFingerprint } from '../src/lib/ocr/fingerprint';
import { splitDocuments, looksMultiDocument, documentLabel } from '../src/lib/ocr/splitter';
import { editDistance, suggestFixes, applyFixes, buildDictionary, learnCorrections } from '../src/lib/ocr/autofix';
import { parseQuery, matchesQuery, monthlyTrend, costCenterSummary, priceAlerts, recurringVendors } from '../src/lib/invoices/insights';
import { buildInstallments, isOverdue, daysLate } from '../src/lib/invoices/workflow';
import { invoiceToText, invoiceToJson, validateBackup } from '../src/lib/exporters/documents';
import { payableOf, recalc } from '../src/lib/invoices';
import type { Invoice } from '../src/lib/types';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = '') {
  if (ok) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return recalc({
    id: 'inv_a', number: 'FK-1403-100', kind: 'invoice', direction: 'purchase',
    status: 'approved', paymentStatus: 'unpaid', issuerName: 'فروشگاه آرین',
    buyerName: 'کسب‌وکار من', date: '2026-01-15',
    items: [{ id: 'i1', title: 'روغن سرخ‌کردنی', quantity: 2, unitPrice: 500000, discount: 0, taxRate: 0 }],
    discountTotal: 0, taxTotal: 0, total: 0, category: 'خرید کالا', tags: ['مهم'],
    note: '', currency: 'IRT', rawText: '', ocrConfidence: 90, fieldConfidence: {},
    fileName: 'a.jpg', fileType: 'image/jpeg', thumbnail: '', pages: 1, source: 'scan',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...over,
  });
}

console.log('\n── برش خودکار قاب سند ──');
{
  // هوموگرافی: نگاشت یک مربع به مربع بزرگ‌تر
  const m = solveHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  );
  check('حل هوموگرافی جواب می‌دهد', !!m && m.length === 8);
  // x' = (m0*x + m1*y + m2) / (m6*x + m7*y + 1)
  const x = 1, y = 1;
  const den = (m![6] * x + m![7] * y + 1);
  const mapped = (m![0] * x + m![1] * y + m![2]) / den;
  const mappedY = (m![3] * x + m![4] * y + m![5]) / den;
  check('نگاشت گوشه درست است', Math.abs(mapped - 10) < 1e-6 && Math.abs(mappedY - 10) < 1e-6,
    `${mapped},${mappedY}`);

  // تصویر مصنوعی: مستطیل سفید روی زمینه تیره
  const w = 100, h = 100;
  const gray = new Uint8Array(w * h).fill(30);
  for (let y = 20; y < 80; y++) for (let x = 15; x < 85; x++) gray[y * w + x] = 235;
  const quad = findDocumentQuad(gray, w, h);
  check('قاب سند در تصویر مصنوعی پیدا شد', !!quad, String(quad));
  if (quad) {
    check('گوشه‌های قاب نزدیک لبه سند است',
      Math.abs(quad[0].x - 15) <= 2 && Math.abs(quad[0].y - 20) <= 2,
      JSON.stringify(quad));
    check('قاب معتبر و محدب است', isValidQuad(quad));
    const size = quadSize(quad);
    check('ابعاد مقصد اندازه قاب است', size.width > 60 && size.height > 50, JSON.stringify(size));
  }
  // تصویر تمام‌سفید: قابی نیست
  const blank = new Uint8Array(w * h).fill(240);
  check('تصویر بدون سند، قاب نمی‌سازد', findDocumentQuad(blank, w, h) === null);
  check('خاکستری‌سازی درست است', toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))[1] === 0);
}

console.log('\n── اثر انگشت و تشخیص تکراری ──');
{
  const a = makeInvoice({ id: 'x1', number: 'FK-100', total: 0 });
  const fp1 = docFingerprint({ number: 'FK-100', issuerName: 'فروشگاه آرین', total: 1000000 });
  const fp2 = docFingerprint({ number: 'fk-۱۰۰', issuerName: 'فروشگاه آرین', total: 1000000 });
  check('اثر انگشت ارقام فارسی/لاتین را یکی می‌بیند', fp1 === fp2, `${fp1} / ${fp2}`);
  check('نرمال‌سازی علامت‌ها را حذف می‌کند',
    normalizeForFingerprint('فاکتور #۱۲۳') === normalizeForFingerprint('فاکتور123'));

  const rows = [
    { id: 'a', number: 'A-1', issuerName: 'دیجی‌کالا', date: '2026-01-01', total: 5000000 },
    { id: 'b', number: 'A-1', issuerName: 'دیجی‌کالا', date: '2026-02-01', total: 5000000 },
    { id: 'c', number: 'B-9', issuerName: 'دیجی‌کالا', date: '2026-01-05', total: 5000000 },
    { id: 'd', number: 'C-3', issuerName: 'فروشگاه دیگر', date: '2026-01-05', total: 999 },
  ];
  const dupes = findDuplicates(rows);
  check('دو سند با شماره و مبلغ یکسان تکراری شناخته شد',
    dupes.some((p) => (p.a.id === 'a' && p.b.id === 'b')), JSON.stringify(dupes.map((d) => `${d.a.id}-${d.b.id}`)));
  check('سند با شماره متفاوت و مبلغ یکسان، هشدار «فروشنده و مبلغ» دارد',
    dupes.some((p) => (p.a.id === 'a' && p.b.id === 'c')));
  check('سند بی‌ربط تکراری نیست', !dupes.some((p) => p.a.id === 'd' || p.b.id === 'd'));
  check('امتیاز تکرار شماره+مبلغ بالاترین است', dupes[0].score >= 90, String(dupes[0]?.score));

  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
  const h1 = await hashBlob(blob);
  const h2 = await hashBlob(new Blob([new Uint8Array([1, 2, 3, 4, 5])]));
  const h3 = await hashBlob(new Blob([new Uint8Array([5, 4, 3, 2, 1])]));
  check('هش فایل یکسان برای محتوای یکسان', h1 === h2);
  check('هش فایل برای محتوای متفاوت فرق دارد', h1 !== h3);
  check('اثر انگشت فاکتور واقعی ساخته می‌شود', docFingerprint(a).length === 16);
}

console.log('\n── جدا کردن چند سند از یک فایل ──');
{
  const raw = `فاکتور فروشگاه آرین
شماره فاکتور: 1201
تاریخ: 1404/05/01
ماست ۲ ۵۰۰۰۰ ۱۰۰۰۰۰
جمع کل ۱۰۰٬۰۰۰
--------------------------
فاکتور فروشگاه بهار
شماره فاکتور: 8902
تاریخ: 1404/05/02
نان ۱ ۲۰۰۰۰ ۲۰۰۰۰
جمع کل ۲۰٬۰۰۰`;
  const docs = splitDocuments(raw);
  check('دو سند از متن جدا شد', docs.length === 2, `دریافت: ${docs.length}`);
  check('هر سند خطوط خودش را دارد', docs[0].lines.length >= 4 && docs[1].lines.length >= 4,
    `${docs[0]?.lines.length}/${docs[1]?.lines.length}`);
  check('برچسب سند از سرصفحه ساخته شد', documentLabel(docs[1]).includes('بهار'), documentLabel(docs[1]));
  check('متن یک سند، تکه‌تکه نمی‌شود', splitDocuments('فاکتور\nفروشگاه\nکالا ۱ ۲ ۳').length === 1);
  check('تشخیص چندسندی درست است', looksMultiDocument(raw) && !looksMultiDocument('فاکتور\nکالا ۱'));
  check('متن خالی سند تولید نمی‌کند', splitDocuments('   ').length === 0);
}

console.log('\n── اصلاح خودکار متن ──');
{
  check('فاصله ویرایشی درست حساب می‌شود', editDistance('کالا', 'کاله') === 1);
  check('فاصله ویرایشی برای واژه یکسان صفر است', editDistance('روغن', 'روغن') === 0);

  const raw = 'روغن سرخ کردنی و و روغن\nبوشار پنیر پنیر ۸۳';
  const fixes = suggestFixes(raw, ['بوشار پنیر', 'روغن سرخ‌کردنی']);
  check('واژه تکراری پیدا شد', fixes.some((f) => f.kind === 'repeat' && f.from.includes('پنیر')));
  const applied = applyFixes(raw, fixes.filter((f) => f.kind === 'repeat'));
  check('واژه تکراری حذف شد', !/پنیر\s+پنیر/.test(applied), applied);

  const typo = suggestFixes('بوشار پنر ۲۰۰۰۰', ['بوشار پنیر']);
  check('غلط تایپی نزدیک واژه‌نامه پیشنهاد شد', typo.some((f) => f.kind === 'dictionary'), JSON.stringify(typo));
  const fixed = applyFixes('بوشار پنر ۲۰۰۰۰', typo.filter((f) => f.kind === 'dictionary'));
  check('واژه اصلاح شد', fixed.includes('بوشار پنیر'), fixed);
  check('واژه‌نامه از کالاها و طرف‌حساب‌ها ساخته شد',
    buildDictionary([{ title: 'ماست' }], [{ name: 'آرین' }]).length === 2);
  check('یادگیری از اصلاح کاربر کار می‌کند',
    learnCorrections('بوشار پنر', ['بوشار پنیر']).length > 0);
}

console.log('\n── جستجوی هوشمند ──');
{
  const q1 = parseQuery('تایید‌شده بالای ۵ میلیون فروشنده دیجی‌کالا');
  check('وضعیت از جمله فهمیده شد', q1.status === 'approved', q1.status);
  check('حد پایین مبلغ با «میلیون» فهمیده شد', q1.min === 5_000_000, String(q1.min));
  check('فروشنده جدا شد', q1.vendor?.replace(/[\u200c\s]/g, '') === 'دیجیکالا', q1.vendor);

  const q2 = parseQuery('پرداخت‌نشده زیر ۲۰۰ هزار');
  check('حد بالای مبلغ فهمیده شد', q2.max === 200_000, String(q2.max));
  check('وضعیت پرداخت فهمیده شد', q2.payment === 'unpaid', q2.payment);

  const q3 = parseQuery('نیاز به بازبینی');
  check('نشانه کم‌اطمینانی فهمیده شد', q3.needsReview === true);

  const inv = makeInvoice({ number: 'A-1', issuerName: 'دیجی‌کالا', status: 'approved', documentTotal: 6_000_000, paymentStatus: 'unpaid' });
  check('سند با شرط جستجو می‌خواند', matchesQuery(inv, q1));
  check('سند با شرط ناسازگار نمی‌خواند', !matchesQuery(inv, parseQuery('رد شده')));
  check('جستجوی متنی در اقلام کار می‌کند',
    matchesQuery(inv, parseQuery('روغن')));
  check('فیلتر اختلاف مبلغ کار می‌کند',
    matchesQuery(makeInvoice({ total: 0, documentTotal: 7_000_000 }), parseQuery('اختلاف')) !== false);
}

console.log('\n── تحلیل و گردش کار ──');
{
  const inv = makeInvoice();
  const plans = buildInstallments(inv, 3, 30);
  check('سه قسط ساخته شد', plans.length === 3);
  check('جمع اقساط برابر مبلغ سند است',
    plans.reduce((s, p) => s + p.amount, 0) === payableOf(inv),
    String(plans.reduce((s, p) => s + p.amount, 0)));
  check('سررسیدها صعودی‌اند', plans[0].dueDate < plans[2].dueDate);

  const overdue = { ...plans[0], dueDate: '2020-01-01' };
  check('قسط گذشته سررسیدشده شناخته شد', isOverdue(overdue));
  check('تعداد روز تأخیر حساب شد', daysLate(overdue) > 1000, String(daysLate(overdue)));
  check('قسط پرداخت‌شده تأخیر ندارد', daysLate({ ...overdue, paidAt: '2020-02-01' }) === 0);

  const invoices = [
    makeInvoice({ id: 'p1', date: '2026-01-10', costCenter: 'انبار' }),
    makeInvoice({ id: 'p2', date: '2026-01-20', costCenter: 'اداری' }),
    makeInvoice({ id: 'p3', date: '2026-02-10', issuerName: 'فروشگاه آرین' }),
    makeInvoice({ id: 'p4', date: '2026-03-10', issuerName: 'فروشگاه آرین' }),
  ];
  const centers = costCenterSummary(invoices);
  check('مرکزهای هزینه جمع شدند', centers.length === 3 && centers.some((c) => c.costCenter === 'انبار'),
    JSON.stringify(centers));
  const trend = monthlyTrend(invoices, 3);
  check('روند ماهانه سه نقطه دارد', trend.length === 3);
  const rec = recurringVendors(invoices);
  check('فروشنده با سه ماه خرید، دوره‌ای شناخته می‌شود', rec.some((r) => r.months.length === 3), JSON.stringify(rec));
  const alerts = priceAlerts([
    makeInvoice({ id: 'q1', date: '2026-01-01', items: [{ id: 'a', title: 'روغن سرخ‌کردنی', quantity: 1, unitPrice: 100000, discount: 0, taxRate: 0 }] }),
    makeInvoice({ id: 'q2', date: '2026-02-01', items: [{ id: 'b', title: 'روغن سرخ‌کردنی', quantity: 1, unitPrice: 130000, discount: 0, taxRate: 0 }] }),
  ]);
  check('افزایش قیمت کالا هشدار داد', alerts.length === 1 && alerts[0].changePercent === 30,
    JSON.stringify(alerts));
}

console.log('\n── خروجی متن و ساخت‌یافته ──');
{
  const inv = makeInvoice();
  const text = invoiceToText(inv);
  check('متن سند قلم و مبلغ را دارد', text.includes('روغن سرخ‌کردنی') && text.includes('مبلغ نهایی'));
  const json = invoiceToJson(inv);
  check('JSON مبلغ عددی و تاریخ شمسی دارد',
    typeof json.total === 'number' && String(json.dateJalali).includes('/'),
    JSON.stringify({ total: json.total, date: json.dateJalali }));
  check('JSON اقلام را کامل می‌دهد',
    Array.isArray(json.items) && (json.items as { net: number }[])[0].net === 1_000_000);
  check('پشتیبان نامعتبر رد می‌شود', validateBackup('not json').ok === false);
  check('پشتیبان معتبر پذیرفته می‌شود',
    validateBackup(JSON.stringify({ app: 'faktorizm', version: 2, invoices: [] })).ok === true);
}

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
