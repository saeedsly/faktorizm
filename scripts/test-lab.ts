/**
 * آزمون «آزمایشگاه خوانش».
 *
 * چیزی که باید تضمین شود:
 *   ۱) وقتی سرویس محلی خاموش است، آزمایشگاه دروغ نگوید و همان را بگوید.
 *   ۲) برای هر موتور سروری، درخواست با ?engine= درست برود (وگرنه هر سه
 *      نتیجه یکسان می‌شد — همان باگی که یک‌بار رخ داد).
 *   ۳) خطای واقعی سرور به کاربر برسد، نه پیام کلی.
 *   ۴) امتیاز مقایسه، موتور پرخطا را بالا نیاورد.
 */
const memoryStorage = new Map<string, string>();
(globalThis as Record<string, unknown>).sessionStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStorage.set(k, String(v)); },
  removeItem: (k: string) => { memoryStorage.delete(k); },
  clear: () => { memoryStorage.clear(); },
};
(globalThis as Record<string, unknown>).localStorage = (globalThis as Record<string, unknown>).sessionStorage;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

type Call = { url: string; body: unknown };

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body });
    const reply = handler(url, init);
    const withJson = {
      ok: (reply as { status?: number }).status ? (reply as { status?: number }).status! < 400 : true,
      status: (reply as { status?: number }).status ?? 200,
      headers: { get: () => 'application/json' },
      json: async () => (reply as { json?: unknown }).json,
    };
    return withJson as unknown as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const settings = {
  aiProvider: 'ocrspace',
  aiKeys: 'K8752522415505188957',
  aiApiKey: '',
  aiModel: 'ara',
  aiBaseUrl: '',
  ocrLang: 'fas',
  ocrLangs: 'fas',
  ocrQuality: 'fast',
} as never;

function enginePayload(id: string, text: string) {
  return {
    status: 200,
    json: {
      success: true,
      data: {
        text,
        confidence: 91.8,
        lines: [{ text }],
        items: [{ title: 'x' }, { title: 'y' }],
        engine: { id, label: id },
      },
    },
  };
}

async function main() {
  const lab = await import('../src/lib/ocr/lab');
  const fakeImage = { canvas: {} as HTMLCanvasElement, blob: new Blob(['x']) };
  // موتور مرورگر قلابی: در نود، worker واقعی بارگذاری نمی‌شود
  lab.installBrowserRunner(async () => ({ text: 'متن موتور مرورگر', confidence: 70 }));

  console.log('— ۱) سرویس محلی خاموش —');
  {
    const mock = mockFetch(() => ({ status: 404, json: null }));
    const results = await lab.runAllEngines(fakeImage, settings, { includeCloud: false });
    check('همهٔ موتورهای سروری در یک ردیف گزارش می‌شوند', results.filter((r) => r.where === 'server').length === 1);
    const server = results.find((r) => r.where === 'server')!;
    check('پیام صریح «سرویس روشن نیست»', /setup\.bat|روشن نیست/.test(server.error ?? ''), server.error);
    check('ادعای موفقیت نمی‌کند', server.ok === false);
    mock.restore();
  }

  console.log('— ۲) سرویس روشن: هر موتور با پارامتر خودش —');
  {
    const mock = mockFetch((url) => {
      if (url.includes('/ocr/health')) {
        return { status: 200, json: { success: true, data: { engineAvailable: true, engineId: 'ppocrv5-arabic' } } };
      }
      const engine = new URL(url, 'http://x').searchParams.get('engine') ?? 'auto';
      return enginePayload(engine, `متن ${engine}`);
    });
    const results = await lab.runAllEngines(fakeImage, settings, { includeCloud: false });
    const enginesCalled = mock.calls
      .filter((c) => c.url.includes('/ocr/recognize'))
      .map((c) => new URL(c.url, 'http://x').searchParams.get('engine'));
    check('درخواست خودکار بدون اجبار موتور', enginesCalled.includes(null), JSON.stringify(enginesCalled));
    check('درخواست PP-OCR با engine=ppocrv5', enginesCalled.includes('ppocrv5'), JSON.stringify(enginesCalled));
    check('درخواست Falcon با engine=falcon', enginesCalled.includes('falcon'));
    check('درخواست multi با engine=multi', enginesCalled.includes('multi'));
    check('چهار نتیجهٔ سروری برگشت', results.filter((r) => r.where === 'server').length === 4);
    check('متن هر موتور جداگانه است', new Set(results.map((r) => r.text)).size > 1);
    check('اقلام از پاسخ خوانده شد', results[0].items === 2, String(results[0].items));
    mock.restore();
  }

  console.log('— ۳) خطای واقعی سرور —');
  {
    const mock = mockFetch((url) => {
      if (url.includes('/ocr/health')) {
        return { status: 200, json: { success: true, data: { engineAvailable: true } } };
      }
      return { status: 502, json: { success: false, error: { code: 'ENGINE_NOT_READY', message: 'وزن مدل Falcon نیست' } } };
    });
    const results = await lab.runAllEngines(fakeImage, settings, { includeCloud: false });
    const serverErrors = results.filter((r) => r.where === 'server' && !r.ok);
    check('خطا به کاربر می‌رسد', serverErrors.some((r) => r.error === 'وزن مدل Falcon نیست'));
    mock.restore();
  }

  console.log('— ۴) امتیاز مقایسه —');
  {
    const good = { id: 'a', label: 'a', where: 'server' as const, ok: true, text: 'x'.repeat(400), confidence: 92, lines: 10, items: 5, elapsedMs: 100 };
    const bad = { ...good, id: 'b', items: 0, confidence: 40, text: 'x' };
    const broken = { ...good, id: 'c', ok: false, text: '', confidence: 0, items: 0 };
    check('موتور پرمحتوا امتیاز بالاتر دارد', lab.scoreOf(good) > lab.scoreOf(bad));
    check('موتور خطادار امتیاز منفی دارد', lab.scoreOf(broken) < 0);
  }

  console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} موفق، ${fail} ناموفق`);
  if (fail) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
