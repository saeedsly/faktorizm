import type { ReactNode } from 'react';
import { ScanLine, ShieldCheck, LockKeyhole, Sparkles } from 'lucide-react';

export default function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* پنل برند */}
      <div className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 bg-[#0c1220] text-white">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_80%_10%,#6d5efc,transparent_55%),radial-gradient(circle_at_10%_90%,#16d39a,transparent_45%)]" />
        <div className="relative flex items-center gap-3">
          <span className="icon-tile h-12 w-12 gradient-brand text-white">
            <ScanLine size={24} />
          </span>
          <div>
            <h1 className="text-xl font-black">فاکتوریزم</h1>
            <p className="text-[11px] text-white/60">هوش مصنوعی مدیریت فاکتور</p>
          </div>
        </div>
        <div className="relative space-y-6">
          <h2 className="text-3xl font-black leading-10">
            ورود دستی فاکتورها<br />
            <span className="gradient-text">تمام شده است.</span>
          </h2>
          <p className="text-sm leading-8 text-white/70 max-w-md">
            اسکن کن، استخراج خودکار تحویل بگیر، گزارش بسپار و با خیال راحت بفروش.
            همه داده‌ها زیر حساب کاربری خودت، با رمزنگاری و کنترل دسترسی دقیق محافظت می‌شوند.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { icon: ShieldCheck, t: 'احراز هویت دو عاملی' },
              { icon: LockKeyhole, t: 'رمز عبور هش‌شده' },
              { icon: Sparkles, t: 'OCR هوشمند فارسی' },
              { icon: ScanLine, t: 'خروجی نرم‌افزار حسابداری' },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <f.icon size={17} className="text-[#8b7dff]" />
                <span className="text-xs font-semibold text-white/85">{f.t}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[11px] text-white/40">
          طراحی و توسعه توسط سعید سالاری · تمامی حقوق این محصول محفوظ است
        </p>
      </div>

      {/* پنل فرم */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <span className="icon-tile h-11 w-11 gradient-brand text-white"><ScanLine size={22} /></span>
            <h1 className="text-lg font-black">فاکتوریزم</h1>
          </div>
          <h2 className="text-2xl font-extrabold mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground mb-8 leading-7">{subtitle}</p>
          {children}
          {footer && <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
