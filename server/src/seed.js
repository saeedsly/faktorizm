import { db } from './db/index.js';
import { uid, hashPassword } from './services/security.js';
import { generateLicenseBatch } from './services/license.js';

const DEFAULT_PLANS = [
  { code: 'monthly', name: 'اشتراک ماهانه', duration_days: 30, price_toman: 299000, sort_order: 1 },
  { code: 'quarterly', name: 'اشتراک فصلی', duration_days: 90, price_toman: 799000, sort_order: 2 },
  { code: 'annual', name: 'اشتراک سالانه', duration_days: 365, price_toman: 2690000, sort_order: 3 },
];

export async function seed() {
  // پلن‌های اشتراک
  const existingPlans = await db().count('plans');
  if (!existingPlans) {
    for (const p of DEFAULT_PLANS) {
      await db().insert('plans', { id: uid('pln_'), ...p });
    }
    console.log('[seed] پلن‌های اشتراک ساخته شدند');
  }

  // حساب مدیر اولیه از متغیرهای محیطی (تولید)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const exists = await db().findOne('users', { email: process.env.ADMIN_EMAIL.toLowerCase() });
    if (!exists) {
      const now = new Date().toISOString();
      const wsId = uid('ws_');
      await db().insert('workspaces', {
        id: wsId, name: 'سازمان مرکزی', license_expires_at: null,
        trial_ends_at: new Date(Date.now() + 365 * 86400000).toISOString(), created_at: now,
      });
      await db().insert('users', {
        id: uid('usr_'), workspace_id: wsId, name: 'مدیر سامانه',
        email: process.env.ADMIN_EMAIL.toLowerCase(), phone: null,
        password_hash: await hashPassword(process.env.ADMIN_PASSWORD),
        role: 'owner', totp_secret: null, totp_enabled: 0, failed_attempts: 0,
        locked_until: null, suspended: 0, must_change_password: 1,
        created_at: now, updated_at: now,
      });
      console.log('[seed] حساب مدیر اولیه ساخته شد');
    }
  }

  // چند کد اشتراک نمونه برای شروع کار (فقط در نبود هیچ کدی)
  const licenseCount = await db().count('licenses');
  if (!licenseCount) {
    const plan = await db().findOne('plans', { code: 'monthly' });
    const batch = await generateLicenseBatch(plan.id, 5);
    console.log('[seed] پنج کد اشتراک نمونه ساخته شد:');
    for (const item of batch.items) console.log(`  ${item.code}`);
  }
}
