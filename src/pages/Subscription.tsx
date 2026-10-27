import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Crown, Ticket as TicketIcon, CalendarClock, CheckCircle2, XCircle, KeyRound, Copy, Download,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import {
  Button, Card, CardTitle, Input, Select, Label, Badge, EmptyState,
} from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/api/client';
import { useAuth, can } from '@/stores/auth';
import { toFaDigits } from '@/lib/utils';
import { toJalali } from '@/lib/jalali';

interface Plan { id: string; code: string; name: string; duration_days: number; price_toman: number }
interface License {
  id: string; status: 'unused' | 'redeemed' | 'revoked'; code_last4: string; duration_days: number;
  batch_id: string; redeemed_at: string | null; expires_at: string | null; created_at: string;
}

export default function SubscriptionPage() {
  const { user, subscription, refreshSubscription } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState('');
  const [count, setCount] = useState(10);
  const [licenses, setLicenses] = useState<License[]>([]);
  const isAdmin = can(user?.role, 'license.generate');

  useEffect(() => {
    api.get('/plans').then((d) => {
      const p = d as Plan[];
      setPlans(p);
      setPlanId(p[0]?.id ?? '');
    }).catch(() => undefined);
    if (isAdmin) loadLicenses();
  }, [isAdmin]);

  const loadLicenses = async () => {
    try { setLicenses((await api.get('/licenses')) as License[]); } catch { /* بدون دسترسی */ }
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await api.post('/subscription/redeem', { code: code.trim() });
      toast.success('کد اشتراک با موفقیت فعال شد');
      setCode('');
      await refreshSubscription();
    } catch (e) {
      toast.error('فعال‌سازی ناموفق', { description: (e as ApiError).message });
    } finally { setBusy(false); }
  };

  const generate = async () => {
    const res = await api.post('/licenses/generate', { planId, count }) as {
      batchId: string; items: { code: string }[];
    };
    const csv = ['code', ...res.items.map((i) => i.code)].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `license-batch-${res.batchId}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${toFaDigits(res.items.length)} کد ساخته و دانلود شد`);
    void loadLicenses();
  };

  const sub = subscription;

  return (
    <div>
      <PageHeader
        title="اشتراک و لایسنس"
        subtitle="مدیریت دوره دسترسی، تمدید و کدهای اشتراک"
        icon={<Crown size={22} />}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[.05] bg-[radial-gradient(circle_at_90%_0%,var(--primary),transparent_50%)]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <CardTitle title="وضعیت فعلی اشتراک" />
              {sub?.active
                ? <Badge className="bg-accent-soft text-accent"><CheckCircle2 size={13} /> فعال</Badge>
                : <Badge className="bg-danger-soft text-danger"><XCircle size={13} /> منقضی</Badge>}
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-muted p-4">
                <CalendarClock size={18} className="text-primary mb-2" />
                <p className="text-[11px] text-muted-foreground mb-1">نوع دسترسی</p>
                <p className="font-extrabold text-sm">
                  {sub?.source === 'trial' ? 'دوره آزمایشی' : sub?.source === 'license' ? 'اشتراک خریداری‌شده' : 'بدون اشتراک'}
                </p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <Crown size={18} className="text-warning mb-2" />
                <p className="text-[11px] text-muted-foreground mb-1">روزهای باقی‌مانده</p>
                <p className="font-extrabold text-2xl">{toFaDigits(sub?.daysLeft ?? 0)} <span className="text-xs font-medium">روز</span></p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <TicketIcon size={18} className="text-accent mb-2" />
                <p className="text-[11px] text-muted-foreground mb-1">تاریخ انقضا</p>
                <p className="font-extrabold text-sm">{sub?.expiresAt ? toJalali(sub.expiresAt) : '—'}</p>
              </div>
            </div>

            <div className="mt-6">
              <Label>تمدید با کد اشتراک</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input dir="ltr" placeholder="FKM-XXXX-XXXX-XXXX-XXXX" value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())} className="flex-1 font-mono" />
                <Button loading={busy} onClick={redeem}><KeyRound size={17} /> فعال‌سازی</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                با وارد کردن کد، مدت اشتراک به‌صورت خودکار به اعتبار فعلی اضافه می‌شود و تاریخ انقضا جابه‌جا می‌گردد.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle title="پلن‌های قابل فروش" />
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm">{p.name}</p>
                  <Badge className="bg-primary-soft text-primary">{toFaDigits(p.duration_days)} روزه</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {Number(p.price_toman).toLocaleString('en-US')} تومان
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card className="mt-5">
          <CardTitle title="تولید دسته‌ای کد اشتراک" sub="کدهای جدید بلافاصله قابل توزیع بین مشتریان هستند" icon={<KeyRound size={18} />} />
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)} className="sm:w-64">
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({toFaDigits(p.duration_days)} روز)</option>)}
            </Select>
            <Input type="number" min={1} max={500} value={count}
              onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value))))} className="sm:w-36" />
            <Button onClick={generate}><Download size={16} /> ساخت و دانلود CSV</Button>
          </div>

          {licenses.length === 0 ? (
            <EmptyState icon={<KeyRound size={24} />} title="هنوز کدی ساخته نشده است" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold">وضعیت</th>
                    <th className="p-3 text-right font-semibold">چهار رقم آخر</th>
                    <th className="p-3 text-right font-semibold">مدت</th>
                    <th className="p-3 text-right font-semibold">تاریخ ساخت</th>
                    <th className="p-3 text-right font-semibold">تاریخ مصرف/انقضا</th>
                    <th className="p-3 text-center font-semibold">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.slice(0, 50).map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0 table-row-hover">
                      <td className="p-3">
                        <Badge className={l.status === 'unused' ? 'bg-accent-soft text-accent'
                          : l.status === 'redeemed' ? 'bg-muted text-muted-foreground' : 'bg-danger-soft text-danger'}>
                          {l.status === 'unused' ? 'استفاده‌نشده' : l.status === 'redeemed' ? 'مصرف‌شده' : 'باطل'}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs" dir="ltr">••••{l.code_last4}</td>
                      <td className="p-3 text-xs">{toFaDigits(l.duration_days)} روز</td>
                      <td className="p-3 text-xs">{toJalali(l.created_at)}</td>
                      <td className="p-3 text-xs">{l.redeemed_at ? toJalali(l.expires_at || l.redeemed_at) : '—'}</td>
                      <td className="p-3 text-center">
                        {l.status === 'unused' && (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await api.post(`/licenses/${l.id}/revoke`);
                            toast.success('کد باطل شد'); void loadLicenses();
                          }}>ابطال</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
