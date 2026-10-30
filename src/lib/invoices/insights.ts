/**
 * جستجوی هوشمند و تحلیل الگوهای خرید
 *
 * جستجو به سبک زبان طبیعی کار می‌کند: «فاکتورهای تایید‌شده فروشنده دیجی‌کالا
 * بالای ۵ میلیون ماه گذشته». هر کلیدواژه به یک شرط تبدیل می‌شود و بقیه متن
 * آزاد در شماره، فروشنده، کالاها و یادداشت جستجو می‌شود.
 */
import { payableOf } from '../invoices';
import { toISO } from '../jalali';
import { toLatinDigits, parseNumber } from '../utils';
import type { Invoice, InvoiceStatus, PaymentStatus } from '../types';

export interface SmartQuery {
  text: string;
  status?: InvoiceStatus;
  payment?: PaymentStatus;
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  category?: string;
  tag?: string;
  vendor?: string;
  /** سندهایی که هشدار OCR دارند */
  needsReview?: boolean;
  /** سندهایی با اختلاف بین جمع ردیف و مبلغ سند */
  mismatched?: boolean;
}

const STATUS_WORDS: Record<string, InvoiceStatus> = {
  'تایید شده': 'approved', 'تاییدشده': 'approved', 'تایید': 'approved', approved: 'approved',
  'در انتظار بازبینی': 'review', 'بازبینی': 'review', review: 'review',
  'پیش‌نویس': 'draft', 'پیشنویس': 'draft', draft: 'draft',
  'رد شده': 'rejected', 'ردشده': 'rejected', rejected: 'rejected',
  'آرشیو': 'archived', 'آرشیوشده': 'archived', archived: 'archived',
};

