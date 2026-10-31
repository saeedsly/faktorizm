// آزمون رگرسیون خطای «Cannot read properties of undefined (reading 'free')»
// ریشه: تنظیماتِ ذخیره‌شدهٔ نسخهٔ قدیمی (فیلد تازه یا شناسهٔ موتور حذف‌شده)
// بدون پاک‌سازی خوانده می‌شد و PROVIDERS[settings.aiProvider] برابر undefined بود.
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { providerInfo, FREE_BADGE } from '../src/lib/ocr/providers';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = '') {
  if (ok) { passed++; } else { failed++; console.log(`❌ ${name} ${extra}`); }
}

/* ------------------------------------------------- تنظیماتِ نسخهٔ قدیمی */
const stale = { id: 'singleton', businessName: 'قدیمی', aiProvider: 'removed-provider' } as never;
const fixed = normalizeSettings(stale);
check('شناسهٔ موتور حذف‌شده اصلاح می‌شود', fixed.aiProvider === DEFAULT_SETTINGS.aiProvider, fixed.aiProvider);
check('فیلدهای تازه پر می‌شوند', fixed.ocrEngine === 'local' && Array.isArray(fixed.aiKeys) === false);
check('آستانهٔ عددی معتبر می‌ماند', fixed.autoApproveThreshold === 85);

const empty = normalizeSettings(undefined);
check('تنظیمات خالی به پیش‌فرض می‌رسد', empty.aiProvider === 'gemini' && empty.currency === 'IRT');

const brokenNumbers = normalizeSettings({ autoApproveThreshold: Number.NaN, defaultTaxRate: 500, theme: 'neon' } as never);
check('آستانهٔ خراب اصلاح می‌شود', brokenNumbers.autoApproveThreshold === 85);
check('نرخ مالیات محدود می‌شود', brokenNumbers.defaultTaxRate === 100);
check('تم نامعتبر اصلاح می‌شود', brokenNumbers.theme === 'dark');

/* ------------------------------------- دسترسی امن به موتور ابری (منشأ خطا) */
for (const id of [undefined, 'gemini', 'openai', 'removed-provider', '', 'x']) {
  const info = providerInfo(id as never);
  check(`providerInfo(${String(id)}) برچسب و رایگان‌بودن دارد`, Boolean(info?.free && FREE_BADGE[info.free]),
    String(info?.free));
}

console.log(passed === passed + failed
  ? `✅ ${passed}/${passed} بررسی تنظیمات موفق`
  : `❌ ${failed} بررسی ناموفق`);
if (failed > 0) process.exit(1);
