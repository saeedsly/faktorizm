import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** تبدیل عدد به رقم فارسی */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** استخراج عدد از متن آلوده (حذف ممیز/جداگر/حروف) */
export function parseNumber(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (!input) return 0;
  const latin = toLatinDigits(input)
    .replace(/[٬,،]/g, '')
    .replace(/[^0-9.\-]/g, '');
  if (!latin) return 0;
  const n = Number.parseFloat(latin);
  return Number.isFinite(n) ? n : 0;
}

/** قالب‌بندی مبلغ با جداگر هزارگان و ارقام فارسی */
export function formatMoney(amount: number, currency: 'IRR' | 'IRT' = 'IRT', fa = true): string {
  const abs = Math.round(Math.abs(amount));
  const grouped = new Intl.NumberFormat('en-US').format(abs);
  const body = fa ? toFaDigits(grouped) : grouped;
  const sign = amount < 0 ? '-' : '';
  return `${sign}${body} ${currency === 'IRR' ? 'ریال' : 'تومان'}`;
}

export function formatNumber(n: number, fa = true): string {
  const s = new Intl.NumberFormat('en-US').format(n);
  return fa ? toFaDigits(s) : s;
}

export function formatPercent(n: number): string {
  return toFaDigits(Math.round(n).toString()) + '٪';
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${toFaDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toFaDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${toFaDigits(day)} روز پیش`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${toFaDigits(month)} ماه پیش`;
  return `${toFaDigits(Math.floor(month / 12))} سال پیش`;
}

export function truncate(text: string, len: number): string {
  return text.length > len ? text.slice(0, len) + '…' : text;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime = 'application/json') {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sumBy<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}

export function makeApiKey(): string {
  const seg = () => Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `fk_live_${seg()}${seg()}`;
}

export const STATUS_META: Record<string, { label: string; chipClass: string; dot: string }> = {
  draft: { label: 'پیش‌نویس', chipClass: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  review: { label: 'در انتظار بازبینی', chipClass: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  approved: { label: 'تایید شده', chipClass: 'bg-accent-soft text-accent', dot: 'bg-accent' },
  rejected: { label: 'رد شده', chipClass: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  archived: { label: 'آرشیو', chipClass: 'bg-info-soft text-info', dot: 'bg-info' },
};

export const PAYMENT_META: Record<string, { label: string; chipClass: string }> = {
  unpaid: { label: 'پرداخت نشده', chipClass: 'bg-danger-soft text-danger' },
  partial: { label: 'پیش‌پرداخت', chipClass: 'bg-warning-soft text-warning' },
  paid: { label: 'پرداخت شده', chipClass: 'bg-accent-soft text-accent' },
};
