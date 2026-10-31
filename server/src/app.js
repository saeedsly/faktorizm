import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { globalLimiter, authLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import subscriptionRoutes from './routes/subscriptions.routes.js';
import ticketRoutes from './routes/tickets.routes.js';
import businessRoutes from './routes/business.routes.js';
import auditRoutes from './routes/audit.routes.js';
import ocrRoutes from './routes/ocr.routes.js';
import healthRoutes from './routes/health.routes.js';

// پشتیبانی از الگوی wildcard در CORS_ORIGINS، مثل https://*.example.com
function isOriginAllowed(origin, allowed) {
  if (allowed.includes(origin)) return true;
  return allowed.some((pattern) => {
    if (!pattern.includes('*')) return false;
    const rx = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return rx.test(origin);
  });
}

export function createApp() {
  const app = express();
  const allowPreview = process.env.ALLOW_PREVIEW === '1';
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // wasm-unsafe-eval برای هسته WASM موتور OCR و blob: برای ساخت ورکر آن لازم است
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        // در استقرار عادی هیچ سایتی اجازهٔ قاب‌کردن برنامه را ندارد؛ برای پیش‌نمایش
        // داخل میزکار (ALLOW_PREVIEW=1) فقط دامنهٔ پیش‌نمایش مجاز می‌شود.
        frameAncestors: allowPreview ? ["'self'", 'https://*.e2b.app', 'https://*.arena.ai'] : ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // هدر X-Frame-Options با frame-ancestors در CSP هم‌پوشانی دارد؛ در حالت
    // پیش‌نمایش باید برداشته شود تا برنامه داخل قاب میزکار باز شود.
    xFrameOptions: allowPreview ? false : { action: 'deny' },
  }));

  app.use(cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes('*') || isOriginAllowed(origin, config.corsOrigins)) return cb(null, true);
      const err = new Error('منشا درخواست در فهرست مجاز نیست');
      err.status = 403;
      err.code = 'CORS_BLOCKED';
      cb(err);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  // بدنه خام تصویر برای مسیر OCR باید قبل از پارسر JSON گرفته شود
  app.use('/api/v2/ocr/recognize', express.raw({
    type: ['image/*', 'application/octet-stream'], limit: '25mb',
  }));
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonLimit }));

  app.use(globalLimiter);
  app.use('/api/v2', healthRoutes);
  // روتر OCR باید قبل از روترهای دارای authenticate سراسری mount شود
  // (احراز هویت شناسایی/خوانش داخل خود روتر اعمال می‌شود)
  app.use('/api/v2', ocrRoutes);
  app.use('/api/v2/auth', authLimiter, authRoutes);
  app.use('/api/v2/users', userRoutes);
  app.use('/api/v2', subscriptionRoutes);
  app.use('/api/v2/tickets', ticketRoutes);
  app.use('/api/v2/business', businessRoutes);
  app.use('/api/v2/audit', auditRoutes);

  // سرو فرانت build‌شده روی همان پورت سرور (حالت تک‌سرویس در استقرار نهایی)
  const webDir = process.env.WEB_DIR ? resolve(process.cwd(), process.env.WEB_DIR) : '';
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      return res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
