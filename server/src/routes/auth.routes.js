import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { audit } from '../services/audit.js';
import {
  hashPassword, verifyPassword, validatePasswordPolicy,
  signAccessToken, verifyAccessToken, randomToken, sha256, uid,
  generateTotpSecret, verifyTotpToken,
} from '../services/security.js';

const router = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeText = z.string().trim().min(1).max(180);

const registerSchema = z.object({
  name: safeText,
  email: z.string().trim().toLowerCase().regex(emailRe, 'ایمیل معتبر نیست'),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({
  email: safeText.toLowerCase(),
  password: z.string().min(1).max(128),
});
const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
const resetSchema = z.object({ email: safeText.toLowerCase() });
const doResetSchema = z.object({ token: z.string().min(20), newPassword: z.string().min(8).max(128) });
const twoFaSchema = z.object({ challenge: z.string(), code: z.string().regex(/^\d{6}$/, 'کد باید ۶ رقم باشد') });

function publicUser(u) {
  if (!u) return null;
  const { password_hash, totp_secret, failed_attempts, locked_until, ...safe } = u;
  return safe;
}

async function issueTokens(user, req) {
  const refresh = randomToken();
  const familyId = uid('fam_');
  await db().insert('refresh_tokens', {
    id: uid('rt_'), user_id: user.id, family_id: familyId,
    token_hash: sha256(refresh), user_agent: String(req.headers['user-agent'] || '').slice(0, 240),
    expires_at: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000).toISOString(),
    revoked_at: null, last_used_at: null, created_at: new Date().toISOString(),
  });
  return { accessToken: signAccessToken(user), refreshToken: refresh, familyId };
}

async function rotateRefresh(rawToken) {
  const stored = await db().findOne('refresh_tokens', { token_hash: sha256(rawToken) });
  if (!stored) throw Object.assign(new Error('توکن بازیابی نامعتبر است'), { status: 401 });
  if (stored.revoked_at) {
    // تشخیص استفاده مجدد از توکن باطل‌شده → ابطال کل خانواده توکن
    await db().updateWhere('refresh_tokens', { family_id: stored.family_id }, { revoked_at: new Date().toISOString() });
    throw Object.assign(new Error('نشانه بازاستفاده‌شده؛ همه جلسات باطل شد'), { status: 401 });
  }
  if (new Date(stored.expires_at) < new Date()) {
    throw Object.assign(new Error('توکن بازیابی منقضی شده است'), { status: 401 });
  }
  const user = await db().findOne('users', { id: stored.user_id });
  if (!user || user.suspended) throw Object.assign(new Error('حساب در دسترس نیست'), { status: 403 });

  await db().updateById('refresh_tokens', stored.id, { revoked_at: new Date().toISOString(), last_used_at: new Date().toISOString() });
  const next = randomToken();
  await db().insert('refresh_tokens', {
    id: uid('rt_'), user_id: user.id, family_id: stored.family_id,
    token_hash: sha256(next), user_agent: stored.user_agent,
    expires_at: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000).toISOString(),
    revoked_at: null, last_used_at: null, created_at: new Date().toISOString(),
  });
  return { accessToken: signAccessToken(user), refreshToken: next, user };
}

/* ---------- ثبت‌نام (سازنده سازمان، نقش owner + دوره آزمایشی) ---------- */
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const policyErrors = validatePasswordPolicy(data.password, data.email);
    if (policyErrors.length) return res.status(422).json({ success: false, error: { code: 'WEAK_PASSWORD', message: policyErrors.join('؛ ') } });
    const existing = await db().findOne('users', { email: data.email });
    if (existing) return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'این ایمیل قبلا ثبت شده است' } });

    const now = new Date();
    const workspaceId = uid('ws_');
    await db().insert('workspaces', {
      id: workspaceId, name: `سازمان ${data.name}`,
      license_expires_at: null,
      trial_ends_at: new Date(now.getTime() + config.trialDays * 86400000).toISOString(),
      created_at: now.toISOString(),
    });
    const user = {
      id: uid('usr_'), workspace_id: workspaceId, name: data.name, email: data.email,
      phone: data.phone || null, password_hash: await hashPassword(data.password),
      role: 'owner', totp_secret: null, totp_enabled: 0, failed_attempts: 0,
      locked_until: null, suspended: 0, must_change_password: 0,
      created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    await db().insert('users', user);
    await audit('auth.register', { ...req, user: { id: user.id, workspace_id: workspaceId } }, { email: data.email });
    const tokens = await issueTokens(user, req);
    res.status(201).json({ success: true, data: { user: publicUser(user), ...tokens, trialDays: config.trialDays } });
  } catch (e) { next(e); }
});

