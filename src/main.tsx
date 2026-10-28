import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import './index.css';
import App from './App';

// نمایش روی‌صفحه‌ای خطاهای پیش‌بینی‌نشده تا علت واقعی بدون باز کردن کنسول دیده شود
function showRuntimeError(kind: string, message: string) {
  try {
    if (document.getElementById('fk-fatal-overlay')) return;
    const box = document.createElement('div');
    box.id = 'fk-fatal-overlay';
    box.dir = 'rtl';
    box.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,8,16,.82)';
    const card = document.createElement('div');
    card.style.cssText =
      'max-width:640px;width:100%;background:#141826;color:#f4f6fb;border:1px solid #2a3145;border-radius:18px;padding:24px;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.5)';
    card.innerHTML =
      '<h2 style="margin:0 0 8px;font-size:16px">خطای زمان اجرای برنامه</h2>' +
      `<p style="margin:0 0 12px;font-size:12px;color:#9aa6c2">نوع: ${kind}</p>` +
      `<pre dir="ltr" style="margin:0;white-space:pre-wrap;word-break:break-word;background:#0c101b;border:1px solid #232a3d;border-radius:10px;padding:12px;font-size:11px;line-height:1.7;text-align:left;max-height:40vh;overflow:auto"></pre>` +
      '<button onclick="location.reload()" style="margin-top:16px;height:42px;padding:0 22px;border:0;border-radius:12px;background:#6d5efc;color:#fff;font-weight:700;cursor:pointer">تازه‌سازی صفحه</button>';
    card.querySelector('pre')!.textContent = message;
    box.appendChild(card);
    document.body.appendChild(box);
  } catch {
    /* اگر خود نمایشگر هم خطا داد، هیچی */
  }
}

window.addEventListener('error', (e) => {
  showRuntimeError('error', e.message || String(e.error || 'خطای ناشناخته'));
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = reason?.message ? `${reason.name || 'Error'}: ${reason.message}` : String(reason);
  showRuntimeError('unhandledrejection', msg);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // مسیر نسبی تا در زیرپوشه‌هایی مثل htdocs/faktorizm هم درست ثبت شود
    const swUrl = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(swUrl).catch(() => undefined);
  });
}
