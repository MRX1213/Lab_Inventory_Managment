import sql from 'mssql';
import { config } from '../config.js';

/** @type {sql.ConnectionPool | null} */
let pool = null;

export async function getPool() {
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool({
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    options: config.db.options,
    pool: config.db.pool,
  }).connect();
  return pool;
}

export async function query(text, params = {}) {
  const p = await getPool();
  const req = p.request();
  for (const [key, val] of Object.entries(params)) {
    req.input(key, val);
  }
  return req.query(text);
}

export { sql };