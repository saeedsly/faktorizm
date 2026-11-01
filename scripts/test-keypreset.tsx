// آزمون «کلید آماده» در محیط شبیه‌سازی مرورگر:
//  ۱) نصب تازه → کلید و موتور ابری از همان اول
//  ۲) تنظیمات قدیمی با کلید خالی → کلید برمی‌گردد
//  ۳) کلید کوتاه/خراب → کلید آماده جایگزین می‌شود
//  ۴) کلید دستی کاربر دست‌نخورده می‌ماند
//  ۵) نوار وضعیت در تنظیمات رندر می‌شود
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

async function main() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const w = dom.window as unknown as Record<string, unknown>;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'getComputedStyle',
    'MutationObserver', 'Event', 'CustomEvent', 'localStorage', 'sessionStorage']) {
    if (w[k] === undefined) continue;
    try {
      Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
    } catch { /* فقط‌خواندنی */ }
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  const { DEFAULT_SETTINGS, PRESET_KEY, getSettings, keyStatus, restorePresetKey, db } =
    await import('../src/lib/db');
  const { keysOf } = await import('../src/lib/ocr/providers');
  const { useAppStore } = await import('../src/lib/store');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const CloudKeyStatus = (await import('../src/components/CloudKeyStatus')).default;

  let fail = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    if (ok) console.log(`  ✓ ${name}`);
    else { fail += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
  };

  console.log('— نصب تازه —');
  const fresh = await getSettings();
  check('کلید آماده هست', keysOf(fresh).includes(PRESET_KEY), `${keysOf(fresh).length} کلید`);
  check('سرویس OCR.Space', fresh.aiProvider === 'ocrspace', fresh.aiProvider);
  check('مدل ara', fresh.aiModel === 'ara', fresh.aiModel);
  check('موتور ابری', fresh.ocrEngine === 'ai', fresh.ocrEngine);
  check('وضعیت: کلید ثبت‌شده و آماده', keyStatus(fresh).hasKey && keyStatus(fresh).isPreset);

  console.log('— تنظیمات قدیمی با کلید خالی —');
  await db.settings.put({ ...DEFAULT_SETTINGS, aiKeys: '', aiApiKey: '', aiProvider: 'gemini', aiModel: '', ocrEngine: 'local' });
  const healed = await getSettings();
  check('کلید برگشت', keysOf(healed).includes(PRESET_KEY));
  check('سرویس به OCR.Space برگشت', healed.aiProvider === 'ocrspace');
  check('موتور از محلی به ابری رفت', healed.ocrEngine === 'ai', healed.ocrEngine);

  console.log('— کلید خراب (کوتاه) —');
  await db.settings.put({ ...DEFAULT_SETTINGS, aiKeys: 'abc', aiApiKey: '' });
  const short = await getSettings();
  check('کلید کوتاه با کلید آماده جایگزین شد', keysOf(short).includes(PRESET_KEY));

  console.log('— کلید دستی کاربر —');
  const USER_KEY = 'KmyOwnUserKey1234567890';
  await db.settings.put({ ...DEFAULT_SETTINGS, aiKeys: USER_KEY });
  const user = await getSettings();
  check('کلید کاربر حفظ می‌شود', keysOf(user).includes(USER_KEY) && !keysOf(user).includes(PRESET_KEY));

  console.log('— بازیابی با یک کلیک —');
  const restored = await restorePresetKey();
  check('بازیابی موفق بود', restored);
  const after = await getSettings();
  check('بعد از بازیابی کلید آماده برمی‌گردد', keysOf(after).includes(PRESET_KEY));
  check('تم و نرخ مالیات دست نمی‌خورد',
    after.theme === DEFAULT_SETTINGS.theme && after.defaultTaxRate === DEFAULT_SETTINGS.defaultTaxRate);

  console.log('— نمایش در رابط کاربری —');
  await useAppStore.getState().load();
  const state = useAppStore.getState().settings;
  const html = renderToStaticMarkup(React.createElement(CloudKeyStatus) as never);
  check('نوار وضعیت رندر شد', html.includes('وضعیت خوانش ابری'));
  check('کلید ثبت‌شده نشان داده می‌شود', html.includes('کلید ثبت شده'), html.slice(0, 80));
  check('نام سرویس دیده می‌شود', html.includes('OCR.Space'));
  check('وضعیت store هم کلید دارد', keysOf(state).includes(PRESET_KEY) && state.ocrEngine === 'ai');
  check('خودِ کلید در HTML چاپ نمی‌شود', !html.includes(PRESET_KEY));

  console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${fail} ناموفق`);
  if (fail) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
