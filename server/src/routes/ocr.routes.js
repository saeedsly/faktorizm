import { Router } from 'express';
import { authenticate } from '../middleware/index.js';

/**
 * پروکسی سرویس OCR قوی (RapidOCR PP-OCRv5)
 *
 * سرویس پایتون روی 127.0.0.1:OCR_PORT اجرا می‌شود و کاملا آفلاین است.
 * اگر سرویس در دسترس نبود، پاسخ 503 با کد OCR_SERVICE_DOWN برمی‌گردد
 * تا فرانت‌اند بی‌سروصدا به موتور مرورگری (Tesseract) fallback کند.
 */
const router = Router();
const OCR_PORT = process.env.OCR_PORT || '8789';
const OCR_BASE = process.env.OCR_SERVICE_URL || `http://127.0.0.1:${OCR_PORT}`;
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 120000);

async function forwardToPythonService(buffer, contentType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch(`${OCR_BASE}/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: buffer,
      signal: controller.signal,
    });
    const json = await res.json();
    return { ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

router.get('/ocr/health', async (_req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${OCR_BASE}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const json = await r.json();
    res.json({
      success: true,
      data: {
        engineAvailable: !!json.ok,
        engine: json.engine,
        engineId: json.engineId,
        error: json.error,
        // گزارش کامل موتورها تا رابط کاربری بگوید کدام موتور چرا آماده نیست
        engines: json.engines ?? [],
        diagnostics: json.diagnostics ?? null,
      },
    });
  } catch {
    res.json({
      success: true,
      data: {
        engineAvailable: false,
        engine: null,
        engineId: null,
        error: 'سرویس موتور قوی (پایتون) اجرا نشده است',
        engines: [],
        diagnostics: null,
      },
    });
  }
});

router.post('/ocr/recognize', authenticate, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'BAD_IMAGE', message: 'بدنه تصویر خالی است' } });
  }
  try {
    const { ok, json } = await forwardToPythonService(req.body, req.headers['content-type']);
    if (!ok || !json.ok) {
      return res.status(502).json({
        success: false,
        error: { code: 'OCR_ENGINE_ERROR', message: json.error || 'خطای موتور OCR' },
      });
    }
    return res.json({ success: true, data: json });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return res.status(503).json({
      success: false,
      error: {
        code: 'CLOUD_UNREACHABLE',
        message: aborted ? 'سرویس ابری در مهلت مقرر پاسخ نداد' : 'سرور به سرویس ابری دسترسی ندارد',
      },
    });
  } finally {
    clearTimeout(timer);
  }
});

/**
 * پروکسی سرویس ابری (OCR.Space)
 *
 * چرا لازم است: بعضی مرورگرها/شبکه‌ها اجازهٔ درخواست مستقیم به دامنهٔ سرویس
 * ابری را نمی‌دهند (CORS یا فیلتر) و نتیجه‌اش «اتصال برقرار نشد» است. این مسیر
 * همان درخواست را از سمت سرور (همین دستگاه) می‌فرستد؛ کلید فقط در بدنهٔ همین
 * درخواست محلی است و ذخیره یا لاگ نمی‌شود.
 *
 * نکتهٔ مهم سرویس: موتور ۲ زبان عربی را پشتیبانی نمی‌کند و
 * «E201: Value for parameter 'language' is invalid» می‌دهد؛ عربی/فارسی فقط با
 * موتور ۱ خوانده می‌شود. برای همین چند ترکیب به ترتیب امتحان می‌شود.
 */
const CLOUD_TIMEOUT_MS = Number(process.env.CLOUD_TIMEOUT_MS || 90000);

function cloudAttempts(language) {
  const lang = String(language || 'ara').toLowerCase();
  if (lang.startsWith('ara') || lang.startsWith('fas') || lang.startsWith('per')) {
    return [{ engine: '1', language: 'ara' }, { engine: '2', language: 'auto' }];
  }
  if (lang === 'auto') {
    return [{ engine: '2', language: 'auto' }, { engine: '1', language: 'ara' }];
  }
  return [
    { engine: '2', language: lang },
    { engine: '2', language: 'auto' },
    { engine: '1', language: 'ara' },
  ];
}

router.post('/ocr/cloud', authenticate, async (req, res) => {
  const body = req.body || {};
  const key = String(body.key || '').trim();
  if (!key || key.length < 8) {
    return res.status(400).json({ success: false, error: { code: 'NO_KEY', message: 'کلید API ارسال نشده است' } });
  }
  const b64 = String(body.image || '').replace(/^data:[^,]+,/, '');
  if (!b64) {
    return res.status(400).json({ success: false, error: { code: 'BAD_IMAGE', message: 'تصویر ارسال نشده است' } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
  let lastMessage = '';
  try {
    for (const attempt of cloudAttempts(body.language)) {
      const form = new FormData();
      form.append('base64Image', `data:image/jpeg;base64,${b64}`);
      form.append('language', attempt.language);
      form.append('OCREngine', attempt.engine);
      form.append('scale', 'true');
      form.append('isTable', 'true');
      form.append('detectOrientation', 'true');

      const upstream = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: key },
        body: form,
        signal: controller.signal,
      });
      const json = await upstream.json().catch(() => ({}));
      if (!upstream.ok || json?.IsErroredOnProcessing) {
        const message = Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join(' · ') : json?.ErrorMessage;
        lastMessage = message || `سرویس ابری خطا داد (${upstream.status})`;
        // فقط خطای ترکیب زبان/موتور ارزش تلاش بعدی دارد؛ کلید غلط یا سهمیه نه
        if (!/E201|language[^\n]*invalid/i.test(lastMessage)) {
          return res.status(502).json({ success: false, error: { code: 'CLOUD_ERROR', message: lastMessage } });
        }
        continue;
      }
      const text = (json?.ParsedResults || []).map((r) => r?.ParsedText || '').join('\n').trim();
      return res.json({
        success: true,
        data: { text, engine: 'ocrspace', language: attempt.language, ocrEngine: attempt.engine },
      });
    }
    return res.status(502).json({
      success: false,
      error: { code: 'CLOUD_ERROR', message: lastMessage || 'سرویس ابری پاسخ نداد' },
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return res.status(503).json({
      success: false,
      error: {
        code: 'CLOUD_UNREACHABLE',
        message: aborted ? 'سرویس ابری در مهلت مقرر پاسخ نداد' : 'سرور به سرویس ابری دسترسی ندارد',
      },
    });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
