import { Router } from 'express';
import { db } from '../db/index.js';
import { authenticate, requirePermission } from '../middleware/index.js';

const router = Router();
router.use(authenticate, requirePermission('audit.read'));

router.get('/', async (req, res, next) => {
  try {
    const where = { workspace_id: req.user.workspaceId };
    if (typeof req.query.event === 'string' && req.query.event) where.event = req.query.event;
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const rows = await db().findMany('audit_logs', { where, orderBy: [['created_at', 'DESC']], limit });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

export default router;
