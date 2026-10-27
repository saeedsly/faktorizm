import { Component, type ReactNode } from 'react';
import { RefreshCcw, House, ShieldAlert } from 'lucide-react';
import { clearTokens } from '@/lib/api/client';

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

/**
 * مرز خطای سراسری: هر خطای رندر به‌جای صفحه سفید، یک پنل فارسی قابل‌بازیابی نشان می‌دهد.
 * جزئیات فنی فقط در کنسول می‌ماند تا کاربر عادی سردرگم نشود.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] خطای رندر برنامه:', error);
  }

  private reload = () => window.location.reload();

  private goLogin = () => {
    clearTokens();
    window.location.assign('/auth/login');
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-8 text-center animate-scale-in">
          <span className="icon-tile h-16 w-16 rounded-2xl bg-warning-soft text-warning mx-auto mb-4">
            <ShieldAlert size={30} />
          </span>
          <h2 className="text-lg font-extrabold mb-2">اجزای صفحه با مشکل مواجه شد</h2>
          <p className="text-sm text-muted-foreground leading-7 mb-6">
            داده‌های شما دست‌نخورده و روی همین دستگاه ذخیره است. این خطا معمولاً به‌خاطر نسخه قدیمی صفحه در
            حافظه مرورگر رخ می‌دهد؛ یک بار تازه‌سازی کامل صفحه معمولاً مشکل را حل می‌کند.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={this.reload}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl gradient-brand text-white text-sm font-bold">
              <RefreshCcw size={17} /> تازه‌سازی صفحه
            </button>
            <button onClick={this.goLogin}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-border text-sm font-bold hover:bg-muted transition">
              <House size={17} /> بازگشت به ورود
            </button>
          </div>
        </div>
      </div>
    );
  }
}
