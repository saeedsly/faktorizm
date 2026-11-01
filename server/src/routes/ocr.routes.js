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
    res.json({ success: true, data: { engineAvailable: !!json.ok, engine: json.engine, error: json.error } });
  } catch {
    res.json({ success: true, data: { engineAvailable: false, engine: null, error: 'service down' } });
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
        code: 'OCR_SERVICE_DOWN',
        message: aborted ? 'سرویس OCR در مهلت مقرر پاسخ نداد' : 'سرویس OCR پایتون در دسترس نیست',
      },
    });
  }
});

export default router;

/**
 * پروکسی سرویس ابری (OCR.Space)
 *
 * چرا لازم است: بعضی مرورگرها/شبکه‌ها اجازهٔ درخواست مستقیم به دامنهٔ سرویس
 * ابری را نمی‌دهند (CORS یا فیلتر) و نتیجه‌اش «اتصال برقرار نشد» است. این مسیر
 * همان درخواست را از سمت سرور (همین دستگاه) می‌فرستد؛ کلید فقط در بدنهٔ همین
 * درخواست محلی است و ذخیره یا لاگ نمی‌شود.
 */
const CLOUD_TIMEOUT_MS = Number(process.env.CLOUD_TIMEOUT_MS || 90000);

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
  const language = String(body.language || 'ara').slice(0, 12);
  const form = new FormData();
  form.append('base64Image', `data:image/jpeg;base64,${b64}`);
  form.append('language', language);
  form.append('OCREngine', '2');
  form.append('scale', 'true');
  form.append('isTable', 'true');
  form.append('detectOrientation', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
  try {
    const upstream = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: key },
      body: form,
      signal: controller.signal,
    });
    const json = await upstream.json().catch(() => ({}));
    const failed = json?.IsErroredOnProcessing;
    if (!upstream.ok || failed) {
      const message = Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join(' · ') : json?.ErrorMessage;
      return res.status(502).json({
        success: false,
        error: { code: 'CLOUD_ERROR', message: message || `سرویس ابری خطا داد (${upstream.status})` },
      });
    }
    const text = (json?.ParsedResults || []).map((r) => r?.ParsedText || '').join('\n').trim();
    return res.json({ success: true, data: { text, engine: 'ocrspace', language } });
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

