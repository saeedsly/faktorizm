import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, KeyRound } from 'lucide-react';
import AuthShell from './AuthShell';
import { Button, Input, Label } from '@/components/ui/primitives';
import { useAuth } from '@/stores/auth';
import { ApiError } from '@/lib/api/client';

export default function TwoFactor() {
  const location = useLocation() as { state?: { challenge?: string; email?: string } };
  const navigate = useNavigate();
  const { verify2fa } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.state?.challenge) {
      navigate('/auth/login');
      return;
    }
    setBusy(true);
    try {
      await verify2fa(location.state.challenge, code);
      toast.success('احراز هویت دو عاملی تایید شد');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('کد تایید نادرست', { description: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="تایید دو عاملی"
      subtitle={`کد شش رقمی اپلیکیشن احراز هویت${location.state?.email ? ` (${location.state.email})` : ''} را وارد کنید`}
    >
      <form onSubmit={submit} className="space-y-5">
        <span className="icon-tile h-16 w-16 rounded-2xl gradient-brand text-white mx-auto">
          <ShieldCheck size={30} />
        </span>
        <div>
          <Label required>کد یک‌بارمصرف</Label>
          <Input
            dir="ltr" inputMode="numeric" maxLength={6} required
            placeholder="------" className="text-center text-2xl tracking-[0.7em] h-14 font-bold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          <KeyRound size={18} /> تایید و ورود
        </Button>
      </form>
    </AuthShell>
  );
}
