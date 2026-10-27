import { format, parse, parseISO, isValid } from 'date-fns-jalali';
import { toLatinDigits, toFaDigits } from './utils';

/** دریافت تاریخ امروز به صورت ISO میلادی */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO میلادی → رشته تاریخ شمسی */
export function toJalali(iso: string | Date | undefined, pattern = 'yyyy/MM/dd'): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? parseISO(iso) : iso;
  if (!isValid(d)) return '—';
  return toFaDigits(format(d, pattern));
}

/** رشته تاریخ شمسی (یا میلادی) → ISO میلادی */
export function toISO(input: string): string | undefined {
  if (!input) return undefined;
  const latin = toLatinDigits(input).trim();
  // الگوهای شمسی: 1403/05/12 یا 1403-05-12 یا 1403.05.12
  const jm = latin.match(/(1[34]\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (jm) {
    const d = parse(`${jm[1]}/${jm[2].padStart(2, '0')}/${jm[3].padStart(2, '0')}`, 'yyyy/MM/dd', new Date());
    if (isValid(d)) return d.toISOString().slice(0, 10);
  }
  // الگوی میلادی
  const gm = latin.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (gm) {
    const d = new Date(Number(gm[1]), Number(gm[2]) - 1, Number(gm[3]));
    if (isValid(d)) return d.toISOString().slice(0, 10);
  }
  return undefined;
}

const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** تبدیل تاریخ متنی شامل نام ماه شمسی، مثلا «12 مرداد 1403» */
export function parsePersianTextDate(text: string): string | undefined {
  const latin = toLatinDigits(text);
  const monthRe = new RegExp(`(\\d{1,2})\\s*(${J_MONTHS.join('|')})\\s*(1[34]\\d{2})?`);
  const m = latin.match(monthRe);
  if (m) {
    const monthIdx = J_MONTHS.indexOf(m[2]);
    const year = m[3] ? Number(m[3]) : Number(format(new Date(), 'yyyy'));
    const d = parse(`${year}/${String(monthIdx + 1).padStart(2, '0')}/${String(m[1]).padStart(2, '0')}`, 'yyyy/MM/dd', new Date());
    if (isValid(d)) return d.toISOString().slice(0, 10);
  }
  return toISO(latin);
}

/** کلید ماه شمسی برای گروه‌بندی گزارش‌ها: 1403-05 */
export function jalaliMonthKey(iso: string): string {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'yyyy-MM') : '';
}

export function jalaliMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${J_MONTHS[Number(m) - 1]} ${toFaDigits(y)}`;
}

export function currentJalaliMonthKey(): string {
  return format(new Date(), 'yyyy-MM');
}

export function monthLabelShort(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return '';
  return toFaDigits(format(d, 'MM yy'));
}
