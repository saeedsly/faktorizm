import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requirePermission } from '../middleware/index.js';
import { uid } from '../services/security.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(4000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
const patchSchema = z.object({
  status: z.enum(['open', 'answered', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assigned_to: z.string().max(40).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const where = { workspace_id: req.user.workspaceId };
    if (req.query.status) where.status = String(req.query.status);
    const tickets = await db().findMany('tickets', { where, orderBy: [['updated_at', 'DESC']], limit: 200 });
    res.json({ success: true, data: tickets });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const now = new Date().toISOString();
    const ticket = {
      id: uid('tkt_'), workspace_id: req.user.workspaceId, subject: data.subject,
      priority: data.priority, status: 'open', created_by: req.user.id,
      assigned_to: null, created_at: now, updated_at: now,
    };
    await db().insert('tickets', ticket);
    await db().insert('ticket_messages', {
      id: uid('tkm_'), ticket_id: ticket.id, author_id: req.user.id,
      body: data.body, created_at: now,
    });
    await audit('ticket.created', req, { ticket: ticket.id });
    res.status(201).json({ success: true, data: ticket });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await db().findOne('tickets', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'تیکت یافت نشد' } });
    const messages = await db().findMany('ticket_messages', { where: { ticket_id: ticket.id }, orderBy: [['created_at', 'ASC']] });
    const users = await db().findMany('users', { where: { workspace_id: req.user.workspaceId } });
    const authorMap = new Map(users.map((u) => [u.id, u.name]));
    res.json({
      success: true,
      data: { ...ticket, messages: messages.map((m) => ({ ...m, author_name: authorMap.get(m.author_id) || 'کاربر' })) },
    });
  } catch (e) { next(e); }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const { body } = messageSchema.parse(req.body);
    const ticket = await db().findOne('tickets', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    if (ticket.status === 'closed') return res.status(400).json({ success: false, error: { code: 'TICKET_CLOSED', message: 'تیکت بسته شده است' } });
    const now = new Date().toISOString();
    const message = { id: uid('tkm_'), ticket_id: ticket.id, author_id: req.user.id, body, created_at: now };
    await db().insert('ticket_messages', message);
    const isSupport = ['owner', 'admin'].includes(req.user.role);
    await db().updateById('tickets', ticket.id, { status: isSupport ? 'answered' : 'open', updated_at: now });
    await audit('ticket.replied', req, { ticket: ticket.id });
    res.status(201).json({ success: true, data: message });
  } catch (e) { next(e); }
});

router.patch('/:id', requirePermission('ticket.reply'), async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body);
    const ticket = await db().findOne('tickets', { id: req.params.id, workspace_id: req.user.workspaceId });
    if (!ticket) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    await db().updateById('tickets', ticket.id, { ...patch, updated_at: new Date().toISOString() });
    await audit('ticket.updated', req, { ticket: ticket.id, patch });
    res.json({ success: true, data: await db().findOne('tickets', { id: ticket.id }) });
  } catch (e) { next(e); }
});

export default router;
