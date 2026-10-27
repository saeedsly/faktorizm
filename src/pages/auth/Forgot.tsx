import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MailQuestion, KeyRound } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';

export default function Forgot() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setStep('reset');
      toast.success('درخواست ثبت شد', { description: 'توکن بازنشانی توسط مدیر سامانه برای شما ارسال می‌شود' });
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally { setBusy(false); }
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setStep('done');
    } catch (err) {
      toast.error('بازنشانی ناموفق', { description: (err as ApiError).message });
    } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title="بازیابی رمز عبور"
      subtitle={step === 'done' ? 'رمز شما با موفقیت بازنشانی شد' : 'ایمیل خود را وارد کنید تا لینک بازیابی بگیرید'}
      footer={<Link to="/auth/login" className="text-primary font-bold">بازگشت به ورود</Link>}
    >
      {step === 'email' && (
        <form onSubmit={requestReset} className="space-y-4">
          <span className="icon-tile h-16 w-16 rounded-2xl bg-primary-soft text-primary mx-auto">
            <MailQuestion size={30} />
          </span>
          <div>
            <Label required>ایمیل حساب</Label>
            <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" loading={busy}>دریافت لینک بازیابی</Button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={doReset} className="space-y-4">
          <div>
            <Label required>توکن بازنشانی</Label>
            <Input dir="ltr" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="توکن دریافت‌شده را وارد کنید" />
          </div>
          <div>
            <Label required>رمز عبور جدید</Label>
            <Input type="password" dir="ltr" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" loading={busy}><KeyRound size={17} /> بازنشانی رمز</Button>
        </form>
      )}

      {step === 'done' && (
        <div className="text-center space-y-4">
          <span className="icon-tile h-16 w-16 rounded-2xl bg-accent-soft text-accent mx-auto">
            <KeyRound size={30} />
          </span>
          <Link to="/auth/login">
            <Button className="w-full">رفتن به صفحه ورود</Button>
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
