// آزمون رگرسیون CSP: فراخوانی سرویس‌های ابری از مرورگر باید مجاز باشد.
// اگر connect-src دوباره به 'self' محدود شود، «آزمون اتصال» و خوانش ابری همه‌جا
// شکست می‌خورد؛ این تست همان را می‌گیرد.
import { createApp } from '../server/src/app.js';

const app = createApp();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

try {
  const res = await fetch(`http://127.0.0.1:${port}/api/v2/ocr/health`);
  const csp = res.headers.get('content-security-policy') ?? '';
  const connect = (csp.match(/connect-src ([^;]*)/) ?? ['', ''])[1].trim();
  console.log(`  connect-src → ${connect}`);
  check('هدر CSP وجود دارد', csp.length > 0);
  check("'self' مجاز است", connect.includes("'self'"));
  check('https برای سرویس‌های ابری مجاز است', connect.includes('https:'),
    'بدون https:، Gemini/OCR.Space از مرورگر بلاک می‌شوند');
  check('مدل محلی (localhost) مجاز است', /localhost/.test(connect));
  check('اسکریپت اینلاین هنوز ممنوع است', /script-src 'self'/.test(csp));
} finally {
  server.close();
}

console.log(`\n${failed === 0 ? 'OK' : 'FAIL'} — ${failed === 0 ? 'همه' : failed} بررسی`);
if (failed) process.exit(1);
