import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  UsersRound, UserPlus, ShieldCheck, Lock, Unlock, Trash2, KeyRound, Ban, CheckCircle2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import {
  Button, Card, Input, Select, Label, Modal, Badge, EmptyState,
} from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api, ApiError } from '@/lib/api/client';
import { useAuth, ROLE_LABELS, type AuthUser } from '@/stores/auth';

const ROLE_CHIP: Record<string, string> = {
  owner: 'bg-warning-soft text-warning',
  admin: 'bg-primary-soft text-primary',
  accountant: 'bg-info-soft text-info',
  operator: 'bg-accent-soft text-accent',
  viewer: 'bg-muted text-muted-foreground',
};

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'operator', password: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const load = async () => {
    try {
      setUsers((await api.get('/users')) as AuthUser[]);
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    try {
      await api.post('/users', form);
      toast.success('کاربر ساخته شد', { description: 'در اولین ورود باید رمز خود را عوض کند' });
      setModal(false);
      setForm({ name: '', email: '', role: 'operator', password: '' });
      void load();
    } catch (e) {
      toast.error('ثبت کاربر ناموفق', { description: (e as ApiError).message });
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api.patch(`/users/${id}`, body);
    toast.success('تغییرات ذخیره شد');
    void load();
  };

  return (
    <div>
      <PageHeader
        title="کاربران و کنترل دسترسی"
        subtitle="تعریف کاربر، تعیین نقش و مدیریت دسترسی‌های سازمان"
        icon={<UsersRound size={22} />}
        actions={<Button size="sm" onClick={() => setModal(true)}><UserPlus size={16} /> کاربر جدید</Button>}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5 stagger">
        {Object.entries(ROLE_LABELS).map(([role, label], i) => {
          const count = users.filter((u) => u.role === role).length;
          return (
            <Card key={role} className="!p-4">
              <div className="flex items-center justify-between">
                <ShieldCheck size={18} className={['text-warning', 'text-primary', 'text-info', 'text-accent', 'text-muted-foreground'][i]} />
                <span className="text-lg font-black">{count}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{label}</p>
            </Card>
          );
        })}
      </div>

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={<UsersRound size={26} />} title="کاربری ثبت نشده است" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border bg-muted/50">
                  <th className="p-3.5 text-right font-semibold">کاربر</th>
                  <th className="p-3.5 text-right font-semibold">نقش</th>
                  <th className="p-3.5 text-right font-semibold">امنیت</th>
                  <th className="p-3.5 text-right font-semibold">وضعیت</th>
                  <th className="p-3.5 text-center w-56">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="table-row-hover border-b border-border last:border-0">
                    <td className="p-3.5">
                      <p className="font-bold text-[13px]">{u.name} {u.id === me?.id && <span className="text-[10px] text-primary">(شما)</span>}</p>
                      <p className="text-[11px] text-muted-foreground dir-ltr" dir="ltr">{u.email}</p>
                    </td>
                    <td className="p-3.5">
                      <Badge className={ROLE_CHIP[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className="p-3.5">
                      <div className="flex gap-1.5">
                        {u.totp_enabled ? <Badge className="bg-accent-soft text-accent"><ShieldCheck size={12} /> 2FA</Badge>
                          : <Badge className="bg-warning-soft text-warning">بدون 2FA</Badge>}
                        {u.must_change_password ? <Badge className="bg-danger-soft text-danger"><KeyRound size={12} /> رمز موقت</Badge> : null}
                      </div>
                    </td>
                    <td className="p-3.5">
                      {u.suspended ? <Badge className="bg-danger-soft text-danger"><Ban size={12} /> معلق</Badge>
                        : <Badge className="bg-accent-soft text-accent"><CheckCircle2 size={12} /> فعال</Badge>}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {u.role !== 'owner' && (
                          <>
                            <Select
                              className="!w-28 !py-1.5 h-9 text-xs"
                              value={u.role}
                              onChange={(e) => patch(u.id, { role: e.target.value })}
                            >
                              {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'owner').map(([r, l]) =>
                                <option key={r} value={r}>{l}</option>)}
                            </Select>
                            <button title={u.suspended ? 'رفع تعلیق' : 'تعلیق'}
                              onClick={() => patch(u.id, { suspended: !u.suspended })}
                              className="icon-tile h-8 w-8 text-muted-foreground hover:bg-warning-soft hover:text-warning">
                              {u.suspended ? <Unlock size={15} /> : <Lock size={15} />}
                            </button>
                            <button title="باز کردن قفل حساب"
                              onClick={async () => { await api.post(`/users/${u.id}/unlock`); toast.success('قفل حساب باز شد'); }}
                              className="icon-tile h-8 w-8 text-muted-foreground hover:bg-accent-soft hover:text-accent">
                              <Unlock size={15} />
                            </button>
                            <button title="خروج از همه دستگاه‌ها"
                              onClick={async () => { await api.post(`/users/${u.id}/revoke-sessions`); toast.success('همه جلسات باطل شد'); }}
                              className="icon-tile h-8 w-8 text-muted-foreground hover:bg-primary-soft hover:text-primary">
                              <KeyRound size={15} />
                            </button>
                            <button title="حذف کاربر"
                              onClick={() => setDeleteId(u.id)}
                              className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                        {u.role === 'owner' && <span className="text-[11px] text-muted-foreground">دسترسی کامل و غیرقابل تغییر</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="تعریف کاربر جدید"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>انصراف</Button><Button onClick={create}>ساخت کاربر</Button></>}>
        <div className="space-y-4">
          <div>
            <Label required>نام و نام خانوادگی</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label required>ایمیل</Label>
            <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label required>نقش کاربری</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'owner').map(([r, l]) =>
                <option key={r} value={r}>{l}</option>)}
            </Select>
          </div>
          <div>
            <Label required>رمز عبور موقت</Label>
            <div className="relative">
              <Input type={showPass ? 'text' : 'password'} dir="ltr" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} className="!pl-11" />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Lock size={16} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">حداقل ۸ کاراکتر با حرف بزرگ، کوچک و عدد. کاربر در ورود اول مجبور به تغییر است.</p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="حذف کاربر"
        message="حذف کاربر، دسترسی او را به همه بخش‌ها قطع و جلسات فعالش را باطل می‌کند. اسناد ثبت‌شده توسط او حذف نمی‌شود."
        confirmLabel="حذف کاربر"
        onConfirm={async () => {
          if (!deleteId) return;
          await api.del(`/users/${deleteId}`);
          setDeleteId(null);
          toast.success('کاربر حذف شد');
          void load();
        }} />
    </div>
  );
}
