import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/layout/Layout';
import Onboarding from './components/Onboarding';
import { useAppStore } from './lib/store';
import { seedDemoData } from './lib/seed';

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

export default function App() {
  const { loaded, settings, load } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await load();
      const s = useAppStore.getState().settings;
      if (!s.seeded) {
        try { await seedDemoData(); } catch (e) { console.warn(e); }
      }
      setReady(true);
    })();
  }, [load]);

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <span className="icon-tile h-16 w-16 rounded-2xl gradient-brand text-white animate-pulse-ring">
          <ScanLineIcon />
        </span>
        <p className="text-sm text-muted-foreground font-semibold">در حال آماده‌سازی فاکتوریزم…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {!settings.onboarded && <Onboarding />}
      <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{
        style: { fontFamily: 'inherit', borderRadius: '14px' },
      }} />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/new" element={<InvoiceEdit mode="create" />} />
          <Route path="/invoices/:id" element={<InvoiceEdit mode="edit" />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/products" element={<Products />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/api" element={<ApiCenter />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/features" element={<Features />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function ScanLineIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}
