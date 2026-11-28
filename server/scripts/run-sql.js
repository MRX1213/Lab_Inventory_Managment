import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { config } from '../src/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sqlPath = path.resolve(repoRoot, process.argv[2] || '');
if (!sqlPath || !fs.existsSync(sqlPath)) {
  console.error('Usage: node run-sql.js <path-to.sql>');
  process.exit(1);
}

const raw = fs.readFileSync(sqlPath, 'utf8');
const batches = raw
  .split(/\r?\n\s*GO\s*\r?\n/i)
  .map((b) => b.replace(/^\s*GO\s*$/gim, '').trim())
  .filter(Boolean);

const pool = await new sql.ConnectionPool({
  server: config.db.server,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database === 'LabInventory' ? 'master' : config.db.database,
  options: config.db.options,
}).connect();

for (const batch of batches) {
  try {
    await pool.request().query(batch);
    console.log('OK batch:', batch.slice(0, 60).replace(/\s+/g, ' '), '...');
  } catch (e) {
    console.error('Batch failed:', e.message);
    throw e;
  }
}
await pool.close();
console.log('Finished', sqlPath);