import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui/primitives';
import { useAuth } from '@/stores/auth';
import { ApiError } from '@/lib/api/client';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('تکرار رمز عبور مطابقت ندارد');
      return;
    }
    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim().toLowerCase(), form.password);
      toast.success('حساب شما ساخته شد', { description: '۱۴ روز اشتراک آزمایشی فعال است' });
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('ثبت‌نام ناموفق', { description: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const strength = scorePassword(form.password);

  return (
    <AuthShell
      title="ساخت حساب کاربری"
      subtitle="در کمتر از یک دقیقه ثبت‌نام کنید و چهارده روز رایگان امتحان کنید"
      footer={<>قبلا ثبت‌نام کرده‌اید؟ <Link to="/auth/login" className="text-primary font-bold">ورود</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label required>نام و نام خانوادگی</Label>
          <Input required minLength={2} placeholder="مثلا: سعید سالاری" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <Label required>ایمیل کاری</Label>
          <Input type="email" dir="ltr" required placeholder="you@company.com" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <Label required>رمز عبور</Label>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} dir="ltr" required minLength={8}
              placeholder="حداقل ۸ کاراکتر با حرف بزرگ، کوچک و عدد"
              value={form.password} onChange={set('password')} className="!pl-11" autoComplete="new-password" />
            <button type="button" onClick={() => setShow((v) => !v)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {form.password && (
            <div className="flex gap-1 mt-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? strength >= 3 ? 'bg-accent' : strength === 2 ? 'bg-warning' : 'bg-danger' : 'bg-muted'}`} />
              ))}
            </div>
          )}
        </div>
        <div>
          <Label required>تکرار رمز عبور</Label>
          <Input type={show ? 'text' : 'password'} dir="ltr" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </div>
        <p className="text-[11px] leading-6 text-muted-foreground">
          با ثبت‌نام، مسئولیت حفظ رمز و کلیدهای دسترسی حساب خود را می‌پذیرید. اطلاعات اسناد شما بدون اجازه در دسترس هیچ شخص دیگری قرار نمی‌گیرد.
        </p>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          <UserPlus size={18} /> ایجاد حساب و شروع دوره آزمایشی
        </Button>
      </form>
    </AuthShell>
  );
}

function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return score;
}
