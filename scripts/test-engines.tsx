/**
 * آزمون گزارش وضعیت موتورها.
 *
 * سه حالت واقعی که کاربر می‌بیند:
 *   ۱) سرویس پایتون بالاست و PP-OCR می‌خواند → باید همین را نشان دهد.
 *   ۲) سرویس هست ولی موتور قوی آماده نیست → باید دلیل و راه را بگوید.
 *   ۳) نسخهٔ سبک Apache (هیچ API‌ای نیست) → نباید پیام «setup.bat» بدهد،
 *      باید بگوید این بسته فقط موتور مرورگر دارد.
 */
// مرورگر کاذب برای ماژول‌هایی که به sessionStorage دسترسی دارند
const memoryStorage = new Map<string, string>();
(globalThis as Record<string, unknown>).sessionStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStorage.set(k, String(v)); },
  removeItem: (k: string) => { memoryStorage.delete(k); },
  clear: () => memoryStorage.clear(),
};
(globalThis as Record<string, unknown>).localStorage = (globalThis as Record<string, unknown>).sessionStorage;

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

type Mock = { json?: unknown; status?: number; contentType?: string; throws?: boolean };

function mockHealth(reply: Mock) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (reply.throws) throw new Error('network down');
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      headers: { get: () => reply.contentType ?? 'application/json' },
      json: async () => reply.json,
    } as unknown as Response;
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function serverPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      engineAvailable: true,
      engine: 'PP-OCRv5 (arabic)',
      engineId: 'ppocrv5-arabic',
      error: null,
      engines: [{ id: 'ppocrv5-arabic', label: 'PP-OCRv5 (arabic)', ready: true }],
      diagnostics: {
        python: { version: '3.11.9', onnxruntime: true, rapidocr: true, torch: false, transformers: false },
        falcon: {
          dir: 'ocr-service/models/falcon-ocr-arabic', hasWeights: false, weights: [],
          ready: false, reason: 'وزن مدل نیست', reasonEn: 'weights missing',
        },
        dictionary: { words: 4984 },
        files: { det: 'PP-OCRv5_mobile_det.onnx', rec: 'arabic_PP-OCRv5_mobile_rec.onnx', dict: 'arabic_dict.txt' },
        engines: [
          { id: 'falcon-ocr-arabic', label: 'Falcon-OCR-Arabic', ready: false, reason: 'وزن مدل نیست', hint: 'falcon-setup.bat' },
          { id: 'ppocrv5-arabic', label: 'PP-OCR (عربی)', ready: true, reason: null, hint: 'موتور محلی پیشنهادی' },
          { id: 'tesseract-browser', label: 'Tesseract (درون مرورگر)', ready: true, reason: null },
        ],
      },
      ...overrides,
    },
  };
}

async function main() {
  const { engineDiagnostics, resetServerOcrCache } = await import('../src/lib/ocr/serverEngine');
  const OcrEngineStatus = (await import('../src/components/OcrEngineStatus')).default;

  console.log('— ۱) سرویس بالا و موتور آماده —');
  {
    resetServerOcrCache();
    const restore = mockHealth({ json: serverPayload() });
    const diag = await engineDiagnostics();
    check('موتور فعال از سرویس خوانده شد', diag.engineId === 'ppocrv5-arabic', String(diag.engineId));
    check('سرویس بالاست', diag.engineAvailable === true);
    check('حالت سروری تشخیص داده شد', diag.mode === 'server');
    check('شمار واژه‌های دیکشنری رسید', diag.dictionary?.words === 4984);
    check('فایل‌های مدل رسیدند', diag.files?.det?.includes('det'));
    check('فالکون آماده نیست و دلیل دارد', diag.falcon?.ready === false && !!diag.falcon?.reason);
    check('سه موتور گزارش شده‌اند', diag.engines.length === 3, String(diag.engines.length));
    restore();
  }

  console.log('— ۲) سرویس هست، موتور قوی نیست —');
  {
    resetServerOcrCache();
    const payload = serverPayload({ engineAvailable: false, engine: null, engineId: null, error: 'سرویس موتور قوی اجرا نشده است' });
    payload.data.diagnostics.engines = [
      { id: 'falcon-ocr-arabic', label: 'Falcon-OCR-Arabic', ready: false, reason: 'وزن مدل نیست' },
      { id: 'ppocrv5-arabic', label: 'PP-OCR (عربی)', ready: false, reason: 'onnxruntime نصب نیست' },
      { id: 'tesseract-browser', label: 'Tesseract (درون مرورگر)', ready: true, reason: null },
    ];
    const restore = mockHealth({ json: payload });
    const diag = await engineDiagnostics();
    check('دلیل نبود PP-OCR گزارش شد', diag.engines.some((e) => e.reason === 'onnxruntime نصب نیست'));
    check('حالت سروری است (نه استاتیک)', diag.mode === 'server');
    restore();
  }

  console.log('— ۳) نسخهٔ سبک Apache —');
  {
    resetServerOcrCache();
    const restore = mockHealth({ status: 404, contentType: 'text/html', json: null });
    const diag = await engineDiagnostics();
    check('حالت استاتیک تشخیص داده شد', diag.mode === 'static', diag.mode);
    check('سرویس پایین گزارش شد', diag.serviceDown === true);
    check('موتور پیش‌فرض Tesseract است', (diag.engineId ?? 'tesseract-browser') === 'tesseract-browser');
    restore();
  }

  console.log('— ۴) رندر کارت وضعیت —');
  {
    resetServerOcrCache();
    const restore = mockHealth({ json: serverPayload() });
    await engineDiagnostics();
    // رندر سمت سرور، افکت‌ها را اجرا نمی‌کند؛ برای همین وابستگی به fetch را
    // با مقدار اولیهٔ سرویس‌دار بررسی می‌کنیم: محتوای ثابت کارت.
    const html = renderToStaticMarkup(React.createElement(OcrEngineStatus) as never);
    check('عنوان کارت هست', html.includes('موتور خواندن'));
    check('دکمهٔ بررسی دوباره هست', html.includes('بررسی دوباره'));
    check('برچسب گفت‌وگو با کاربر انگلیسی/فارسی درست است', html.includes('موتور خواندن (OCR)'));
    restore();
  }

  console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} موفق، ${fail} ناموفق`);
  if (fail) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
