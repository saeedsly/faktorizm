import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, ReceiptText, ContactRound, Package, BarChart3, KeyRound,
  ScrollText, Sparkles, Settings as SettingsIcon, Menu, X, Search, Plus, Moon, Sun,
  Keyboard, ChevronLeft, ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Modal } from '@/components/ui/primitives';
import { cn, toFaDigits } from '@/lib/utils';

const NAV_GROUPS = [
  {
    label: 'کاری',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'داشبورد', end: true },
      { to: '/scan', icon: ScanLine, label: 'اسکن و استخراج' },
      { to: '/invoices', icon: ReceiptText, label: 'فاکتورها' },
    ],
  },
  {
    label: 'داده‌ها',
    items: [
      { to: '/contacts', icon: ContactRound, label: 'طرفین حساب' },
      { to: '/products', icon: Package, label: 'کالا و خدمات' },
      { to: '/reports', icon: BarChart3, label: 'گزارش‌ها' },
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
      { to: '/features', icon: Sparkles, label: '۶۰ ویژگی' },
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
  { keys: ['?'], desc: 'نمایش همین راهنمای میانبرها' },
  { keys: ['Esc'], desc: 'بستن پنجره‌ها' },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { settings, applyTheme } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-[10px] font-bold text-muted-foreground/70 tracking-wider">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) => cn('nav-link', isActive && 'active')}>
                  <item.icon size={18} className="nav-icon text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.label === 'اسکن و استخراج' && (
                    <span className="mr-auto chip bg-accent-soft text-accent text-[9px]">OCR</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="card !shadow-none !rounded-xl p-3 flex items-center gap-2.5 bg-primary-soft border-transparent">
          <ShieldCheck size={18} className="text-accent shrink-0" />
          <p className="text-[10.5px] leading-5 text-muted-foreground">
            پردازش کاملاً لوکال؛ اسناد شما از دستگاه خارج نمی‌شوند.
          </p>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex">
      {/* سایدبار دسکتاپ */}
      <div className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">{sidebar}</div>

      {/* دراور موبایل */}
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
            <button
              onClick={() => setShortcutsOpen(true)}
              className="icon-tile h-10 w-10 hover:bg-muted text-muted-foreground hidden sm:inline-flex"
              title="میانبرهای کیبورد (?)"
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
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-7 max-w-[1500px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="px-7 py-5 text-center text-[11px] text-muted-foreground/70">
          فاکتوریزم — سامانه هوشمند مدیریت فاکتور · {toFaDigits('60')} ویژگی حرفه‌ای · نسخه {toFaDigits('1.0')}
        </footer>
      </div>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="میانبرهای کیبورد" size="sm">
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-muted-foreground">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-lg bg-muted border border-border text-xs font-bold">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* دکمه شناور بازگشت به بالا در موبایل */}
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
