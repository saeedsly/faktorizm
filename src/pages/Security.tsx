import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck, KeyRound, Smartphone, MonitorSmartphone, ScrollText, CheckCircle2, Trash2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import {
  Button, Card, CardTitle, Input, Label, Badge, EmptyState,
} from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/stores/auth';
import { relativeTime } from '@/lib/utils';

interface Session { id: string; userAgent: string | null; expiresAt: string; lastUsedAt: string | null; createdAt: string }
interface AuditRow { id: string; event: string; ip: string | null; created_at: string; meta: Record<string, unknown> | null }

export default function Security() {
  const { user } = useAuth();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [totp, setTotp] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');

  const load = async () => {
    try {
      setSessions((await api.get('/users/me/sessions')) as Session[]);
    } catch { /* بدون دسترسی */ }
    try {
      setLogs((await api.get('/audit?limit=40')) as AuditRow[]);
    } catch { /* فقط ادمین */ }
  };
  useEffect(() => { void load(); }, []);

  const changePassword = async () => {
    if (pw.newPassword !== pw.confirm) return toast.error('تکرار رمز مطابقت ندارد');
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('رمز تغییر کرد؛ دوباره وارد شوید');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) { toast.error((e as ApiError).message); }
  };

  const setup2fa = async () => {
    try {
      const data = await api.post('/auth/2fa/setup', {}) as { secret: string; qrDataUrl: string };
      setTotp(data);
    } catch (e) { toast.error((e as ApiError).message); }
  };

  const enable2fa = async () => {
    try {
      await api.post('/auth/2fa/enable', { code });
      toast.success('احراز هویت دو عاملی فعال شد');
      setTotp(null); setCode('');
      useAuth.getState().bootstrap();
    } catch (e) { toast.error((e as ApiError).message); }
  };

  const EVENT_LABELS: Record<string, string> = {
    'auth.login.success': 'ورود موفق', 'auth.login.failed': 'ورود ناموفق', 'auth.login.locked': 'قفل حساب',
    'auth.register': 'ثبت‌نام', 'auth.password.changed': 'تغییر رمز', 'auth.2fa.enabled': 'فعال‌سازی 2FA',
    'auth.2fa.success': 'تایید دو عاملی', 'auth.2fa.failed': '2FA ناموفق', 'user.created': 'ساخت کاربر',
    'user.updated': 'تغییر کاربر', 'user.deleted': 'حذف کاربر', 'license.redeemed': 'فعال‌سازی اشتراک',
    'license.batch_generated': 'تولید کد اشتراک', 'ticket.created': 'تیکت جدید', 'sync.push': 'همگام‌سازی',
  };

  return (
    <div>
      <PageHeader
        title="مرکز امنیت"
        subtitle="رمز عبور، احراز هویت دو عاملی، جلسات فعال و رخدادهای امنیتی"
        icon={<ShieldCheck size={22} />}
      />

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardTitle title="تغییر رمز عبور" icon={<KeyRound size={18} />} />
          <div className="space-y-3">
            <div>
              <Label>رمز فعلی</Label>
              <Input type="password" dir="ltr" value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </div>
            <div>
              <Label>رمز جدید</Label>
              <Input type="password" dir="ltr" placeholder="حداقل ۸ کاراکتر، حرف بزرگ، کوچک و عدد"
                value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </div>
            <div>
              <Label>تکرار رمز جدید</Label>
              <Input type="password" dir="ltr" value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            <Button onClick={changePassword} className="w-full">به‌روزرسانی رمز</Button>
          </div>
        </Card>

        <Card>
          <CardTitle title="احراز هویت دو عاملی (2FA)" icon={<Smartphone size={18} />}
            action={user?.totp_enabled
              ? <Badge className="bg-accent-soft text-accent"><CheckCircle2 size={12} /> فعال</Badge>
              : <Badge className="bg-warning-soft text-warning">غیرفعال</Badge>} />
          {!totp ? (
            <div className="space-y-3">
              <p className="text-xs leading-7 text-muted-foreground">
                با فعال‌سازی دو عاملی، هنگام ورود علاوه بر رمز، کد شش رقمی اپلیکیشن Google Authenticator یا
                Microsoft Authenticator هم خواسته می‌شود. این لایه حتی در صورت لو رفتن رمز، حساب شما را حفظ می‌کند.
              </p>
              <Button variant="outline" onClick={setup2fa} disabled={!!user?.totp_enabled}>
                شروع راه‌اندازی
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <img src={totp.qrDataUrl} alt="QR دو عاملی" className="h-44 w-44 rounded-xl border border-border bg-white p-2" />
                <p className="text-[11px] text-muted-foreground">یا این کلید را دستی وارد کنید:</p>
                <code dir="ltr" className="text-xs bg-muted px-3 py-1.5 rounded-lg">{totp.secret}</code>
              </div>
              <div className="flex gap-2">
                <Input dir="ltr" inputMode="numeric" maxLength={6} placeholder="کد ۶ رقمی"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <Button onClick={enable2fa}>تایید و فعال‌سازی</Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle title="جلسات فعال" sub="دستگاه‌هایی که با حساب شما وارد شده‌اند" icon={<MonitorSmartphone size={18} />} />
          {sessions.length === 0 ? (
            <EmptyState title="جلسه‌ای ثبت نشده" />
          ) : (
            <div className="space-y-2.5">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-muted p-3">
                  <MonitorSmartphone size={18} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" dir="ltr">{s.userAgent || 'دستگاه ناشناس'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {s.lastUsedAt ? `آخرین فعالیت ${relativeTime(s.lastUsedAt)}` : `ساخته ${relativeTime(s.createdAt)}`}
                    </p>
                  </div>
                  <button onClick={async () => {
                    await api.del(`/users/sessions/${s.id}`);
                    toast.success('جلسه باطل شد'); void load();
                  }} className="icon-tile h-8 w-8 text-danger hover:bg-danger-soft"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle title="لاگ رویدادهای امنیتی" icon={<ScrollText size={18} />} />
          {logs.length === 0 ? (
            <EmptyState title="رخدادی برای نمایش نیست" desc="این بخش برای مدیر سازمان فعال است." />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <ShieldCheck size={15} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold">{EVENT_LABELS[l.event] || l.event}</p>
                    <p className="text-[10px] text-muted-foreground" dir="ltr">{l.ip || 'local'} · {relativeTime(l.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
