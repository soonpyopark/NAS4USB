import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

const CREATE_DOCUMENT_SQL = `
  CREATE TABLE document_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT,
    folder_path TEXT,
    file_name TEXT,
    source_path TEXT,
    location_label TEXT,
    location_json TEXT,
    content TEXT
  )
`;

let sqlJsPromise = null;

async function loadSqlJs() {
  if (!sqlJsPromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    sqlJsPromise = initSqlJs({
      wasmBinary: fs.readFileSync(wasmPath),
    });
  }
  return sqlJsPromise;
}

export class PersonalDocIndexDatabase {
  /**
   * @param {string} dbPath
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    /** @type {import('sql.js').Database | null} */
    this.db = null;
  }

  /**
   * @param {{ reset?: boolean }} [options]
   */
  async open({ reset = false } = {}) {
    const SQL = await loadSqlJs();

    if (reset || !fs.existsSync(this.dbPath)) {
      this.db = new SQL.Database();
    } else {
      this.db = new SQL.Database(fs.readFileSync(this.dbPath));
    }

    if (reset) {
      this.db.exec('DROP TABLE IF EXISTS document_index');
      this.db.exec('DROP TABLE IF EXISTS index_job');
      this.db.exec('DROP TABLE IF EXISTS index_files');
    }

    this.#ensureSchema();
    return this;
  }

  #ensureSchema() {
    if (!this.db) return;
    const tables = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='document_index'",
    );
    if (!tables.length || !tables[0].values.length) {
      this.db.exec(CREATE_DOCUMENT_SQL);
      this.db.exec('CREATE INDEX idx_content ON document_index (content)');
      this.db.exec('CREATE INDEX idx_source_path ON document_index (source_path)');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_job (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        root_path TEXT,
        status TEXT,
        started_at TEXT,
        updated_at TEXT
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_files (
        source_path TEXT PRIMARY KEY,
        size INTEGER,
        mtime INTEGER,
        status TEXT,
        message TEXT,
        record_count INTEGER
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  getFormatVersion() {
    return Number(this.#queryValue("SELECT value FROM index_meta WHERE key = 'format'")) || 0;
  }

  /**
   * @param {number} version
   */
  setFormatVersion(version) {
    this.#setMeta('format', String(version));
  }

  /**
   * @param {number} count
   */
  setFolderCount(count) {
    this.#setMeta('folderCount', String(Math.max(0, Number(count) || 0)));
  }

  countFolders() {
    const stored = this.#getMeta('folderCount');
    if (stored != null && stored !== '') {
      return Number(stored) || 0;
    }
    const rows = this.#queryAll('SELECT source_path FROM index_files');
    const folders = new Set();
    for (const row of rows) {
      const source = String(row.source_path ?? '').replace(/\\/g, '/');
      const parts = source.split('/').filter(Boolean);
      parts.pop();
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        folders.add(acc);
      }
    }
    return folders.size;
  }

  countRows() {
    return this.#queryValue('SELECT COUNT(*) FROM document_index');
  }

  countFiles() {
    return {
      done: this.#queryValue("SELECT COUNT(*) FROM index_files WHERE status = 'done'"),
      error: this.#queryValue("SELECT COUNT(*) FROM index_files WHERE status = 'error'"),
    };
  }

  getJob() {
    return this.#queryOne('SELECT root_path, status, started_at, updated_at FROM index_job WHERE id = 1');
  }

  /**
   * @param {{ rootPath: string, status: string, startedAt?: string }} job
   */
  setJob({ rootPath, status, startedAt }) {
    const now = new Date().toISOString();
    const existing = this.getJob();
    if (existing) {
      this.#run(
        `UPDATE index_job
         SET root_path = ?, status = ?, started_at = ?, updated_at = ?
         WHERE id = 1`,
        [rootPath, status, startedAt || existing.started_at || now, now],
      );
      return;
    }
    this.#run(
      `INSERT INTO index_job (id, root_path, status, started_at, updated_at)
       VALUES (1, ?, ?, ?, ?)`,
      [rootPath, status, startedAt || now, now],
    );
  }

  /**
   * @param {string} sourcePath
   */
  getFile(sourcePath) {
    return this.#queryOne(
      'SELECT source_path, size, mtime, status, message, record_count FROM index_files WHERE source_path = ?',
      [sourcePath],
    );
  }

  /**
   * @param {{ sourcePath: string, size: number, mtime: number, status: string, message?: string, recordCount?: number }} record
   */
  upsertFile(record) {
    this.#run(
      `INSERT INTO index_files (source_path, size, mtime, status, message, record_count)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_path) DO UPDATE SET
         size = excluded.size,
         mtime = excluded.mtime,
         status = excluded.status,
         message = excluded.message,
         record_count = excluded.record_count`,
      [
        record.sourcePath,
        record.size,
        record.mtime,
        record.status,
        record.message || '',
        record.recordCount || 0,
      ],
    );
  }

  /**
   * @param {string} sourcePath
   */
  deleteRecordsBySource(sourcePath) {
    this.#run('DELETE FROM document_index WHERE source_path = ?', [sourcePath]);
    this.#run('DELETE FROM index_files WHERE source_path = ?', [sourcePath]);
  }

  /**
   * @param {string} prefix
   */
  deleteRecordsBySourcePrefix(prefix) {
    const normalized = String(prefix ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized) return;
    const like = `${normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')}/%`;
    this.#run("DELETE FROM document_index WHERE source_path = ? OR source_path LIKE ? ESCAPE '\\'", [
      normalized,
      like,
    ]);
    this.#run("DELETE FROM index_files WHERE source_path = ? OR source_path LIKE ? ESCAPE '\\'", [
      normalized,
      like,
    ]);
  }

  /**
   * @param {Array<Array<string | number | null>>} rows
   */
  insertMany(rows) {
    if (!this.db || !rows.length) return;
    this.db.exec('BEGIN');
    const stmt = this.db.prepare(
      `INSERT INTO document_index
        (doc_type, folder_path, file_name, source_path, location_label, location_json, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const row of rows) {
        stmt.run(row);
      }
    } finally {
      stmt.free();
      this.db.exec('COMMIT');
    }
  }

  /**
   * @param {string} whereSql
   * @param {unknown[]} [params]
   * @param {number} [limit]
   */
  search(whereSql, params = [], limit = 300) {
    if (!this.db) return [];
    const stmt = this.db.prepare(
      `SELECT document_index.doc_type,
              document_index.folder_path,
              document_index.file_name,
              document_index.source_path,
              document_index.location_label,
              document_index.location_json,
              document_index.content,
              index_files.size AS file_size,
              index_files.mtime AS file_mtime
       FROM document_index
       LEFT JOIN index_files ON index_files.source_path = document_index.source_path
       WHERE ${whereSql}
       ORDER BY document_index.folder_path, document_index.file_name, document_index.id
       LIMIT ?`,
    );
    stmt.bind([...params, limit]);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  save() {
    if (!this.db) return;
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  #queryOne(sql, params = []) {
    if (!this.db) return null;
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  #queryValue(sql) {
    if (!this.db) return 0;
    const result = this.db.exec(sql);
    return result.length ? Number(result[0].values[0][0]) : 0;
  }

  #queryAll(sql, params = []) {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  #getMeta(key) {
    const row = this.#queryOne('SELECT value FROM index_meta WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  #setMeta(key, value) {
    this.#run(
      `INSERT INTO index_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  #run(sql, params = []) {
    if (!this.db) return;
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
  }
}
