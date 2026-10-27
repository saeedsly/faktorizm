import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  ReceiptText, Wallet, Landmark, Clock3, ScanLine, Plus, ArrowLeft, Trophy, FileSpreadsheet,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, CardTitle, StatCard, Badge, Button, EmptyState, Avatar } from '@/components/ui/primitives';
import { db } from '@/lib/db';
import { formatMoney, toFaDigits, STATUS_META, cn } from '@/lib/utils';
import { toJalali, jalaliMonthKey, jalaliMonthLabel, currentJalaliMonthKey } from '@/lib/jalali';
import { exportInvoicesXlsx } from '@/lib/exporters/excel';

const PIE_COLORS = ['#7d70ff', '#16d39a', '#fbbf24', '#fb5d78', '#38bdf8'];

export default function Dashboard() {
  const navigate = useNavigate();
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const contacts = useLiveQuery(() => db.contacts.toArray(), []) ?? [];

  const active = invoices.filter((i) => !i.deletedAt);

  const stats = useMemo(() => {
    const totalAmount = active.reduce((s, i) => s + i.total, 0);
    const tax = active.reduce((s, i) => s + i.taxTotal, 0);
    const review = active.filter((i) => i.status === 'review').length;
    const paid = active.filter((i) => i.paymentStatus === 'paid').length;
    return { totalAmount, tax, review, paid, count: active.length };
  }, [active]);

  const monthly = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; tax: number }>();
    for (const inv of active) {
      const key = jalaliMonthKey(inv.date);
      if (!key) continue;
      const cur = map.get(key) ?? { count: 0, amount: 0, tax: 0 };
      cur.count += 1;
      cur.amount += inv.total;
      cur.tax += inv.taxTotal;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([key, v]) => ({ key, label: jalaliMonthLabel(key), ...v }));
  }, [active]);

  const statusPie = useMemo(() => {
    const order: Array<keyof typeof STATUS_META> = ['review', 'approved', 'rejected', 'draft', 'archived'];
    return order.map((k) => ({ name: STATUS_META[k].label, value: active.filter((i) => i.status === k).length }))
      .filter((d) => d.value > 0);
  }, [active]);

  const topVendors = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of active) {
      if (!inv.issuerName) continue;
      map.set(inv.issuerName, (map.get(inv.issuerName) ?? 0) + inv.total);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [active]);

  const recent = useMemo(() =>
    [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [active]);

  const currentKey = currentJalaliMonthKey();
  const monthStats = monthly.find((m) => m.key === currentKey);

  return (
    <div>
      <PageHeader
        title="داشبورد مدیریتی"
        subtitle="تصویر لحظه‌ای وضعیت فاکتورها و اسناد شما"
        icon={<Wallet size={22} />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesXlsx(active)}>
              <FileSpreadsheet size={15} /> خروجی اکسل
            </Button>
            <Button size="sm" onClick={() => navigate('/scan')}><ScanLine size={16} /> اسکن جدید</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatCard icon={<ReceiptText size={20} />} label="کل فاکتورها" value={toFaDigits(stats.count)}
          sub={`${toFaDigits(stats.review)} در انتظار بازبینی`} tone="primary" />
        <StatCard icon={<Wallet size={20} />} label="مجموع مبالغ" value={formatMoney(stats.totalAmount, 'IRT')}
          sub={monthStats ? `${toFaDigits(monthStats.count)} فاکتور این ماه` : 'این ماه سندی ثبت نشده'} tone="accent" />
        <StatCard icon={<Landmark size={20} />} label="مالیات ارزش افزوده" value={formatMoney(stats.tax, 'IRT')}
          sub="قابل گزارش به سامانه مودیان" tone="info" />
        <StatCard icon={<Clock3 size={20} />} label="در انتظار بازبینی" value={toFaDigits(stats.review)}
          sub={`${toFaDigits(stats.paid)} فاکتور پرداخت شده`} tone={stats.review ? 'warning' : 'accent'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <Card className="lg:col-span-2">
          <CardTitle title="روند ماهانه فاکتورها" sub="مبلغ و تعداد روی تقویم شمسی" icon={<ReceiptText size={18} />} />
          {monthly.length === 0 ? (
            <EmptyState title="داده‌ای برای نمودار نیست" desc="با اسکن اولین فاکتور، نمودار فعال می‌شود." />
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="amt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => toFaDigits(Math.round(v / 1_000_000)) + ' م'} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 12, fontFamily: 'inherit' }}
                  formatter={(value, name) =>
                    [name === 'amount' ? formatMoney(Number(value), 'IRT') : toFaDigits(Number(value)), name === 'amount' ? 'مبلغ' : 'تعداد']}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--primary)" strokeWidth={2.5} fill="url(#amt)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardTitle title="توزیع وضعیت‌ها" icon={<Clock3 size={18} />} />
          {statusPie.length === 0 ? (
            <EmptyState title="داده‌ای نیست" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                    {statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 12, fontFamily: 'inherit' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {statusPie.map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {s.name}
                    </span>
                    <span className="font-bold">{toFaDigits(s.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <Card className="lg:col-span-2 !p-0 overflow-hidden">
          <div className="p-5 pb-3 flex items-center justify-between">
            <CardTitle title="آخرین فاکتورها" />
            <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
              مشاهده همه <ArrowLeft size={14} />
            </Button>
          </div>
          {recent.length === 0 ? (
            <EmptyState title="فاکتوری ثبت نشده است"
              action={<Button onClick={() => navigate('/scan')}><Plus size={16} /> اسکن فاکتور</Button>} />
          ) : (
            <div className="divide-y divide-border">
              {recent.map((inv) => (
                <button key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="w-full flex items-center gap-3 p-4 table-row-hover text-right">
                  {inv.thumbnail
                    ? <img src={inv.thumbnail} className="h-10 w-10 rounded-lg object-cover" alt="" />
                    : <Avatar name={inv.issuerName} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[13px] truncate">{inv.number} — {inv.issuerName || 'بدون نام'}</p>
                    <p className="text-[11px] text-muted-foreground">{toJalali(inv.date)} · {toFaDigits(inv.items.length)} قلم</p>
                  </div>
                  <Badge className={STATUS_META[inv.status].chipClass}>{STATUS_META[inv.status].label}</Badge>
                  <span className="font-extrabold text-[13px] whitespace-nowrap">{formatMoney(inv.total, inv.currency)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle title="برترین طرفین حساب" sub="بر اساس مجموع مبلغ" icon={<Trophy size={18} />} />
          {topVendors.length === 0 ? (
            <EmptyState title="داده‌ای نیست" />
          ) : (
            <div className="space-y-3">
              {topVendors.map(([name, amount], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className={cn('icon-tile h-8 w-8 text-xs font-extrabold',
                    i === 0 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
                    {toFaDigits(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">{name}</p>
                    <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                      <div className="h-full gradient-brand rounded-full"
                        style={{ width: `${(amount / topVendors[0][1]) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-[11px] font-bold whitespace-nowrap">{formatMoney(amount, 'IRT')}</span>
                </div>
              ))}
              <Button variant="outline" className="w-full mt-2" size="sm" onClick={() => navigate('/contacts')}>
                دفتر طرفین حساب
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
