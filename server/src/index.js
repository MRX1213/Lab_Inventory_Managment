import { createApp } from './app.js';
import { config } from './config.js';
import { getPool } from './db/pool.js';

const app = createApp();

async function main() {
  try {
    await getPool();
    console.log('Connected to SQL Server:', config.db.database);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exitCode = 1;
    return;
  }
  app.listen(config.port, config.host, () => {
    console.log(`Lab Inventory API + UI at http://${config.host}:${config.port} (loopback by default)`);
  });
}

main();