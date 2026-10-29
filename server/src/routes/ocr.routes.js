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
