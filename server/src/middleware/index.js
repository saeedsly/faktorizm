import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { verifyAccessToken, can } from '../services/security.js';
import { getSubscription } from '../services/license.js';
import { db } from '../db/index.js';
import { config } from '../config.js';

/* ---------- احراز هویت JWT ---------- */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'توکن دسترسی ارسال نشده است' } });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, workspaceId: payload.workspaceId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID', message: 'توکن نامعتبر یا منقضی شده است' } });
  }
}

/* ---------- کنترل دسترسی نقش‌محور ---------- */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'احراز هویت نشده' } });
    if (!can(req.user.role, permission)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'شما اجازه این عملیات را ندارید' } });
    }
    next();
  };
}

/* ---------- قفل عملکردهای پولی هنگام انقضای اشتراک ---------- */
export async function requireActiveSubscription(req, res, next) {
  try {
    const workspace = await db().findOne('workspaces', { id: req.user.workspaceId });
    const sub = await getSubscription(req.user.workspaceId, workspace?.trial_ends_at);
    if (!sub.active) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'اشتراک شما منقضی شده است؛ برای ادامه کد اشتراک جدید وارد کنید',
          subscription: sub,
        },
      });
    }
    req.subscription = sub;
    next();
  } catch (err) {
    next(err);
  }
}

/* ---------- اعتبارسنجی Zod ---------- */
export function validate(schema, part = 'body') {
  return (req, res, next) => {
    try {
      req[part] = schema.parse(req[part]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'داده‌های ورودی معتبر نیست',
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        });
      }
      next(err);
    }
  };
}

/* ---------- محدودیت نرخ ---------- */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.env === 'test' ? Math.max(1000, config.authRateLimitMax) : config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'تلاش ورود بیش از حد مجاز؛ ۱۵ دقیقه بعد دوباره تلاش کنید' } },
});

/* ---------- خطای متمرکز ---------- */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'داده‌های ورودی معتبر نیست',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  // خطاهای بدنه درخواست (حجم زیاد، JSON خراب)
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'حجم داده ارسالی بیش از حد مجاز است' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'قالب JSON درخواست معتبر نیست' } });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    success: false,
    error: {
      code: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: status === 500 ? 'خطای داخلی سرور رخ داد' : err.message,
    },
  });
}

/* ---------- عدم افشای اطلاعات در پاسخ 404 ---------- */
export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'مسیر درخواست‌شده وجود ندارد' } });
}
