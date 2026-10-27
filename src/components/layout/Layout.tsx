import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, ReceiptText, ContactRound, Package, BarChart3, KeyRound,
  ScrollText, Sparkles, Settings as SettingsIcon, Menu, Search, Plus, Moon, Sun,
  Keyboard, ChevronLeft, ShieldCheck, LogOut, UsersRound, Crown, LifeBuoy,
  RefreshCcw, CloudOff, CheckCircle2, Loader2, Info,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useAuth, ROLE_LABELS, can } from '@/stores/auth';
import { Modal } from '@/components/ui/primitives';
import { onSyncChange, startAutoSync, stopAutoSync, fullSync, type SyncStatus } from '@/lib/sync';
import { cn, toFaDigits } from '@/lib/utils';
import { toJalali } from '@/lib/jalali';

interface NavItem { to: string; icon: typeof LayoutDashboard; label: string; end?: boolean; perm?: string; badge?: string }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'کاری',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'داشبورد', end: true },
      { to: '/scan', icon: ScanLine, label: 'اسکن و استخراج', badge: 'OCR' },
      { to: '/invoices', icon: ReceiptText, label: 'فاکتورها' },
    ],
  },
  {
    label: 'داده‌ها',
    items: [
      { to: '/contacts', icon: ContactRound, label: 'طرفین حساب' },
      { to: '/products', icon: Package, label: 'کالا و خدمات' },
      { to: '/reports', icon: BarChart3, label: 'گزارش‌ها', perm: 'report.read' },
    ],
  },
  {
    label: 'سازمان',
    items: [
      { to: '/users', icon: UsersRound, label: 'کاربران و دسترسی‌ها', perm: 'user.read' },
      { to: '/subscription', icon: Crown, label: 'اشتراک و لایسنس' },
      { to: '/tickets', icon: LifeBuoy, label: 'تیکت پشتیبانی' },
      { to: '/security', icon: ShieldCheck, label: 'مرکز امنیت' },
    ],
  },
  {
    label: 'یکپارچه‌سازی',
    items: [
      { to: '/api', icon: KeyRound, label: 'مرکز API' },
      { to: '/activity', icon: ScrollText, label: 'لاگ فعالیت' },
    ],
  },
  {
    label: 'سیستم',
    items: [
      { to: '/features', icon: Sparkles, label: '۸۹ ویژگی' },
      { to: '/about', icon: Info, label: 'درباره سازنده' },
      { to: '/settings', icon: SettingsIcon, label: 'تنظیمات' },
    ],
  },
];

const SHORTCUTS = [
  { keys: ['/'], desc: 'تمرکز روی جستجوی سراسری' },
  { keys: ['U'], desc: 'رفتن به صفحه اسکن و آپلود' },
  { keys: ['N'], desc: 'ثبت فاکتور دستی جدید' },
  { keys: ['D'], desc: 'رفتن به داشبورد' },
  { keys: ['I'], desc: 'رفتن به فهرست فاکتورها' },
  { keys: ['?'], desc: 'نمایش راهنمای میانبرها' },
  { keys: ['Esc'], desc: 'بستن پنجره‌ها' },
];

