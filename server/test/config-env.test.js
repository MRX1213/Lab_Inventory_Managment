import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const probePath = path.join(testDir, 'helpers', 'config-env-probe.js');
const fixtureRoot = path.join(testDir, 'fixtures', 'env-only-config');

test('.env-only supplies DB config when shell omits LAB_DB_*', () => {
  const env = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    TEMP: process.env.TEMP ?? '',
    TMP: process.env.TMP ?? '',
  };
  const r = spawnSync(process.execPath, [probePath, fixtureRoot], {
    env,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(
    r.stdout.trim(),
    '203.0.113.50|59991|EnvOnlyFixtureDb|envonly_user|envonly_secret',
  );
});

test('npm scripts that read config load repo .env via --import', () => {
  const pkgPath = path.join(testDir, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const needImport = [
    'start',
    'dev',
    'db:init',
    'db:migrate',
    'db:seed-qa',
    'bootstrap-admin',
    'class:reset-accounts',
  ];
  const token = '--import ./test/load-env.js';
  for (const name of needImport) {
    const script = pkg.scripts[name];
    assert.ok(script, `missing script ${name}`);
    assert.ok(
      script.includes(token),
      `${name} must ${token} so repo-root .env supplies LAB_DB_* without shell export`,
    );
  }
});

test('class-reset script loads .env before config module', () => {
  const scriptPath = path.join(testDir, '..', 'scripts', 'class-reset-accounts.js');
  const src = fs.readFileSync(scriptPath, 'utf8');
  const loadIdx = src.indexOf("'../test/load-env.js'");
  const configIdx = src.indexOf("from '../src/config.js'");
  assert.ok(loadIdx >= 0, 'must import load-env.js');
  assert.ok(configIdx >= 0, 'must import config');
  assert.ok(loadIdx < configIdx, 'load-env must appear before config import');
  assert.doesNotMatch(src, /const envPath = path\.join\(repoRoot, '\.env'\)/);
});

test('class-reset verifies passwords before transaction commit', () => {
  const scriptPath = path.join(testDir, '..', 'scripts', 'class-reset-accounts.js');
  const src = fs.readFileSync(scriptPath, 'utf8');
  const verifyIdx = src.indexOf('verifyPassword(classPassword, stored)');
  const commitIdx = src.indexOf('await transaction.commit()');
  assert.ok(verifyIdx >= 0);
  assert.ok(commitIdx >= 0);
  assert.ok(verifyIdx < commitIdx, 'password verify must run before commit');
});