import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import speakeasy from 'speakeasy';
import { config } from '../config.js';

/* ---------- رمز عبور ---------- */
const COMMON_PASSWORDS = new Set([
  'password', '12345678', '123456789', '1234567890', 'qwerty123',
  'password1', 'abc12345', '11111111', '00000000', 'faktorizm',
]);

export function validatePasswordPolicy(password, identity = '') {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) errors.push('رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (!/[a-z]/.test(password)) errors.push('حداقل یک حرف کوچک انگلیسی لازم است');
  if (!/[A-Z]/.test(password)) errors.push('حداقل یک حرف بزرگ انگلیسی لازم است');
  if (!/\d/.test(password)) errors.push('حداقل یک عدد لازم است');
  if (/\s/.test(password)) errors.push('رمز عبور نباید فاصله خالی داشته باشد');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push('این رمز عبور رایانش‌شدنی و ضعیف است');
  if (identity && password.toLowerCase().includes(identity.toLowerCase())) {
    errors.push('رمز عبور نباید شامل ایمیل یا نام کاربری باشد');
  }
  return errors;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain, hash) {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/* ---------- توکن‌ها ---------- */
import jwt from 'jsonwebtoken';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, workspaceId: user.workspace_id, role: user.role },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.accessTtl },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
}

export function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function uid(prefix) {
  return prefix + crypto.randomBytes(10).toString('hex');
}

/* ---------- احراز هویت دو عاملی ---------- */
export function generateTotpSecret(email) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: 'Faktorizm',
    issuer: `فاکتوریزم (${email})`,
  });
  return { secret: secret.base32, otpauthUrl: secret.otpauth_url };
}

export function verifyTotpToken(secret, token) {
  if (!secret || !token) return false;
  const clean = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  return speakeasy.totp.verify({
    secret, encoding: 'base32', token: clean, window: 1,
  });
}

/* ---------- نقش‌ها و دسترسی‌ها ---------- */
export const ROLE_PERMISSIONS = {
  owner: ['*'],
  admin: [
    'invoice.read', 'invoice.write', 'invoice.delete',
    'contact.read', 'contact.write', 'product.read', 'product.write',
    'report.read', 'export', 'sync',
    'user.read', 'user.write', 'ticket.read', 'ticket.reply',
    'license.read', 'license.generate', 'audit.read',
  ],
  accountant: [
    'invoice.read', 'invoice.write', 'invoice.delete',
    'contact.read', 'contact.write', 'product.read', 'product.write',
    'report.read', 'export', 'sync', 'ticket.read', 'ticket.reply',
  ],
  operator: [
    'invoice.read', 'invoice.write', 'contact.read', 'product.read',
    'sync', 'ticket.read',
  ],
  viewer: ['invoice.read', 'contact.read', 'product.read', 'report.read', 'ticket.read'],
};

export function can(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}
