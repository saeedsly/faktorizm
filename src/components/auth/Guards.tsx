import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, can } from '@/stores/auth';
import { ScanLine, LockKeyhole, Ticket, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/primitives';

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <span className="icon-tile h-14 w-14 rounded-2xl gradient-brand text-white animate-pulse-ring">
        <ScanLine size={26} />
      </span>
      <p className="text-sm text-muted-foreground">در حال بررسی دسترسی…</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authenticated } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!authenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user?.role, permission)) {
    return (
      <div className="card p-10 text-center">
        <LockKeyhole size={30} className="mx-auto text-warning mb-3" />
        <h3 className="font-extrabold mb-1">دسترسی محدود است</h3>
        <p className="text-sm text-muted-foreground">نقش کاربری شما اجازه این بخش را ندارد. برای ارتقای دسترسی با مالک سازمان هماهنگ کنید.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { subscription, loading } = useAuth();
  if (loading) return <Splash />;
  if (subscription?.active) return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="card max-w-lg w-full p-8 text-center animate-scale-in">
        <span className="icon-tile h-16 w-16 rounded-2xl bg-warning-soft text-warning mx-auto mb-4">
          <LockKeyhole size={30} />
        </span>
        <h2 className="text-xl font-extrabold mb-2">اشتراک شما منقضی شده است</h2>
        <p className="text-sm text-muted-foreground leading-7 mb-6">
          برای حفاظت از داده‌ها، بخش‌های کاری سامانه تا تمدید اشتراک قفل هستند. اطلاعات شما حفظ شده و پس از
          وارد کردن کد اشتراک جدید، دوباره در دسترس خواهد بود.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link to="/subscription"><Button><RefreshCcw size={17} /> وارد کردن کد اشتراک</Button></Link>
          <Link to="/tickets"><Button variant="outline"><Ticket size={17} /> ثبت تیکت پشتیبانی</Button></Link>
        </div>
      </div>
    </div>
  );
}
