import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requirePermission } from '../middleware/index.js';
import { listPlans, generateLicenseBatch, redeemLicense, getSubscription } from '../services/license.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate);

const genSchema = z.object({
  planId: z.string().min(3),
  count: z.number().int().min(1).max(500),
});
const redeemSchema = z.object({ code: z.string().trim().min(10).max(60) });

router.get('/plans', async (_req, res, next) => {
  try { res.json({ success: true, data: await listPlans() }); } catch (e) { next(e); }
});

router.get('/subscription', async (req, res, next) => {
  try {
    const workspace = await db().findOne('workspaces', { id: req.user.workspaceId });
    const sub = await getSubscription(req.user.workspaceId, workspace?.trial_ends_at);
    res.json({ success: true, data: sub });
  } catch (e) { next(e); }
});

router.post('/subscription/redeem', validateShim(), async (req, res, next) => {
  try {
    const parsed = redeemSchema.parse(req.body);
    const result = await redeemLicense(req.user.workspaceId, req.user.id, parsed.code);
    await audit('license.redeemed', req, { planId: result.planId, days: result.durationDays });
    const workspace = await db().findOne('workspaces', { id: req.user.workspaceId });
    res.json({ success: true, data: { ...result, subscription: await getSubscription(req.user.workspaceId, workspace?.trial_ends_at) } });
  } catch (e) { next(e); }
});

router.get('/licenses', requirePermission('license.read'), async (req, res, next) => {
  try {
    const status = req.query.status;
    const where = {};
    if (status === 'unused' || status === 'redeemed' || status === 'revoked') where.status = status;
    const rows = await db().findMany('licenses', { where, orderBy: [['created_at', 'DESC']], limit: 500 });
    res.json({ success: true, data: rows.map((r) => ({ ...r, code_hash: undefined })) });
  } catch (e) { next(e); }
});

router.post('/licenses/generate', requirePermission('license.generate'), async (req, res, next) => {
  try {
    const { planId, count } = genSchema.parse(req.body);
    const result = await generateLicenseBatch(planId, count);
    await audit('license.batch_generated', req, { planId, count, batchId: result.batchId });
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/licenses/:id/revoke', requirePermission('license.generate'), async (req, res, next) => {
  try {
    const lic = await db().findOne('licenses', { id: req.params.id });
    if (!lic) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    await db().updateById('licenses', lic.id, { status: 'revoked' });
    await audit('license.revoked', req, { id: lic.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

function validateShim() { return (req, _res, next) => { try { redeemSchema.parse(req.body); next(); } catch (e) { next(e); } }; }

export default router;
