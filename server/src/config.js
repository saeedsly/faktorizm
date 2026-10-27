import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const toInt = (v, d) => (v === undefined || v === '' ? d : Number(v));
const toList = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);

function ephemeralSecret() {
  console.warn('[config] هشدار: JWT_SECRET تنظیم نشده است؛ یک کلید موقت برای این اجرا ساخته شد. در production حتما متغیر محیطی بدهید.');
  return randomBytes(48).toString('hex');
}

export const config = {
  port: toInt(process.env.PORT, 8787),
  env: process.env.NODE_ENV || 'development',
  dbDriver: process.env.DB_DRIVER || 'memory', // memory | mysql
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: toInt(process.env.MYSQL_PORT, 3306),
    // از ?? استفاده می‌شود تا رمز خالی XAMPP (root بدون رمز) واقعا خالی بماند
    user: process.env.MYSQL_USER ?? 'faktorizm',
    password: process.env.MYSQL_PASSWORD ?? 'faktorizm',
    database: process.env.MYSQL_DATABASE || 'faktorizm',
    connectionLimit: toInt(process.env.MYSQL_POOL, 20),
  },
  dataDir: process.env.DATA_DIR || join(process.cwd(), 'data'),
  jwt: {
    secret: process.env.JWT_SECRET || ephemeralSecret(),
    accessTtl: process.env.ACCESS_TTL || '15m',
    accessTtlMs: toInt(process.env.ACCESS_TTL_MS, 15 * 60 * 1000),
    refreshTtlDays: toInt(process.env.REFRESH_TTL_DAYS, 7),
  },
  corsOrigins: toList(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']),
  trialDays: toInt(process.env.TRIAL_DAYS, 14),
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  maxLoginFailures: toInt(process.env.MAX_LOGIN_FAILURES, 5),
  lockMinutes: toInt(process.env.LOCK_MINUTES, 15),
  jsonLimit: process.env.JSON_LIMIT || '2mb',
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 2000),
  authRateLimitMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
};