/* ---------- ورود با قفل خودکار حساب ---------- */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await db().findOne('users', { email });
    const now = new Date();
    if (!user) {
      await audit('auth.login.unknown_email', req, { email });
      return res.status(401).json({ success: false, error: { code: 'BAD_CREDENTIALS', message: 'ایمیل یا رمز عبور اشتباه است' } });
    }
    if (user.locked_until && new Date(user.locked_until) > now) {
      await audit('auth.login.locked', req, { userId: user.id });
      return res.status(423).json({ success: false, error: { code: 'ACCOUNT_LOCKED', message: `حساب تا ${user.locked_until} قفل است` } });
    }
    if (user.suspended) return res.status(403).json({ success: false, error: { code: 'SUSPENDED', message: 'حساب کاربری شما تعلیق شده است' } });

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const failed = user.failed_attempts + 1;
      const patch = { failed_attempts: failed };
      if (failed >= config.maxLoginFailures) {
        patch.locked_until = new Date(now.getTime() + config.lockMinutes * 60000).toISOString();
        patch.failed_attempts = 0;
      }
      await db().updateById('users', user.id, patch);
      await audit('auth.login.failed', req, { userId: user.id, attempts: failed });
      return res.status(401).json({
        success: false,
        error: { code: 'BAD_CREDENTIALS', message: failed >= config.maxLoginFailures
          ? `تعداد تلاش ناموفق زیاد شد؛ حساب ${config.lockMinutes} دقیقه قفل شد`
          : 'ایمیل یا رمز عبور اشتباه است' },
      });
    }

    await db().updateById('users', user.id, { failed_attempts: 0, locked_until: null });
    await audit('auth.login.success', req, { userId: user.id });
    if (user.totp_enabled) {
      const challenge = signAccessToken({ id: user.id, workspace_id: user.workspace_id, role: user.role, purpose: '2fa' });
      return res.json({ success: true, data: { twoFactorRequired: true, challenge } });
    }
    const tokens = await issueTokens(user, req);
    res.json({ success: true, data: { user: publicUser(user), ...tokens } });
  } catch (e) { next(e); }
});

/* ---------- تایید کد دو عاملی ---------- */
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { challenge, code } = twoFaSchema.parse(req.body);
    let payload;
    try { payload = verifyAccessToken(challenge); } catch {
      return res.status(401).json({ success: false, error: { code: 'CHALLENGE_INVALID', message: 'نشانه دو عاملی نامعتبر است' } });
    }
    if (payload.purpose !== '2fa') return res.status(401).json({ success: false, error: { code: 'CHALLENGE_INVALID', message: 'نشانه نامعتبر است' } });
    const user = await db().findOne('users', { id: payload.sub });
    if (!user || !user.totp_enabled) return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'کاربر یافت نشد' } });
    if (!verifyTotpToken(user.totp_secret, code)) {
      await audit('auth.2fa.failed', req, { userId: user.id });
      return res.status(401).json({ success: false, error: { code: 'TOTP_INVALID', message: 'کد تایید اشتباه است' } });
    }
    await audit('auth.2fa.success', req, { userId: user.id });
    const tokens = await issueTokens(user, req);
    res.json({ success: true, data: { user: publicUser(user), ...tokens } });
  } catch (e) { next(e); }
});

/* ---------- تمدید توکن با چرخش و تشخیص بازاستفاده ---------- */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20) }).parse(req.body);
    const result = await rotateRefresh(refreshToken);
    res.json({ success: true, data: { accessToken: result.accessToken, refreshToken: result.refreshToken, user: publicUser(result.user) } });
  } catch (e) { next(e); }
});

router.post('/logout', authenticateShim, async (req, res) => {
  const raw = req.body?.refreshToken;
  if (raw) await db().deleteWhere('refresh_tokens', { token_hash: sha256(raw) });
  res.json({ success: true });
});

/* ---------- اطلاعات کاربر جاری + وضعیت اشتراک ---------- */
router.get('/me', async (req, res, next) => {
  try {
    const user = await loadUserFromHeader(req);
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'احراز هویت نشده' } });
    const workspace = await db().findOne('workspaces', { id: user.workspace_id });
    const { getSubscription } = await import('../services/license.js');
    const subscription = await getSubscription(user.workspace_id, workspace?.trial_ends_at);
    res.json({ success: true, data: { user: publicUser(user), subscription } });
  } catch (e) { next(e); }
});

