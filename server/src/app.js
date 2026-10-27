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
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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

  app.use(express.json({ limit: config.jsonLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonLimit }));

  app.use(globalLimiter);
  app.use('/api/v2', healthRoutes);
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
