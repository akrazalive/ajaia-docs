// Storage adapter. One small async interface (all/get/run/exec) over two drivers:
//   - SQLite via Node's built-in `node:sqlite` (default; zero native deps, used locally + in tests)
//   - Postgres via `pg` when DATABASE_URL is set (used in the hosted deployment)
// Queries are written once with `?` placeholders and portable SQL.
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

async function createSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  return {
    driver: 'sqlite',
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async get(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    async run(sql, params = []) { return { changes: Number(db.prepare(sql).run(...params).changes) }; },
    async exec(sql) { db.exec(sql); },
    async close() { db.close(); },
  };
}

async function createPostgres(url, injectedPool) {
  const { default: pg } = await import('pg');
  const pool = injectedPool ?? new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  // Translate `?` placeholders to `$1, $2, ...`
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

  return {
    driver: 'postgres',
    async all(sql, params = []) { return (await pool.query(toPg(sql), params)).rows; },
    async get(sql, params = []) { return (await pool.query(toPg(sql), params)).rows[0] ?? null; },
    async run(sql, params = []) { return { changes: (await pool.query(toPg(sql), params)).rowCount }; },
    async exec(sql) { await pool.query(sql); },
    async close() { await pool.end(); },
  };
}

// `pgPool` lets tests run the Postgres driver against an in-memory emulator.
export async function createDb({ databaseUrl, sqliteFile, pgPool } = {}) {
  const db = databaseUrl || pgPool
    ? await createPostgres(databaseUrl, pgPool)
    : await createSqlite(sqliteFile ?? ':memory:');
  await db.exec(SCHEMA);
  return db;
}