/* ---------- تغییر رمز ---------- */
router.post('/change-password', async (req, res, next) => {
  try {
    const user = await loadUserFromHeader(req);
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED' } });
    const { currentPassword, newPassword } = changeSchema.parse(req.body);
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ success: false, error: { code: 'BAD_CREDENTIALS', message: 'رمز فعلی اشتباه است' } });
    }
    const errors = validatePasswordPolicy(newPassword, user.email);
    if (errors.length) return res.status(422).json({ success: false, error: { code: 'WEAK_PASSWORD', message: errors.join('؛ ') } });
    await db().updateById('users', user.id, { password_hash: await hashPassword(newPassword), must_change_password: 0 });
    await db().updateWhere('refresh_tokens', { user_id: user.id }, { revoked_at: new Date().toISOString() });
    await audit('auth.password.changed', req, { userId: user.id });
    res.json({ success: true, data: { message: 'رمز تغییر کرد؛ دوباره وارد شوید' } });
  } catch (e) { next(e); }
});

/* ---------- فراموشی رمز / بازنشانی ---------- */
router.post('/forgot-password', async (req, res) => {
  const { email } = resetSchema.parse(req.body);
  const user = await db().findOne('users', { email });
  // همیشه پاسخ یکسان تا وجود کاربر فاش نشود
  if (user) {
    const token = randomToken(32);
    await db().insert('password_resets', {
      id: uid('pr_'), user_id: user.id, token_hash: sha256(token),
      expires_at: new Date(Date.now() + 30 * 60000).toISOString(), used_at: null,
      created_at: new Date().toISOString(),
    });
    await audit('auth.password.reset_requested', req, { userId: user.id });
    // در محیط واقعی ایمیل ارسال می‌شود؛ در نسخه خودمیزبان توکن در لاگ سرور
    console.log(`[reset-token] ${email} → ${token}`);
  }
  res.json({ success: true, data: { message: 'اگر ایمیل معتبر باشد، لینک بازنشانی ارسال می‌شود' } });
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = doResetSchema.parse(req.body);
    const errors = validatePasswordPolicy(newPassword);
    if (errors.length) return res.status(422).json({ success: false, error: { code: 'WEAK_PASSWORD', message: errors.join('؛ ') } });
    const record = await db().findOne('password_resets', { token_hash: sha256(token) });
    if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'توکن نامعتبر یا منقضی است' } });
    }
    await db().updateById('password_resets', record.id, { used_at: new Date().toISOString() });
    await db().updateById('users', record.user_id, { password_hash: await hashPassword(newPassword) });
    await db().updateWhere('refresh_tokens', { user_id: record.user_id }, { revoked_at: new Date().toISOString() });
    res.json({ success: true, data: { message: 'رمز عبور با موفقیت بازنشانی شد' } });
  } catch (e) { next(e); }
});

/* ---------- تنظیم و فعال‌سازی دو عاملی ---------- */
router.post('/2fa/setup', async (req, res, next) => {
  try {
    const user = await loadUserFromHeader(req);
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED' } });
    const { secret, otpauthUrl } = generateTotpSecret(user.email);
    await db().updateById('users', user.id, { totp_secret: secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ success: true, data: { secret, otpauthUrl, qrDataUrl } });
  } catch (e) { next(e); }
});

router.post('/2fa/enable', async (req, res, next) => {
  try {
    const user = await loadUserFromHeader(req);
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED' } });
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    if (!verifyTotpToken(user.totp_secret, code)) {
      return res.status(400).json({ success: false, error: { code: 'TOTP_INVALID', message: 'کد تایید اشتباه است' } });
    }
    await db().updateById('users', user.id, { totp_enabled: 1 });
    await audit('auth.2fa.enabled', req, { userId: user.id });
    res.json({ success: true, data: { enabled: true } });
  } catch (e) { next(e); }
});

router.delete('/2fa', async (req, res, next) => {
  try {
    const user = await loadUserFromHeader(req);
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED' } });
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    if (!verifyTotpToken(user.totp_secret, code)) {
      return res.status(400).json({ success: false, error: { code: 'TOTP_INVALID', message: 'کد تایید اشتباه است' } });
    }
    await db().updateById('users', user.id, { totp_enabled: 0, totp_secret: null });
    await audit('auth.2fa.disabled', req, { userId: user.id });
    res.json({ success: true, data: { enabled: false } });
  } catch (e) { next(e); }
});

/* ---------- توابع داخلی ---------- */
async function loadUserFromHeader(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await db().findOne('users', { id: payload.sub });
    if (!user || user.suspended) return null;
    req.user = { id: user.id, workspace_id: user.workspace_id, role: user.role };
    return user;
  } catch { return null; }
}

function authenticateShim(req, _res, next) { next(); }

export default router;
