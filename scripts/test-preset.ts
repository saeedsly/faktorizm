import { DEFAULT_SETTINGS, normalizeSettings } from '../src/lib/db';
import { keysOf, providerInfo } from '../src/lib/ocr/providers';

let fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  if (ok) console.log(`  ✓ ${n}`);
  else { fail += 1; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};

check('پیش‌فرض: موتور ابری', DEFAULT_SETTINGS.ocrEngine === 'ai', DEFAULT_SETTINGS.ocrEngine);
check('پیش‌فرض: سرویس OCR.Space', DEFAULT_SETTINGS.aiProvider === 'ocrspace', DEFAULT_SETTINGS.aiProvider);
check('پیش‌فرض: مدل ara', DEFAULT_SETTINGS.aiModel === 'ara', DEFAULT_SETTINGS.aiModel);
check('پیش‌فرض: کلید پر است', keysOf(DEFAULT_SETTINGS).length === 1, `${keysOf(DEFAULT_SETTINGS).length}`);
check('پیش‌فرض: تأیید هر بار خاموش', DEFAULT_SETTINGS.aiAskEachTime === false);
check('پیش‌فرض: بدون نیاز به آنبوردینگ', DEFAULT_SETTINGS.onboarded === true);
check('شناسهٔ سرویس معتبر می‌ماند', normalizeSettings({ aiProvider: 'ocrspace' }).aiProvider === 'ocrspace');
check('سرویس ناشناس به پیش‌فرض برمی‌گردد', normalizeSettings({ aiProvider: 'nope' as never }).aiProvider === 'ocrspace');
check('اطلاعات سرویس بدون خطا خوانده می‌شود', providerInfo('ocrspace').label.includes('OCR.Space'));
check('کلید لازم است (keyless نیست)', providerInfo('ocrspace').keyless !== true);

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${fail} ناموفق`);
if (fail) process.exit(1);
