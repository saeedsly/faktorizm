import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES } from './columns.js';

/**
 * درایور حافظه با همان قرارداد درایور MySQL — مناسب توسعه، تست و محیط‌هایی
 * که سرور MySQL در دسترس نیست. داده‌ها به‌صورت JSON روی دیسک پایدار می‌شوند.
 */
export class MemoryDriver {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = join(dataDir, 'server.json');
    this.tables = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]));
    this._saveTimer = null;
    this._load();
  }

  async init() {
    mkdirSync(this.dataDir, { recursive: true });
    this._persist();
  }

  _load() {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8'));
        for (const t of Object.keys(this.tables)) {
          if (Array.isArray(raw[t])) this.tables[t] = raw[t];
        }
      }
    } catch {
      /* فایل خراب باشد با حافظه خالی ادامه می‌دهیم */
    }
  }

  _persist() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        mkdirSync(this.dataDir, { recursive: true });
        writeFileSync(this.file, JSON.stringify(this.tables));
      } catch (e) {
        console.error('[memory-driver] خطای ذخیره‌سازی:', e.message);
      }
    }, 150);
  }

  async ping() { return true; }

  async insert(table, row) {
    this._assertTable(table);
    const record = { ...row };
    this.tables[table].push(record);
    this._persist();
    return record;
  }

  async bulkInsert(table, rows) {
    this._assertTable(table);
    this.tables[table].push(...rows.map((r) => ({ ...r })));
    this._persist();
    return rows.length;
  }

  async findOne(table, where = {}) {
    return (await this.findMany(table, { where, limit: 1 }))[0] ?? null;
  }

  async findMany(table, { where = {}, orderBy, limit, offset = 0 } = {}) {
    this._assertTable(table);
    let rows = this.tables[table].filter((row) => this._match(row, where));
    if (orderBy) {
      const entries = Array.isArray(orderBy[0]) ? orderBy : [orderBy];
      rows = [...rows].sort((a, b) => {
        for (const [col, dir] of entries) {
          const av = a[col]; const bv = b[col];
          if (av === bv) continue;
          const cmp = av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1
            : av > bv ? 1 : -1;
          return dir?.toUpperCase?.() === 'DESC' ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (offset) rows = rows.slice(offset);
    if (limit !== undefined) rows = rows.slice(0, limit);
    return rows.map((r) => ({ ...r }));
  }

  async count(table, where = {}) {
    this._assertTable(table);
    return this.tables[table].filter((row) => this._match(row, where)).length;
  }

  async updateById(table, id, patch) {
    this._assertTable(table);
    const row = this.tables[table].find((r) => r.id === id);
    if (!row) return 0;
    Object.assign(row, this._sanitize(table, patch));
    this._persist();
    return 1;
  }

  async updateWhere(table, where, patch) {
    this._assertTable(table);
    let n = 0;
    for (const row of this.tables[table]) {
      if (this._match(row, where)) {
        Object.assign(row, this._sanitize(table, patch));
        n += 1;
      }
    }
    if (n) this._persist();
    return n;
  }

  async deleteWhere(table, where) {
    this._assertTable(table);
    const before = this.tables[table].length;
    this.tables[table] = this.tables[table].filter((row) => !this._match(row, where));
    const removed = before - this.tables[table].length;
    if (removed) this._persist();
    return removed;
  }

  async transaction(fn) {
    // درایور حافظه تک‌نخی است؛ همان ترتیب فراخوانی کفایت می‌کند
    return fn(this);
  }

  _assertTable(table) {
    if (!this.tables[table]) throw new Error(`جدول ناشناخته: ${table}`);
  }

  _sanitize(table, patch) {
    const allowed = new Set(TABLES[table]);
    return Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)));
  }

  _match(row, where) {
    return Object.entries(where).every(([col, cond]) => {
      if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
        const ops = {
          '=': (a, b) => a === b, '!=': (a, b) => a !== b,
          '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
          in: (a, b) => b.includes(a), like: (a, b) => String(a ?? '').includes(String(b).replace(/%/g, '')),
        };
        return Object.entries(cond).every(([op, v]) => (ops[op] || ops['='])(row[col], v));
      }
      return row[col] === cond;
    });
  }
}
