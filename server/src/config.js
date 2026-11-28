import crypto from 'node:crypto';

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  host: process.env.LAB_HTTP_BIND || '127.0.0.1',
  port: envInt('LAB_HTTP_PORT', 3000),
  db: {
    server: process.env.LAB_DB_SERVER || 'localhost',
    port: envInt('LAB_DB_PORT', 14333),
    database: process.env.LAB_DB_NAME || 'LabInventory',
    user: process.env.LAB_DB_USER || 'sa',
    password: process.env.LAB_DB_PASSWORD || '',
    options: {
      encrypt: process.env.LAB_DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.LAB_DB_TRUST_CERT !== 'false',
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  },
  sessionSecret: process.env.LAB_SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  sessionHours: envInt('LAB_SESSION_HOURS', 8),
  cookieName: 'lab_session',
};