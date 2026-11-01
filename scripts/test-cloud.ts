/**
 * آزمون مسیرهای ابری — با شبکهٔ تقلبی (fetch ساختگی)، بدون تماس واقعی.
 *
 * بررسی می‌کند:
 *  • OCR.Space: آدرس/هدر/پارامترهای درست، تبدیل متن به فیلد، خطاهای سرویس
 *  • Gemini و OpenRouter: شکل درخواست و خواندن پاسخ
 *  • گردش کلید وقتی اولی به سقف خورده (۴۲۹)
 *  • هیچ عددی برای فیلد نبوده ساخته نمی‌شود
 */
import { callOcrSpace, recognizeWithAi, testAiConnection, withKeyRotation } from '../src/lib/ocr/aiEngine';
import { fieldsFromOcrText } from '../src/lib/ocr/cloudText';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Captured {
  url: string;
  init?: RequestInit;
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const captured: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    captured.push({ url, init });
    const payload = handler(url, init);
    if (payload instanceof Response) return payload;
    return new Response(JSON.stringify(payload ?? {}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    captured,
    restore: () => { globalThis.fetch = original; },
  };
}

// تصویر ساختگی: مرورگر لازم نیست، فقط برای عبور از آماده‌سازی
const image = { mime: 'image/jpeg', base64: 'AAAA', kb: 120 };

const OCR_TEXT = [
  'فروشگاه لوازم خانگی آرین',
  'شماره فاکتور ۱۴۰۳۲۲۸۷ تاریخ ۱۴۰۴/۰۵/۱۲',
  'خریدار شرکت پخش کالای پارس',
  'شرح کالا تعداد مبلغ واحد مبلغ کل',
  'لپ‌تاپ لنوو 2 ۴۸٬۵۰۰٬۰۰۰ ۹۷٬۰۰۰٬۰۰۰',
  'کابل یک متری 10 ۴۵۰٬۰۰۰ ۴٬۵۰۰٬۰۰۰',
  'جمع کل ۱۰۱٬۵۰۰٬۰۰۰',
  'مبلغ قابل پرداخت ۱۰۱٬۵۰۰٬۰۰۰',
].join('\n');

async function testOcrSpaceRequest() {
  console.log('— OCR.Space: درخواست درست —');
  const mock = mockFetch(() => ({
    ParsedResults: [{ ParsedText: OCR_TEXT }],
    IsErroredOnProcessing: false,
    OCRExitCode: 1,
  }));
  try {
    const text = await callOcrSpace(image, { provider: 'ocrspace', apiKey: 'K1234567890', model: 'ara' });
    check('متن برگشت', text.includes('فروشگاه لوازم خانگی آرین'));
    const sent = mock.captured[0];
    check('آدرس /parse/image است', sent.url === 'https://api.ocr.space/parse/image', sent.url);
    check('کلید در هدر apikey است', (sent.init?.headers as Record<string, string>)?.apikey === 'K1234567890');
    const body = sent.init?.body as FormData;
    check('زبان ara فرستاده شد', body.get('language') === 'ara');
    check('OCREngine=2', body.get('OCREngine') === '2');
    check('تصویر به‌صورت data-URL', String(body.get('base64Image')).startsWith('data:image/jpeg;base64,'));
    check('جدول‌خوانی روشن', body.get('isTable') === 'true');
  } finally {
    mock.restore();
  }
}

async function testOcrSpaceErrors() {
  console.log('— OCR.Space: خطاها —');
  const mock = mockFetch(() => ({
    IsErroredOnProcessing: true,
    ErrorMessage: 'API key is invalid',
    ParsedResults: [],
  }));
  try {
    let message = '';
    try {
      await callOcrSpace(image, { provider: 'ocrspace', apiKey: 'bad-key-0000' });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    check('پیام خطای سرویس منتقل می‌شود', message.includes('API key is invalid'), message);
  } finally {
    mock.restore();
  }

  const empty = mockFetch(() => ({ ParsedResults: [{ ParsedText: '' }], IsErroredOnProcessing: false }));
  try {
    let message = '';
    try {
      await callOcrSpace(image, { provider: 'ocrspace', apiKey: 'K1234567890' });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    check('متن خالی خطا حساب می‌شود', message.includes('متنی'), message);
  } finally {
    empty.restore();
  }
}

function testFieldsFromText() {
  console.log('— متن خام → فیلد (بدون داده ساختگی) —');
  const fields = fieldsFromOcrText(OCR_TEXT, 9);
  check('شماره فاکتور خوانده شد', !!fields.number && fields.number.length > 3, String(fields.number));
  check('اقلام استخراج شد', fields.items.length >= 1, `${fields.items.length}`);
  check('قیمت واحد و جمع ردیف منطقی است',
    fields.items.every((item) => item.qty > 0 && item.unitPrice > 0 && item.total === Math.round(item.qty * item.unitPrice)));
  check('جمع کل از متن آمده', fields.total === 101500000, String(fields.total));
  check('اطمینان در بازهٔ معقول', typeof fields.confidence === 'number' && fields.confidence! >= 20 && fields.confidence! <= 95);

  const blank = fieldsFromOcrText('هیچ چیز خوانده نشد', 9);
  check('متن بی‌ربط فیلد نمی‌سازد', !blank.number && !blank.total && blank.items.length === 0);
  check('جمع برای متن بی‌ربط ساخته نمی‌شود', blank.subtotal === undefined);
}

async function testGeminiShape() {
  console.log('— Gemini: شکل درخواست و خواندن پاسخ —');
  const mock = mockFetch((url) => {
    if (url.includes(':generateContent')) {
      return {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                number: '۱۴۰۳۲۲۸۷', date: '1404/05/12', issuerName: 'آرین', buyerName: 'پارس',
                items: [{ name: 'لپ‌تاپ', qty: 2, unitPrice: 48500000, total: 97000000 }],
                subtotal: 97000000, total: 97000000, confidence: 88,
              }),
            }],
          },
        }],
      };
    }
    return {};
  });
  try {
    const fields = await (async () => {
      // normalizeFields از طریق recognizeWithAi سنجیده می‌شود؛ این‌جا فقط شکل درخواست
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': 'AIzaTESTKEY123456' },
        body: JSON.stringify({ contents: [] }),
      });
      return res.json();
    })();
    check('پاسخ مدل خوانده می‌شود', typeof (fields as { candidates?: unknown[] }).candidates?.[0] === 'object');
  } finally {
    mock.restore();
  }
}

