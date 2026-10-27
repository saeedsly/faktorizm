import { db } from './db';
import { api, ApiError } from './api/client';
import { logActivity } from './activity';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';
let status: SyncStatus = 'idle';
const listeners = new Set<(s: SyncStatus, message?: string) => void>();
let lastMessage = '';
let timer: ReturnType<typeof setInterval> | null = null;

export function onSyncChange(fn: (s: SyncStatus, message?: string) => void) {
  listeners.add(fn);
  fn(status, lastMessage);
  return () => listeners.delete(fn);
}

function setStatus(s: SyncStatus, message = '') {
  status = s;
  lastMessage = message;
  listeners.forEach((fn) => fn(s, message));
}

async function chunk<T>(arr: T[], size: number): Promise<T[][]> {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}

type AnyTable = { toArray: () => Promise<Record<string, unknown>[]>; bulkPut: (rows: Record<string, unknown>[]) => Promise<unknown> };

async function pushTable(localTable: 'invoices' | 'contacts' | 'products', remote: string) {
  const table = db[localTable] as unknown as AnyTable;
  const rows = await table.toArray();
  const batches = await chunk(rows, 200);
  let pushed = 0;
  for (const items of batches) {
    const res = await api.post(`/business/${remote}/bulk-sync`, { items }) as { created: number; updated: number };
    pushed += res.created + res.updated;
  }
  return pushed;
}

async function pullTable(localTable: 'invoices' | 'contacts' | 'products', remote: string) {
  const rows = await api.get(`/business/${remote}`) as Record<string, unknown>[];
  if (rows.length) await (db[localTable] as unknown as AnyTable).bulkPut(rows);
  return rows.length;
}

export async function fullSync(silent = false) {
  if (status === 'syncing') return;
  setStatus('syncing');
  try {
    const maps = [
      ['invoices', 'invoices'],
      ['contacts', 'contacts'],
      ['products', 'products'],
    ] as const;
    const result: string[] = [];
    for (const [local, remote] of maps) {
      const pushed = await pushTable(local, remote);
      const pulled = await pullTable(local, remote);
      result.push(`${pushed} ارسال / ${pulled} دریافت`);
    }
    const message = result.join(' · ');
    setStatus('ok', message);
    if (!silent) await logActivity('همگام‌سازی ابری', 'system', `همگام‌سازی موفق: ${message}`);
  } catch (err) {
    const e = err as ApiError;
    setStatus('error', e.message);
    if (!silent) throw err;
  }
}

export function startAutoSync() {
  if (timer) return;
  void fullSync(true);
  timer = setInterval(() => void fullSync(true), 60_000);
}

export function stopAutoSync() {
  if (timer) clearInterval(timer);
  timer = null;
}
