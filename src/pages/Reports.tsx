import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3, FileSpreadsheet, FileCog, Landmark, Wallet, ReceiptText, Percent, Printer, PlugZap,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { Card, CardTitle, StatCard, Button, Input, Select, EmptyState, Badge } from '@/components/ui/primitives';
import { db } from '@/lib/db';
import { formatMoney, toFaDigits } from '@/lib/utils';
import { toISO, toJalali, jalaliMonthKey, jalaliMonthLabel } from '@/lib/jalali';
import {
  exportInvoicesXlsx, exportInvoicesCsv, type AccountingSoftware, SOFTWARE_LABELS,
} from '@/lib/exporters/excel';
import { printInvoice } from '@/lib/exporters/print';
import { useAppStore } from '@/lib/store';

export default function Reports() {
  const { settings } = useAppStore();
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [direction, setDirection] = useState('all');
  const [category, setCategory] = useState('all');
  const [software, setSoftware] = useState<AccountingSoftware>('sepidar');

  const categories = useMemo(() => Array.from(new Set(invoices.map((i) => i.category).filter(Boolean))), [invoices]);

  const filtered = useMemo(() => {
    let rows = invoices.filter((i) => !i.deletedAt && i.status !== 'draft');
    const f = toISO(from);
    const t = toISO(to);
    if (f) rows = rows.filter((i) => i.date >= f!);
    if (t) rows = rows.filter((i) => i.date <= t!);
    if (direction !== 'all') rows = rows.filter((i) => i.direction === direction);
    if (category !== 'all') rows = rows.filter((i) => i.category === category);
    return rows;
  }, [invoices, from, to, direction, category]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, i) => s + i.total, 0),
    tax: filtered.reduce((s, i) => s + i.taxTotal, 0),
    discount: filtered.reduce((s, i) => s + i.discountTotal, 0),
  }), [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of filtered) map.set(inv.category || 'سایر', (map.get(inv.category || 'سایر') ?? 0) + inv.total);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const taxByMonth = useMemo(() => {
    const map = new Map<string, { tax: number; total: number; count: number }>();
    for (const inv of filtered) {
      const key = jalaliMonthKey(inv.date);
      const cur = map.get(key) ?? { tax: 0, total: 0, count: 0 };
      cur.tax += inv.taxTotal;
      cur.total += inv.total;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, label: jalaliMonthLabel(key), ...v }));
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="گزارش‌ها و تحلیل"
        subtitle="گزارش مالی، مالیاتی و خروجی نرم‌افزارهای حسابداری"
        icon={<BarChart3 size={22} />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesCsv(filtered)}><FileCog size={15} /> CSV</Button>
            <Button size="sm" onClick={() => exportInvoicesXlsx(filtered, software)}>
              <FileSpreadsheet size={15} /> خروجی {SOFTWARE_LABELS[software]}
            </Button>
          </>
        }
      />

      {/* فیلترها */}
      <Card className="!p-4 mb-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <Input className="md:col-span-3" placeholder="از تاریخ ۱۴۰۳/۰۱/۰۱" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input className="md:col-span-3" placeholder="تا تاریخ" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select className="md:col-span-2" value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="all">همه جهت‌ها</option>
          <option value="purchase">خرید</option>
          <option value="sale">فروش</option>
        </Select>
        <Select className="md:col-span-2" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">همه دسته‌ها</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="md:col-span-2" value={software} onChange={(e) => setSoftware(e.target.value as AccountingSoftware)}>
          <option value="sepidar">قالب سپیدار</option>
          <option value="hamkaran">قالب همکاران سیستم</option>
          <option value="rayvarz">قالب رایورز</option>
          <option value="parsian">قالب پارسیان</option>
          <option value="generic">اکسل استاندارد</option>
        </Select>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatCard icon={<ReceiptText size={20} />} label="تعداد اسناد" value={toFaDigits(totals.count)} tone="primary" />
        <StatCard icon={<Wallet size={20} />} label="مجموع مبالغ" value={formatMoney(totals.amount, 'IRT')} tone="accent" />
        <StatCard icon={<Landmark size={20} />} label="مالیات بر ارزش افزوده" value={formatMoney(totals.tax, 'IRT')} tone="info" />
        <StatCard icon={<Percent size={20} />} label="مجموع تخفیف" value={formatMoney(totals.discount, 'IRT')} tone="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Card>
          <CardTitle title="مبلغ به تفکیک دسته‌بندی" icon={<BarChart3 size={18} />} />
          {byCategory.length === 0 ? <EmptyState title="داده‌ای در بازه فعلی نیست" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byCategory} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => toFaDigits(Math.round(v / 1_000_000)) + ' م'}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 12, fontFamily: 'inherit' }}
                  formatter={(v) => [formatMoney(Number(v), 'IRT'), 'مبلغ']}
                />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 8, 8, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardTitle title="گزارش ماهانه مالیات بر ارزش افزوده" sub="آماده اظهارنامه فصلی" icon={<Landmark size={18} />} />
          {taxByMonth.length === 0 ? <EmptyState title="داده‌ای نیست" /> : (
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-[11px] text-muted-foreground border-b border-border">
                    <th className="p-2.5 text-right font-semibold">ماه</th>
                    <th className="p-2.5 text-right font-semibold">تعداد</th>
                    <th className="p-2.5 text-left font-semibold">مبلغ کل</th>
                    <th className="p-2.5 text-left font-semibold">مالیات</th>
                  </tr>
                </thead>
                <tbody>
                  {taxByMonth.map((m) => (
                    <tr key={m.key} className="border-b border-border last:border-0">
                      <td className="p-2.5 font-semibold text-[13px]">{m.label}</td>
                      <td className="p-2.5 text-xs">{toFaDigits(m.count)}</td>
                      <td className="p-2.5 text-left text-[13px] font-bold">{formatMoney(m.total, 'IRT')}</td>
                      <td className="p-2.5 text-left">
                        <Badge className="bg-info-soft text-info">{formatMoney(m.tax, 'IRT')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* راهنمای اتصال */}
      <Card className="mt-5">
        <CardTitle title="اتصال به نرم‌افزار حسابداری" icon={<PlugZap size={18} />} />
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: 'سپیدار سیستم', desc: 'شیت اختصاصی با ستون‌های طرف حساب، کالا، واحد، تخفیف و مالیات برای Import سند خرید.' },
            { name: 'همکاران سیستم', desc: 'ستون‌های سند حسابداری بدهکار/بستانکار با مبالغ ریالی آماده ورود به دفتر.' },
            { name: 'رایورز و پارسیان', desc: 'فرمت ردیف کالا و فایل لاتین پارسیان برای ماژول ورود اطلاعات.' },
          ].map((s) => (
            <div key={s.name} className="rounded-xl border border-border p-4 hover:border-primary/40 transition-colors">
              <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><FileSpreadsheet size={15} className="text-primary" /> {s.name}</h4>
              <p className="text-xs leading-6 text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => {
            if (!filtered.length) return toast.error('سندی برای چاپ نیست');
            printInvoice(filtered[0], settings);
          }}><Printer size={15} /> چاپ اولین فاکتور گزارش</Button>
          <Button variant="ghost" size="sm" onClick={() => toast.success('راهنما', { description: 'برای اتصال خودکار به‌جای فایل، از مرکز API کلید بگیرید و به تیم فنی نرم‌افزار حسابداری بدهید.' })}>
            راهنمای اتصال API
          </Button>
        </div>
      </Card>
    </div>
  );
}
