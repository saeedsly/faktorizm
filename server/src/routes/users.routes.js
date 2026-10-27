import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requirePermission, validate } from '../middleware/index.js';
import { hashPassword, validatePasswordPolicy, uid } from '../services/security.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  role: z.enum(['admin', 'accountant', 'operator', 'viewer']),
  password: z.string().min(8).max(128),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['admin', 'accountant', 'operator', 'viewer']).optional(),
  suspended: z.boolean().optional(),
});

function safe(u) {
  if (!u) return null;
  const { password_hash, totp_secret, ...rest } = u;
  return rest;
}

router.get('/', requirePermission('user.read'), async (req, res, next) => {
  try {
    const users = await db().findMany('users',
      { where: { workspace_id: req.user.workspaceId }, orderBy: [['created_at', 'DESC']] });
    res.json({ success: true, data: users.map(safe) });
  } catch (e) { next(e); }
});

router.post('/', requirePermission('user.write'), validate(createSchema), async (req, res, next) => {
  try {
    const errors = validatePasswordPolicy(req.body.password, req.body.email);
    if (errors.length) return res.status(422).json({ success: false, error: { code: 'WEAK_PASSWORD', message: errors.join('؛ ') } });
    const exists = await db().findOne('users', { email: req.body.email });
    if (exists) return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'این ایمیل قبلا ثبت شده است' } });
    const now = new Date().toISOString();
    const user = {
      id: uid('usr_'), workspace_id: req.user.workspaceId, name: req.body.name, email: req.body.email,
      phone: req.body.phone || null, password_hash: await hashPassword(req.body.password),
      role: req.body.role, totp_secret: null, totp_enabled: 0, failed_attempts: 0,
      locked_until: null, suspended: 0, must_change_password: 1,
      created_at: now, updated_at: now,
    };
    await db().insert('users', user);
    await audit('user.created', req, { target: user.email, role: user.role });
    res.status(201).json({ success: true, data: safe(user) });
  } catch (e) { next(e); }
});

router.patch('/:id', requirePermission('user.write'), validate(updateSchema), async (req, res, next) => {
  try {
    const target = await db().findOne('users', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'کاربر یافت نشد' } });
    if (target.role === 'owner' && req.body.role) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'نقش مالک سازمان قابل تغییر نیست' } });
    }
    await db().updateById('users', target.id, {
      ...(req.body.name ? { name: req.body.name } : {}),
      ...(req.body.role ? { role: req.body.role } : {}),
      ...(typeof req.body.suspended === 'boolean' ? { suspended: req.body.suspended ? 1 : 0 } : {}),
      updated_at: new Date().toISOString(),
    });
    await audit('user.updated', req, { target: target.id, changes: req.body });
    res.json({ success: true, data: safe(await db().findOne('users', { id: target.id })) });
  } catch (e) { next(e); }
});

router.post('/:id/unlock', requirePermission('user.write'), async (req, res, next) => {
  try {
    const target = await db().findOne('users', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    await db().updateById('users', target.id, { failed_attempts: 0, locked_until: null });
    await audit('user.unlocked', req, { target: target.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('user.write'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: { code: 'SELF_DELETE', message: 'نمی‌توانید حساب خودتان را حذف کنید' } });
    }
    const target = await db().findOne('users', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    if (target.role === 'owner') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'حساب مالک قابل حذف نیست' } });
    await db().deleteWhere('users', { id: target.id });
    await audit('user.deleted', req, { target: target.email });
    res.json({ success: true });
  } catch (e) { next(e); }
});

/* ---------- جلسات فعال ---------- */
router.get('/me/sessions', authenticate, async (req, res, next) => {
  try {
    const rows = await db().findMany('refresh_tokens',
      { where: { user_id: req.user.id, revoked_at: null }, orderBy: [['last_used_at', 'DESC']] });
    res.json({ success: true, data: rows.map((r) => ({ id: r.id, userAgent: r.user_agent, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, createdAt: r.created_at })) });
  } catch (e) { next(e); }
});

router.delete('/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const removed = await db().deleteWhere('refresh_tokens', { id: req.params.sessionId, user_id: req.user.id });
    if (!removed) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    await audit('session.revoked', req, { session: req.params.sessionId });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/:id/revoke-sessions', requirePermission('user.write'), async (req, res, next) => {
  try {
    const target = await db().findOne('users', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    await db().updateWhere('refresh_tokens', { user_id: target.id, revoked_at: null }, { revoked_at: new Date().toISOString() });
    await audit('user.sessions_revoked', req, { target: target.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