// پل وضعیت همگام‌سازی برای رندر دکمه هدر
let currentStatus: { status: SyncStatus; message?: string } = { status: 'idle' };
onSyncChange((status, message) => { currentStatus = { status, message }; });

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [userMenu, setUserMenu] = useState(false);
  const { settings, applyTheme } = useAppStore();
  const { user, subscription, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); setUserMenu(false); }, [location.pathname]);

  useEffect(() => {
    startAutoSync();
    return () => stopAutoSync();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (e.key === '?' && !typing) { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
      else if (e.key === 'u' || e.key === 'U') navigate('/scan');
      else if (e.key === 'n' || e.key === 'N') navigate('/invoices/new');
      else if (e.key === 'd' || e.key === 'D') navigate('/');
      else if (e.key === 'i' || e.key === 'I') navigate('/invoices');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const expired = subscription && !subscription.active;

  const sidebar = (
    <aside className="flex h-full flex-col bg-sidebar border-l border-border">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
        <span className="icon-tile h-10 w-10 gradient-brand text-white shadow-lg shadow-primary/30">
          <ScanLine size={20} />
        </span>
        <div>
          <h1 className="font-extrabold text-[15px] leading-5">فاکتوریزم</h1>
          <p className="text-[10px] text-muted-foreground">هوش مصنوعی فاکتور</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((it) => !it.perm || can(user?.role, it.perm));
          if (!items.length) return null;
          return (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-[10px] font-bold text-muted-foreground/70 tracking-wider">{group.label}</p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                    className={({ isActive }) => cn('nav-link', isActive && 'active')}>
                    <item.icon size={18} className="nav-icon text-muted-foreground" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="mr-auto chip bg-accent-soft text-accent text-[9px]">{item.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-2">
        <div className="card !shadow-none !rounded-xl p-3 flex items-center gap-2.5 bg-primary-soft border-transparent">
          <ShieldCheck size={18} className="text-accent shrink-0" />
          <p className="text-[10.5px] leading-5 text-muted-foreground">
            پردازش OCR لوکال است؛ اسناد شما از دستگاه خارج نمی‌شوند و فقط با رمز خودتان همگام‌سازی می‌شوند.
          </p>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">{sidebar}</div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 animate-slide-in-left">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 glass border-b border-border h-16 flex items-center gap-3 px-4 lg:px-7">
          <button className="lg:hidden icon-tile h-10 w-10 hover:bg-muted text-muted-foreground" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>

          <form
            className="relative flex-1 max-w-xl"
            onSubmit={(e) => { e.preventDefault(); navigate(`/invoices?q=${encodeURIComponent(query)}`); }}
          >
            <Search size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="global-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی فاکتور، طرف حساب، شماره…"
              className="input !pr-10 !bg-muted/70"
            />
            <kbd className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center h-6 px-1.5 rounded-md bg-border text-[10px] font-bold text-muted-foreground">/</kbd>
          </form>

          <div className="mr-auto flex items-center gap-2">
            <SyncButton />
            <button
              onClick={() => setShortcutsOpen(true)}
              className="icon-tile h-10 w-10 hover:bg-muted text-muted-foreground hidden sm:inline-flex"
              title="میانبرهای کیبورد"
            >
              <Keyboard size={18} />
            </button>
            <button
              onClick={() => applyTheme(settings.theme === 'dark' ? 'light' : 'dark')}
              className="icon-tile h-10 w-10 hover:bg-muted text-muted-foreground"
              title="تغییر تم"
            >
              {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => navigate('/scan')} className="h-10 px-4 rounded-xl gradient-brand text-white text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-primary/25 hover:brightness-110 transition">
              <Plus size={17} />
              <span className="hidden sm:inline">اسکن جدید</span>
            </button>

            {/* منوی کاربر */}
            <div className="relative">
              <button onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2.5 h-10 pe-2 ps-3 rounded-xl hover:bg-muted transition">
                <span className="h-8 w-8 rounded-lg gradient-brand text-white text-xs font-black flex items-center justify-center">
                  {(user?.name || '؟').slice(0, 2)}
                </span>
                <span className="hidden md:block text-right">
                  <span className="block text-xs font-bold leading-4">{user?.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{user ? ROLE_LABELS[user.role] : ''}</span>
                </span>
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                  <div className="absolute left-0 top-12 z-50 card w-64 p-2 animate-scale-in">
                    <div className="px-3 py-2.5 border-b border-border mb-1">
                      <p className="text-sm font-bold truncate">{user?.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate" dir="ltr">{user?.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {subscription?.active ? (
                          <span className="chip bg-accent-soft text-accent">
                            <Crown size={11} /> {subscription.source === 'trial' ? 'آزمایشی' : 'اشتراک فعال'} · {toFaDigits(subscription.daysLeft)} روز
                          </span>
                        ) : (
                          <Link to="/subscription" className="chip bg-danger-soft text-danger">
                            <Crown size={11} /> اشتراک منقضی
                          </Link>
                        )}
                      </div>
                    </div>
                    <button onClick={() => { navigate('/security'); setUserMenu(false); }}
                      className="nav-link w-full"><ShieldCheck size={16} /> مرکز امنیت</button>
                    <button onClick={() => { navigate('/subscription'); setUserMenu(false); }}
                      className="nav-link w-full"><Crown size={16} /> مدیریت اشتراک</button>
                    <button onClick={async () => { await logout(); navigate('/auth/login'); }}
                      className="nav-link w-full text-danger hover:bg-danger-soft"><LogOut size={16} /> خروج از حساب</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {expired && (
          <div className="bg-warning-soft text-warning px-4 lg:px-7 py-2.5 flex items-center gap-3 text-xs font-semibold animate-fade-in">
            <Crown size={15} className="shrink-0" />
            <span>اشتراک شما منقضی شده است؛ بخش‌های کاری قفل هستند.</span>
            <Link to="/subscription" className="mr-auto underline font-bold">تمدید اشتراک</Link>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-7 max-w-[1500px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="px-7 py-5 text-center text-[11px] text-muted-foreground/70 space-y-1">
          <p>فاکتوریزم — سامانه هوشمند مدیریت فاکتور · {toFaDigits('89')} ویژگی حرفه‌ای · نسخه {toFaDigits('2.0')}</p>
          <p>طراحی و توسعه توسط <span className="font-bold text-foreground">سعید سالاری</span> · تمامی حقوق محفوظ است © {toFaDigits('1405')}</p>
        </footer>
      </div>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="میانبرهای کیبورد" size="sm">
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-muted-foreground">{s.desc}</span>
              <kbd className="h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-lg bg-muted border border-border text-xs font-bold">{s.keys[0]}</kbd>
            </div>
          ))}
        </div>
      </Modal>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="lg:hidden fixed bottom-5 left-5 h-11 w-11 rounded-full gradient-brand text-white shadow-xl z-30 inline-flex items-center justify-center"
        aria-label="بازگشت به بالا"
      >
        <ChevronLeft size={20} className="rotate-90" />
      </button>
    </div>
  );
}

function SyncButton() {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const state = currentStatus;

  const doSync = async () => {
    setBusy(true);
    try { await fullSync(); force((n) => n + 1); }
    catch { /* خطا در وضعیت نمایش داده می‌شود */ }
    finally { setBusy(false); }
  };

  const meta = {
    idle: { icon: RefreshCcw, cls: 'text-muted-foreground', label: 'همگام‌سازی' },
    syncing: { icon: Loader2, cls: 'text-primary animate-spin', label: 'در حال همگام‌سازی' },
    ok: { icon: CheckCircle2, cls: 'text-accent', label: 'همگام‌سازی شد' },
    error: { icon: CloudOff, cls: 'text-danger', label: 'خطای همگام‌سازی' },
  }[state.status];
  const Icon = busy ? Loader2 : meta.icon;

  return (
    <button onClick={doSync} disabled={busy}
      title={state.message ? `${meta.label} — ${state.message}` : meta.label}
      className="icon-tile h-10 w-10 hover:bg-muted relative">
      <Icon size={18} className={cn(meta.cls, busy && 'animate-spin')} />
      {state.status === 'ok' && (
        <span className="absolute -bottom-0.5 -left-0.5 text-[9px] text-accent" title={state.message || toJalali(new Date().toISOString())}>●</span>
      )}
    </button>
  );
}
