import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'faktorizm-api', time: new Date().toISOString() } });
});

router.get('/health/ready', async (_req, res) => {
  try {
    await db().ping();
    res.json({ success: true, data: { database: 'ready' } });
  } catch (e) {
    res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: e.message } });
  }
});

export default router;
