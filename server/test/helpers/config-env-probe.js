import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoDotEnv } from '../load-repo-env.js';

const fixtureRoot = process.argv[2];
if (!fixtureRoot) {
  console.error('usage: config-env-probe.js <repo-root-with-.env>');
  process.exit(1);
}

loadRepoDotEnv(path.resolve(fixtureRoot));
const { config } = await import('../../src/config.js');
process.stdout.write(
  `${config.db.server}|${config.db.port}|${config.db.database}|${config.db.user}|${config.db.password}\n`,
);