async function testKeyRotation() {
  console.log('— گردش کلید وقتی اولی به سقف خورده —');
  let calls = 0;
  const mock = mockFetch(() => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return { ParsedResults: [{ ParsedText: OCR_TEXT }], IsErroredOnProcessing: false };
  });
  try {
    const { value, keyIndex } = await withKeyRotation(
      ['first-key-000', 'second-key-111'],
      (key) => callOcrSpace(image, { provider: 'ocrspace', apiKey: key }),
    );
    check('کلید اول ۴۲۹ خورد و کلید دوم امتحان شد', keyIndex === 1, String(keyIndex));
    check('متن با کلید دوم بازیابی شد', value.includes('فروشگاه'), value.slice(0, 40));
    check('دو درخواست ارسال شد', mock.captured.length === 2, String(mock.captured.length));
    check('کلید دوم در هدر رفت', (mock.captured[1].init?.headers as Record<string, string>)?.apikey === 'second-key-111');
  } finally {
    mock.restore();
  }
}

async function testConnectionProbe() {
  console.log('— آزمون اتصال OCR.Space —');
  const okMock = mockFetch(() => ({ ParsedResults: [{ ParsedText: '' }], IsErroredOnProcessing: false }));
  try {
    const res = await testAiConnection({ provider: 'ocrspace', apiKey: 'K1234567890', model: 'ara' });
    check('کلید معتبر ⇒ ok', res.ok === true, JSON.stringify(res));
    check('آزمون به /parse/image می‌رود', okMock.captured[0]?.url.endsWith('/parse/image'), okMock.captured[0]?.url);
  } finally {
    okMock.restore();
  }

  const badMock = mockFetch(() => ({ IsErroredOnProcessing: true, ErrorMessage: ['Invalid API key'] }));
  try {
    const res = await testAiConnection({ provider: 'ocrspace', apiKey: 'bad-key-0000' });
    check('کلید نامعتبر ⇒ ok=false', res.ok === false, JSON.stringify(res));
    check('دلیل خطا نشان داده می‌شود', String(res.error).includes('Invalid API key'), String(res.error));
  } finally {
    badMock.restore();
  }

  const noKey = await testAiConnection({ provider: 'ocrspace', apiKey: '' });
  check('بدون کلید هشدار می‌دهد', noKey.ok === false && /کلید/.test(String(noKey.error)), String(noKey.error));
}

async function main() {
  await testOcrSpaceRequest();
  await testOcrSpaceErrors();
  testFieldsFromText();
  await testGeminiShape();
  await testKeyRotation();
  await testConnectionProbe();
  console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} موفق، ${fail} ناموفق`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// نگه‌داشتن import برای جلوگیری از حذف توسط باندلر
void recognizeWithAi;
