import { db } from './db';
import { uid } from './utils';
import type { Activity } from './types';

export async function logActivity(
  action: string,
  entity: Activity['entity'],
  detail: string,
  entityId?: string,
): Promise<void> {
  try {
    await db.activities.add({
      id: uid('act_'),
      at: new Date().toISOString(),
      action,
      entity,
      detail,
      entityId,
    });
    // نگهداری حداکثر ۵۰۰ رخداد
    const count = await db.activities.count();
    if (count > 500) {
      const old = await db.activities.orderBy('at').limit(count - 500).primaryKeys();
      await db.activities.bulkDelete(old);
    }
  } catch {
    /* لاگ نباید جریان کار را مختل کند */
  }
}
