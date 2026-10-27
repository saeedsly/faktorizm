import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { uid, sha256 } from './security.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف مبهم O/0/I/1

export function generateCode() {
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `FKM-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}`;
}

export async function listPlans() {
  return db().findMany('plans', { orderBy: [['sort_order', 'ASC']] });
}

/** تولید دسته‌ای کد اشتراک توسط مدیر سامانه */
export async function generateLicenseBatch(planId, count) {
  const plan = await db().findOne('plans', { id: planId });
  if (!plan) throw Object.assign(new Error('پلن پیدا نشد'), { status: 404 });
  const batchId = uid('bat_');
  const created = [];
  for (let i = 0; i < count; i++) {
    const code = generateCode();
    const row = {
      id: uid('lic_'), workspace_id: null, plan_id: plan.id, batch_id: batchId,
      code_hash: sha256(code), code_last4: code.slice(-4), duration_days: plan.duration_days,
      status: 'unused', redeemed_by: null, redeemed_at: null, expires_at: null,
      created_at: new Date().toISOString(),
    };
    await db().insert('licenses', row);
    // متن خام کد فقط همین یک بار برای خروجی CSV برمی‌گردد
    created.push({ code, ...row });
  }
  return { batchId, items: created };
}

/** اعمال کد اشتراک روی سازمان و محاسبه خودکار تاریخ انقضا */
export async function redeemLicense(workspaceId, userId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^FKM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    throw Object.assign(new Error('قالب کد اشتراک معتبر نیست'), { status: 422 });
  }
  const license = await db().findOne('licenses', { code_hash: sha256(code) });
  if (!license) throw Object.assign(new Error('کد اشتراک در سامانه ثبت نشده است'), { status: 404 });
  if (license.status === 'revoked') throw Object.assign(new Error('این کد باطل شده است'), { status: 403 });
  if (license.status === 'redeemed') throw Object.assign(new Error('این کد قبلا استفاده شده است'), { status: 409 });

  const now = new Date();
  const workspace = await db().findOne('workspaces', { id: workspaceId });
  const base = workspace?.license_expires_at && new Date(workspace.license_expires_at) > now
    ? new Date(workspace.license_expires_at)
    : now;
  const expiresAt = new Date(base.getTime() + license.duration_days * 86400000);

  // شرط اتمیک: فقط اگر هنوز unused باشد آپدیت شود
  const changed = await db().updateWhere('licenses',
    { id: license.id, status: 'unused' },
    { status: 'redeemed', workspace_id: workspaceId, redeemed_by: userId, redeemed_at: now.toISOString(), expires_at: expiresAt.toISOString() });
  if (!changed) throw Object.assign(new Error('این کد همزمان توسط کاربر دیگری مصرف شد'), { status: 409 });

  await db().updateById('workspaces', workspaceId, { license_expires_at: expiresAt.toISOString() });
  return { expiresAt: expiresAt.toISOString(), durationDays: license.duration_days, planId: license.plan_id };
}

export async function getSubscription(workspaceId, trialEndsAt) {
  const workspace = await db().findOne('workspaces', { id: workspaceId });
  const now = new Date();
  const licenseExpiry = workspace?.license_expires_at ? new Date(workspace.license_expires_at) : null;
  const trialExpiry = trialEndsAt ? new Date(trialEndsAt) : null;
  const effectiveExpiry = [licenseExpiry, trialExpiry].filter(Boolean).sort((a, b) => b - a)[0] || null;
  const active = !!effectiveExpiry && effectiveExpiry > now;
  const daysLeft = effectiveExpiry
    ? Math.max(0, Math.ceil((effectiveExpiry.getTime() - now.getTime()) / 86400000))
    : 0;
  return {
    active,
    source: licenseExpiry && licenseExpiry > now ? 'license' : (trialExpiry && trialExpiry > now ? 'trial' : 'expired'),
    expiresAt: effectiveExpiry?.toISOString() || null,
    daysLeft,
    licenseExpiresAt: licenseExpiry?.toISOString() || null,
    trialExpiresAt: trialExpiry?.toISOString() || null,
  };
}
