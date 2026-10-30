import { useEffect, useState } from 'react';
import { toFaDigits, toLatinDigits } from '@/lib/utils';

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** نمایش ارقام فارسی؛ جداسازی هزارگان همیشه انجام می‌شود */
  faDigits?: boolean;
  ariaLabel?: string;
}

/** جداکردن سه‌رقمی بدون دست‌زدن به مقدار عددی */
function groupDigits(raw: string, fa: boolean): string {
  const latin = toLatinDigits(raw).replace(/[^\d]/g, '');
  if (!latin) return '';
  const grouped = latin.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return fa ? toFaDigits(grouped) : grouped;
}

/**
 * ورودی مبلغ با جداکننده هزارگان.
 * کاربر عدد را با هر قالبی وارد می‌کند؛ مقدار عددی تمیز به والد می‌رسد.
 */
export default function MoneyInput({
  value, onChange, placeholder, disabled, className = '', faDigits = true, ariaLabel,
}: MoneyInputProps) {
  const [text, setText] = useState(() => (value ? groupDigits(String(value), faDigits) : ''));

  // اگر مقدار از بیرون عوض شد (مثلاً خوانده‌شدن OCR) نمایش هم به‌روز شود
  useEffect(() => {
    const current = toLatinDigits(text).replace(/[^\d]/g, '');
    const next = value ? String(Math.round(value)) : '';
    if (current !== next) setText(next ? groupDigits(next, faDigits) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, faDigits]);

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      placeholder={placeholder ?? '۰'}
      onChange={(e) => {
        const grouped = groupDigits(e.target.value, faDigits);
        setText(grouped);
        const numeric = Number(toLatinDigits(grouped).replace(/[^\d]/g, '') || 0);
        onChange(numeric);
      }}
      className={`w-full rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[13px] tabular-nums outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${className}`}
    />
  );
}