const PAYMENT_WORDS: Record<string, PaymentStatus> = {
  'پرداخت‌نشده': 'unpaid', 'پرداخت نشده': 'unpaid', 'بدهی': 'unpaid', unpaid: 'unpaid',
  'پرداخت‌شده': 'paid', 'پرداخت شده': 'paid', 'تسویه': 'paid', paid: 'paid',
  'پیش‌پرداخت': 'partial', 'قسطی': 'partial', partial: 'partial',
};

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function unify(text: string): string {
  return toLatinDigits(text)
    .replace(/[یي]/g, 'ی')
    .replace(/[کك]/g, 'ک')
    .replace(/[\u200c-\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** واژه فشرده برای مقایسه: بدون فاصله و نیم‌فاصله */
function compact(text: string): string {
  return unify(text).replace(/\s+/g, '');
}

/**
 * کلیدواژه را در فهرست واژه‌ها پیدا و آن واژه‌ها را مصرف می‌کند.
 * تطبیق دقیق روی یک یا چند واژه پشت‌سرهم، و برای کلیدواژه‌های بلند،
 * واژه‌ای که با کلیدواژه شروع می‌شود («تایید‌شده» برای «تایید»).
 */
function consumeKeyword(tokens: string[], keyword: string): { hit: boolean; tokens: string[] } {
  const needle = compact(keyword);
  if (!needle) return { hit: false, tokens };
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const joined = compact(tokens.slice(i, i + size).join(''));
      if (joined === needle) {
        return { hit: true, tokens: [...tokens.slice(0, i), ...tokens.slice(i + size)] };
      }
    }
  }
  if (needle.length >= 3) {
    for (let i = 0; i < tokens.length; i++) {
      const word = compact(tokens[i]);
      if (word.startsWith(needle) && word.length - needle.length <= 3) {
        return { hit: true, tokens: [...tokens.slice(0, i), ...tokens.slice(i + 1)] };
      }
    }
  }
  return { hit: false, tokens };
}

const money = (raw: string, unit?: string): number => {
  const value = parseNumber(raw);
  if (!unit) return value;
  if (unit.includes('میلیارد')) return value * 1_000_000_000;
  if (unit.includes('میلیون')) return value * 1_000_000;
  if (unit.includes('هزار')) return value * 1_000;
  return value;
};

/**
 * جستجوی متنی را به شرط تبدیل می‌کند.
 * نمونه: «بالای ۵ میلیون تایید‌شده فروشنده دیجی‌کالا از ۱۴۰۴/۰۱/۰۱»
 */
export function parseQuery(input: string): SmartQuery {
  const query: SmartQuery = { text: '' };
  let rest = unify(input);
  if (!rest) return query;

  // بازه مبلغی
  rest = rest.replace(/(?:بالای|بیش\s*از|بیشتر\s*از|حداقل|>\s*=?)\s*([\d.,]+)\s*(میلیون|میلیارد|هزار)?/,
    (_m, v, u) => { query.min = money(v, u); return ' '; });
  rest = rest.replace(/(?:زیر|کمتر\s*از|حداکثر|تا|<!?=?)\s*([\d.,]+)\s*(میلیون|میلیارد|هزار)?/,
    (_m, v, u) => { query.max = money(v, u); return ' '; });

  // بازه تاریخ
  rest = rest.replace(/(?:از\s*تاریخ|از|بعد\s*از)\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
    (_m, d) => { query.from = toISO(d) ?? undefined; return ' '; });
  rest = rest.replace(/(?:تا\s*تاریخ|تا|قبل\s*از)\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
    (_m, d) => { query.to = toISO(d) ?? undefined; return ' '; });

  // ماه جاری/گذشته
  const monthMatch = rest.match(/ماه\s*(گذشته|جاری|قبل)|این\s*ماه/);
  if (monthMatch) {
    const now = new Date();
    const start = new Date(now.getFullYear(), monthMatch[1] === 'گذشته' || monthMatch[1] === 'قبل'
      ? now.getMonth() - 1 : now.getMonth(), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    query.from = start.toISOString().slice(0, 10);
    query.to = end.toISOString().slice(0, 10);
    rest = rest.replace(monthMatch[0], ' ');
  }

  let tokens = rest.split(/\s+/).filter(Boolean);

  // نشانه‌های کیفی — پیش از وضعیت‌ها، تا «بازبینی» بلعیده نشود
  for (const phrase of ['نیاز به بازبینی', 'کم اطمینان', 'هشدار']) {
    const result = consumeKeyword(tokens, phrase);
    if (result.hit) { query.needsReview = true; tokens = result.tokens; }
  }
  for (const phrase of ['اختلاف', 'ناسازگار']) {
    const result = consumeKeyword(tokens, phrase);
    if (result.hit) { query.mismatched = true; tokens = result.tokens; }
  }

  // وضعیت‌ها و پرداخت — کلیدواژه‌های بلندتر اول تا واژه کوتاه، واژه بلند را نخورد
  const statusKeys = Object.keys(STATUS_WORDS).sort((a, b) => compact(b).length - compact(a).length);
  for (const word of statusKeys) {
    const result = consumeKeyword(tokens, word);
    if (result.hit) { query.status = STATUS_WORDS[word]; tokens = result.tokens; }
  }
  const paymentKeys = Object.keys(PAYMENT_WORDS).sort((a, b) => compact(b).length - compact(a).length);
  for (const word of paymentKeys) {
    const result = consumeKeyword(tokens, word);
    if (result.hit) { query.payment = PAYMENT_WORDS[word]; tokens = result.tokens; }
  }

  // برچسب، دسته و فروشنده
  const valueAfter = (labels: string[]): string => {
    for (const label of labels) {
      const index = tokens.findIndex((t) => compact(t) === compact(label));
      if (index >= 0) {
        const value = tokens.slice(index + 1).join(' ').trim();
        tokens = [...tokens.slice(0, index)];
        return value;
      }
    }
    return '';
  };
  const tag = valueAfter(['برچسب']);
  if (tag) query.tag = tag;
  const category = valueAfter(['دسته', 'دسته‌بندی']);
  if (category) query.category = category;
  const vendor = valueAfter(['فروشنده', 'طرف حساب', 'از طرف']);
  if (vendor) query.vendor = vendor;

  query.text = tokens
    .filter((t) => !['فاکتور', 'فاکتورهای', 'سند', 'اسناد', 'همه', 'همه‌ی', 'لیست'].includes(compact(t)))
    .join(' ')
    .trim();
  return query;
}

/** آیا سند با شرط‌های جستجو می‌خواند؟ */
export function matchesQuery(inv: Invoice, query: SmartQuery): boolean {
  if (query.status && inv.status !== query.status) return false;
  if (query.payment && inv.paymentStatus !== query.payment) return false;
  if (query.from && inv.date < query.from) return false;
  if (query.to && inv.date > query.to) return false;
  const amount = payableOf(inv);
  if (query.min !== undefined && amount < query.min) return false;
  if (query.max !== undefined && amount > query.max) return false;
  if (query.category && inv.category !== query.category) return false;
  if (query.tag && !inv.tags.includes(query.tag)) return false;
  if (query.vendor && !unify(inv.issuerName).includes(unify(query.vendor))) return false;
  if (query.needsReview && !(inv.ocrWarnings?.length || inv.status === 'review')) return false;
  if (query.mismatched && !(inv.documentTotal && Math.abs(inv.documentTotal - inv.total) > Math.max(1000, inv.total * 0.01))) return false;
  if (query.text) {
    const hay = unify([
      inv.number, inv.issuerName, inv.buyerName, inv.category, inv.note,
      inv.costCenter ?? '', inv.tags.join(' '), inv.items.map((i) => i.title).join(' '),
    ].join(' '));
    const words = unify(query.text).split(/\s+/).filter(Boolean);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

export interface MonthPoint { month: string; label: string; total: number; count: number }

/** روند ماهانه خرید در N ماه گذشته (بر پایه تاریخ میلادی سند) */
export function monthlyTrend(invoices: Invoice[], months = 6): MonthPoint[] {
  const out: MonthPoint[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const rows = invoices.filter((inv) => inv.date.slice(0, 7) === key);
    out.push({
      month: key,
      label: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(d),
      total: rows.reduce((s, inv) => s + payableOf(inv), 0),
      count: rows.length,
    });
  }
  return out;
}

export interface RecurringCandidate {
  issuerName: string;
  months: string[];
  avgAmount: number;
  count: number;
}

/** فروشندگانی که تقریباً هر ماه از آن‌ها خرید شده — کاندیدای قرارداد دوره‌ای */
export function recurringVendors(invoices: Invoice[]): RecurringCandidate[] {
  const byVendor = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    if (!inv.issuerName.trim()) continue;
    const key = unify(inv.issuerName);
    byVendor.set(key, [...(byVendor.get(key) ?? []), inv]);
  }
  const out: RecurringCandidate[] = [];
  for (const [, rows] of byVendor) {
    const months = Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort();
    if (months.length < 3) continue;
    const total = rows.reduce((s, r) => s + payableOf(r), 0);
    out.push({
      issuerName: rows[0].issuerName,
      months,
      avgAmount: Math.round(total / rows.length),
      count: rows.length,
    });
  }
  return out.sort((a, b) => b.months.length - a.months.length || b.count - a.count).slice(0, 12);
}

export interface CostCenterRow { costCenter: string; total: number; count: number }

export function costCenterSummary(invoices: Invoice[]): CostCenterRow[] {
  const map = new Map<string, CostCenterRow>();
  for (const inv of invoices) {
    const key = inv.costCenter?.trim() || 'بدون مرکز هزینه';
    const row = map.get(key) ?? { costCenter: key, total: 0, count: 0 };
    row.total += payableOf(inv);
    row.count++;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface PriceAlert {
  title: string;
  lastPrice: number;
  previousPrice: number;
  changePercent: number;
  invoiceNumber: string;
}

/** تغییر قیمت کالاهای تکراری بین دو خرید آخر */
export function priceAlerts(invoices: Invoice[]): PriceAlert[] {
  const history = new Map<string, { at: string; price: number; invoiceNumber: string }[]>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const key = unify(item.title).replace(/\s+/g, ' ').trim();
      if (key.length < 4) continue;
      const list = history.get(key) ?? [];
      list.push({ at: inv.date, price: item.unitPrice, invoiceNumber: inv.number });
      history.set(key, list);
    }
  }
  const alerts: PriceAlert[] = [];
  for (const [title, list] of history) {
    if (list.length < 2) continue;
    const sorted = list.sort((a, b) => a.at.localeCompare(b.at));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (!prev.price || !last.price) continue;
    const change = ((last.price - prev.price) / prev.price) * 100;
    if (Math.abs(change) >= 8) {
      alerts.push({
        title, lastPrice: last.price, previousPrice: prev.price,
        changePercent: Math.round(change), invoiceNumber: last.invoiceNumber,
      });
    }
  }
  return alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 15);
}
