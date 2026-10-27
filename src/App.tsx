import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/layout/Layout';
import { RequireAuth, SubscriptionGate, PermissionGate } from './components/auth/Guards';
import { useAppStore } from './lib/store';
import { useAuth } from './stores/auth';
import { seedDemoData } from './lib/seed';

import Login from './pages/auth/Login';
import RegisterPage from './pages/auth/Register';
import TwoFactor from './pages/auth/TwoFactor';
import Forgot from './pages/auth/Forgot';

import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Invoices from './pages/Invoices';
import InvoiceEdit from './pages/InvoiceEdit';
import Contacts from './pages/Contacts';
import Products from './pages/Products';
import Reports from './pages/Reports';
import ApiCenter from './pages/ApiCenter';
import ActivityLog from './pages/ActivityLog';
import Features from './pages/Features';
import SettingsPage from './pages/Settings';
import NotFound from './pages/NotFound';
import UsersAdmin from './pages/admin/Users';
import SubscriptionPage from './pages/Subscription';
import Tickets from './pages/Tickets';
import Security from './pages/Security';
import About from './pages/About';

function ScanLineIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5">
      <span className="icon-tile h-16 w-16 rounded-2xl gradient-brand text-white animate-pulse-ring">
        <ScanLineIcon />
      </span>
      <p className="text-sm text-muted-foreground font-semibold">در حال آماده‌سازی فاکتوریزم…</p>
    </div>
  );
}

export default function App() {
  const { loaded, settings, load } = useAppStore();
  const { loading, bootstrap } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await load();
      await bootstrap();
      const s = useAppStore.getState().settings;
      if (!s.seeded) {
        try { await seedDemoData(); } catch (e) { console.warn(e); }
      }
      setReady(true);
    })();
  }, [load, bootstrap]);

  if (!ready || loading || !loaded) return <Splash />;

  const gated = (el: React.ReactNode) => <SubscriptionGate>{el}</SubscriptionGate>;
  const perm = (permission: string, el: React.ReactNode) =>
    <PermissionGate permission={permission}>{el}</PermissionGate>;

  return (
    <BrowserRouter>
      <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{
        style: { fontFamily: 'inherit', borderRadius: '14px' },
      }} />
      <Routes>
        {/* مسیرهای احراز هویت بدون چیدمان اصلی */}
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/2fa" element={<TwoFactor />} />
        <Route path="/auth/forgot" element={<Forgot />} />

        {/* بخش‌های نیازمند ورود */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          {/* بدون قفل اشتراک — حتی پس از انقضا در دسترس‌اند */}
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/security" element={<Security />} />
          <Route path="/about" element={<About />} />
          <Route path="/features" element={<Features />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/activity" element={<ActivityLog />} />

          {/* بخش‌های کاری — هنگام انقضای اشتراک قفل می‌شوند */}
          <Route path="/" element={gated(<Dashboard />)} />
          <Route path="/scan" element={gated(<Scan />)} />
          <Route path="/invoices" element={gated(<Invoices />)} />
          <Route path="/invoices/new" element={gated(<InvoiceEdit mode="create" />)} />
          <Route path="/invoices/:id" element={gated(<InvoiceEdit mode="edit" />)} />
          <Route path="/contacts" element={gated(<Contacts />)} />
          <Route path="/products" element={gated(<Products />)} />
          <Route path="/reports" element={gated(perm('report.read', <Reports />))} />
          <Route path="/users" element={gated(perm('user.read', <UsersAdmin />))} />
          <Route path="/api" element={gated(<ApiCenter />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
