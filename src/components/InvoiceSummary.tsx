import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardCopy, Sparkles, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { Card, CardTitle, Button, Badge } from '@/components/ui/primitives';
import { itemNet, itemTax, payableOf } from '@/lib/invoices';
import { formatMoney, toFaDigits, cn } from '@/lib/utils';
import type { Invoice } from '@/lib/types';

/**
 * خلاصه نوشتاری سند: همان چیزی که برنامه از فاکتور فهمیده، با جمله‌های ساده.
 * کاربردش این است که کاربر بدون جدول و ستون هم بفهمد چه اقلامی و چه مبلغی
 * خوانده شده و اگر جایی اشتباه است، بداند کجا را اصلاح کند.
 */
export default function InvoiceSummary({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const [open, setOpen] = useState(true);

  const lines = useMemo(
    () => invoice.items.map((item, index) => {
      const paid = itemNet(item) + itemTax(item);
      const parts = [`${toFaDigits(index + 1)}. ${item.title || 'کالای بی‌نام'}`];
      parts.push(`${toFaDigits(item.quantity)} عدد × ${formatMoney(item.unitPrice, invoice.currency)}`);
      if (item.discount) parts.push(`تخفیف ${formatMoney(item.discount, invoice.currency)}`);
      if (item.taxRate) parts.push(`مالیات ${toFaDigits(item.taxRate)}٪`);
      parts.push(`پرداختی این قلم ${formatMoney(paid, invoice.currency)}`);
      return parts.join(' — ');
    }),
    [invoice.items, invoice.currency],
  );

  const itemsSum = useMemo(
    () => invoice.items.reduce((sum, item) => sum + itemNet(item) + itemTax(item), 0),
    [invoice.items],
  );
  const payable = payableOf(invoice);
  const drift = payable - itemsSum;
  const mismatch = invoice.documentTotal !== undefined && Math.abs(drift) > Math.max(1000, itemsSum * 0.01);

  const plainText = useMemo(() => {
    const head = `خلاصه سند ${invoice.number}${invoice.issuerName ? ` از ${invoice.issuerName}` : ''}`;
    const body = lines.length ? lines.join('\n') : 'قلمی از متن سند فهمیده نشد.';
    const tail = mismatch
      ? `جمع اقلام: ${formatMoney(itemsSum, invoice.currency)} — مبلغ نهایی روی سند: ${formatMoney(payable, invoice.currency)}`
      : `مبلغ نهایی: ${formatMoney(payable, invoice.currency)}`;
    return [head, body, tail].join('\n');
  }, [invoice.number, invoice.issuerName, invoice.currency, lines, itemsSum, payable, mismatch]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      toast.success('خلاصه نوشتاری کپی شد', { description: 'می‌توانید در پیام، اکسل یا هر جای دیگری بچسبانید.' });
    } catch {
      toast.error('کپی نشد', { description: 'مرورگر اجازه دسترسی به کلیپ‌بورد نداد.' });
    }
  };

  return (
    <Card className={cn('border-primary/25 bg-primary-soft/25', compact && '!p-4')}>
      <CardTitle
        icon={<Sparkles size={18} />}
        title="آنچه از این سند فهمیدم"
        sub={lines.length
          ? `${toFaDigits(lines.length)} قلم و مبلغ نهایی، از متن خوانده‌شده — نه از ستون‌بندی`
          : 'متنی که بشود از آن قلم فهمید پیدا نشد'}
        action={(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <ClipboardCopy size={14} /> کپی خلاصه
            </Button>
            <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground" title={open ? 'بستن' : 'باز کردن'}>
              <ChevronDown size={18} className={cn('transition-transform', !open && 'rotate-180')} />
            </button>
          </div>
        )}
      />

      {open && (
        <div className="space-y-3">
          {lines.length ? (
            <ol className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="text-[13px] leading-7 text-foreground/90 border-b border-border/50 last:border-0 pb-1.5 last:pb-0">
                  {line}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground leading-7">
              از متن این سند قلم کالایی خوانده نشد؛ اگر تصویر تار بوده، سند را دوباره و با کیفیت بالاتر اسکن کنید
              یا اقلام را دستی وارد کنید.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge className="bg-primary-soft text-primary">
              مبلغ نهایی سند: {formatMoney(payable, invoice.currency)}
            </Badge>
            {mismatch && (
              <Badge className="bg-muted text-muted-foreground">
                جمع ردیف‌ها: {formatMoney(itemsSum, invoice.currency)}
              </Badge>
            )}
          </div>

          {mismatch ? (
            <p className="flex gap-2 text-xs leading-6 rounded-xl bg-warning-soft text-warning p-3">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                جمع اقلام خوانده‌شده با مبلغی که روی سند چاپ شده {formatMoney(Math.abs(drift), invoice.currency)} اختلاف دارد؛
                یعنی یک یا چند ردیف ناقص خوانده شده است. مبلغ نهایی سند را مرجع گذاشتم. ردیف‌ها را با تصویر مقایسه و کامل کنید.
              </span>
            </p>
          ) : (
            <p className="flex gap-2 text-xs leading-6 rounded-xl bg-accent-soft text-accent p-3">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <span>جمع اقلام با مبلغ نهایی سند می‌خواند.</span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
