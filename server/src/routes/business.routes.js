import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requirePermission, requireActiveSubscription } from '../middleware/index.js';
import { uid } from '../services/security.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authenticate, requireActiveSubscription);

// passthrough لازم است تا کل بدنه فاکتور/کالا هنگام همگام‌سازی دست‌نخورده بماند
const syncSchema = z.object({
  items: z.array(z.object({ id: z.string().min(2) }).passthrough()).min(1).max(1000),
});

function makeResource(table, readPerm, writePerm, titleField) {
  const sub = Router();

  sub.get('/', requirePermission(readPerm), async (req, res, next) => {
    try {
      const rows = await db().findMany(table, { where: { workspace_id: req.user.workspaceId }, limit: 2000 });
      res.json({ success: true, data: rows.map((r) => r.payload) });
    } catch (e) { next(e); }
  });

  sub.post('/bulk-sync', requirePermission(writePerm), async (req, res, next) => {
    try {
      const { items } = syncSchema.parse(req.body);
      let created = 0; let updated = 0;
      for (const item of items) {
        const exists = await db().findOne(table, { id: item.id, workspace_id: req.user.workspaceId });
        const now = new Date().toISOString();
        if (exists) {
          await db().updateById(table, exists.id, {
            payload: item, ...(titleField ? { [titleField]: String(item[titleField] ?? '').slice(0, 200) } : {}),
            updated_at: now,
          });
          updated += 1;
        } else {
          await db().insert(table, {
            id: item.id, workspace_id: req.user.workspaceId,
            ...(table === 'invoices'
              ? { number: String(item.number ?? '').slice(0, 60), status: String(item.status ?? 'draft'), total: Number(item.total) || 0, doc_date: String(item.date ?? ''), deleted_at: item.deletedAt ? now : null }
              : { [titleField ?? 'title']: String(item[titleField ?? 'title'] ?? '').slice(0, 200) }),
            payload: item, created_at: now, updated_at: now,
          });
          created += 1;
        }
      }
      await audit('sync.push', req, { table, created, updated });
      res.json({ success: true, data: { created, updated, total: items.length } });
    } catch (e) { next(e); }
  });

  sub.delete('/:id', requirePermission(writePerm), async (req, res, next) => {
    try {
      const removed = await db().deleteWhere(table, { id: req.params.id, workspace_id: req.user.workspaceId });
      if (!removed) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
      await audit('record.deleted', req, { table, id: req.params.id });
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  return sub;
}

router.use('/invoices', makeResource('invoices', 'invoice.read', 'invoice.write', 'number'));
router.use('/contacts', makeResource('contacts', 'contact.read', 'contact.write', 'name'));
router.use('/products', makeResource('products', 'product.read', 'product.write', 'title'));

/* ---------- آمار سازمانی ---------- */
router.get('/stats', requirePermission('report.read'), async (req, res, next) => {
  try {
    const [invoices, contacts, products] = await Promise.all([
      db().findMany('invoices', { where: { workspace_id: req.user.workspaceId, deleted_at: null } }),
      db().count('contacts', { workspace_id: req.user.workspaceId }),
      db().count('products', { workspace_id: req.user.workspaceId }),
    ]);
    const data = {
      invoices: invoices.length,
      contacts,
      products,
      totalAmount: invoices.reduce((s, r) => s + (Number(r.total) || 0), 0),
      pendingReview: invoices.filter((r) => r.status === 'review').length,
    };
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export const resourceMeta = { uid };
export default router;
