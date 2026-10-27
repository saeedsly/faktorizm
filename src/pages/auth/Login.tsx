import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui/primitives';
import { useAuth } from '@/stores/auth';
import { ApiError } from '@/lib/api/client';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (result.twoFactorRequired) {
        navigate('/auth/2fa', { state: { challenge: result.challenge, email } });
        return;
      }
      toast.success('خوش آمدید');
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      const e2 = err as ApiError;
      toast.error('ورود ناموفق', { description: e2.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="ورود به حساب کاربری"
      subtitle="برای دسترسی به اسناد و قابلیت‌های سامانه وارد شوید"
      footer={<>
        حساب ندارید؟ <Link to="/auth/register" className="text-primary font-bold">ساخت حساب جدید</Link>
        <span className="mx-2">·</span>
        <Link to="/auth/forgot" className="text-primary font-bold">فراموشی رمز</Link>
      </>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label required>ایمیل</Label>
          <Input type="email" dir="ltr" required placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <Label required>رمز عبور</Label>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} dir="ltr" required placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="!pl-11" />
            <button type="button" onClick={() => setShow((v) => !v)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-primary-soft p-3">
          <ShieldCheck size={17} className="text-primary shrink-0" />
          <p className="text-[11px] leading-5 text-muted-foreground">
            پس از ۵ تلاش ناموفق، حساب برای ۱۵ دقیقه قفل می‌شود. احراز هویت دو عاملی را بعد از ورود فعال کنید.
          </p>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          <LogIn size={18} /> ورود به سامانه
        </Button>
      </form>
    </AuthShell>
  );
}
