import { db } from '../db/index.js';
import { uid } from './security.js';

export async function audit(event, req, meta = {}) {
  try {
    await db().insert('audit_logs', {
      id: uid('aud_'),
      workspace_id: req.user?.workspace_id || meta.workspaceId || null,
      user_id: req.user?.id || meta.userId || null,
      event,
      ip: req.ip || null,
      meta: JSON.stringify(meta).length > 4000 ? { truncated: true } : meta,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* لاگ هرگز نباید جریان درخواست را بشکند */
  }
}
