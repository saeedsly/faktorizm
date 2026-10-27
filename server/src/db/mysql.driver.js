import mysql from 'mysql2/promise';
import { TABLES, JSON_COLUMNS } from './columns.js';

/**
 * درایور MySQL با Connection Pool.
 * همه مقادیر فقط به‌صورت پارامتریزه به دیتابیس می‌رسند و نام ستون‌ها از
 * سفیدلیست TABLES می‌آید؛ بنابراین مسیر تزریق SQL بسته است.
 */
export class MysqlDriver {
  constructor(cfg) {
    this.pool = mysql.createPool({
      host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
      database: cfg.database, connectionLimit: cfg.connectionLimit,
      waitForConnections: true, queueLimit: 0,
      charset: 'utf8mb4', dateStrings: true,
    });
  }

  async init() {
    const conn = await this.pool.getConnection();
    try { await conn.ping(); } finally { conn.release(); }
  }

  async ping() {
    const [rows] = await this.pool.query('SELECT 1 AS ok');
    return rows[0].ok === 1;
  }

  _assertTable(table) {
    if (!TABLES[table]) throw new Error(`جدول ناشناخته: ${table}`);
  }

  _cols(table) { return TABLES[table]; }

  _encode(table, row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (!this._cols(table).includes(k)) continue;
      out[k] = JSON_COLUMNS.has(k) && (typeof v === 'object' || Array.isArray(v)) ? JSON.stringify(v ?? null) : v;
    }
    return out;
  }

  async insert(table, row) {
    this._assertTable(table);
    const data = this._encode(table, row);
    const cols = Object.keys(data);
    const placeholders = cols.map(() => '?').join(', ');
    await this.pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      cols.map((c) => data[c]),
    );
    return { ...row };
  }

  async bulkInsert(table, rows) {
    if (!rows.length) return 0;
    this._assertTable(table);
    const encoded = rows.map((r) => this._encode(table, r));
    const cols = Object.keys(encoded[0]);
    const placeholders = `(${cols.map(() => '?').join(', ')})`;
    const values = encoded.flatMap((r) => cols.map((c) => r[c]));
    await this.pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${encoded.map(() => placeholders).join(', ')}`,
      values,
    );
    return rows.length;
  }

  _buildWhere(where) {
    const clauses = [];
    const params = [];
    for (const [col, cond] of Object.entries(where)) {
      if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
        for (const [op, v] of Object.entries(cond)) {
          const sqlOp = { '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=', in: 'IN', like: 'LIKE' }[op];
          if (!sqlOp) continue;
          if (op === 'in') {
            if (!Array.isArray(v) || !v.length) continue;
            clauses.push(`${col} IN (${v.map(() => '?').join(', ')})`);
            params.push(...v);
          } else if (op === 'like') {
            clauses.push(`${col} LIKE ?`);
            params.push(`%${v}%`);
          } else {
            clauses.push(`${col} ${sqlOp} ?`);
            params.push(v);
          }
        }
      } else {
        clauses.push(`${col} = ?`);
        params.push(cond);
      }
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  async findOne(table, where = {}) {
    return (await this.findMany(table, { where, limit: 1 }))[0] ?? null;
  }

  async findMany(table, { where = {}, orderBy, limit, offset = 0 } = {}) {
    this._assertTable(table);
    const { sql, params } = this._buildWhere(where);
    let orderSql = '';
    if (orderBy) {
      const entries = Array.isArray(orderBy[0]) ? orderBy : [orderBy];
      orderSql = `ORDER BY ${entries
        .filter(([col]) => this._cols(table).includes(col))
        .map(([col, dir]) => `${col} ${dir?.toUpperCase?.() === 'DESC' ? 'DESC' : 'ASC'}`).join(', ')}`;
    }
    const limitSql = limit !== undefined ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}` : '';
    const [rows] = await this.pool.query(
      `SELECT * FROM ${table} ${sql} ${orderSql} ${limitSql}`, params,
    );
    return rows.map((r) => this._decode(table, r));
  }

  async count(table, where = {}) {
    this._assertTable(table);
    const { sql, params } = this._buildWhere(where);
    const [rows] = await this.pool.query(`SELECT COUNT(*) AS c FROM ${table} ${sql}`, params);
    return Number(rows[0].c);
  }

  async updateById(table, id, patch) {
    this._assertTable(table);
    const data = this._encode(table, patch);
    const cols = Object.keys(data);
    if (!cols.length) return 0;
    const [res] = await this.pool.query(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => data[c]), id],
    );
    return res.affectedRows;
  }

  async updateWhere(table, where, patch) {
    this._assertTable(table);
    const data = this._encode(table, patch);
    const cols = Object.keys(data);
    if (!cols.length) return 0;
    const { sql, params } = this._buildWhere(where);
    const [res] = await this.pool.query(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} ${sql}`,
      [...cols.map((c) => data[c]), ...params],
    );
    return res.affectedRows;
  }

  async deleteWhere(table, where) {
    this._assertTable(table);
    const { sql, params } = this._buildWhere(where);
    const [res] = await this.pool.query(`DELETE FROM ${table} ${sql}`, params);
    return res.affectedRows;
  }

  async transaction(fn) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx = new TransactionDriver(conn, this);
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  _decode(table, row) {
    const out = { ...row };
    for (const c of JSON_COLUMNS) {
      if (c in out && typeof out[c] === 'string') {
        try { out[c] = JSON.parse(out[c]); } catch { /* مقدار غیر JSON دستی */ }
      }
    }
    return out;
  }
}

class TransactionDriver extends MysqlDriver {
  constructor(conn, parent) {
    super({ host: '', connectionLimit: 1 });
    this.conn = conn;
    this.parent = parent;
  }
  async init() {}
  async insert(table, row) {
    this._assertTable(table);
    const data = this._encode(table, row);
    const cols = Object.keys(data);
    await this.conn.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => data[c]),
    );
    return { ...row };
  }
  async findOne(table, where = {}) { return (await this.findMany(table, { where, limit: 1 }))[0] ?? null; }
  async findMany(table, { where = {}, orderBy, limit, offset = 0 } = {}) {
    this._assertTable(table);
    const { sql, params } = this._buildWhere(where);
    let orderSql = '';
    if (orderBy) {
      const entries = Array.isArray(orderBy[0]) ? orderBy : [orderBy];
      orderSql = `ORDER BY ${entries
        .filter(([col]) => this._cols(table).includes(col))
        .map(([col, dir]) => `${col} ${dir?.toUpperCase?.() === 'DESC' ? 'DESC' : 'ASC'}`).join(', ')}`;
    }
    const limitSql = limit !== undefined ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}` : '';
    const [rows] = await this.conn.query(`SELECT * FROM ${table} ${sql} ${orderSql} ${limitSql}`, params);
    return rows.map((r) => this._decode(table, r));
  }
  async updateWhere(table, where, patch) {
    this._assertTable(table);
    const data = this._encode(table, patch);
    const cols = Object.keys(data);
    if (!cols.length) return 0;
    const { sql, params } = this._buildWhere(where);
    const [res] = await this.conn.query(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} ${sql}`,
      [...cols.map((c) => data[c]), ...params],
    );
    return res.affectedRows;
  }
}
