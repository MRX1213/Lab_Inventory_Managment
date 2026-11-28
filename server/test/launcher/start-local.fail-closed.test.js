import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptPath = path.join(repoRoot, 'start-local.ps1');

const isWindows = process.platform === 'win32';

const NPM_STEPS = ['install', 'db:init', 'db:migrate', 'bootstrap-admin', 'start'];

test('start-local.ps1 defines Invoke-RepoNpm and checks LASTEXITCODE', { skip: !isWindows }, () => {
  const text = fs.readFileSync(scriptPath, 'utf8');
  assert.match(text, /function\s+Invoke-RepoNpm/);
  assert.match(text, /\$LASTEXITCODE/);
});

test('start-local.ps1 fail-closed after each npm step', { skip: !isWindows }, () => {
  const text = fs.readFileSync(scriptPath, 'utf8');
  for (const step of NPM_STEPS) {
    assert.match(text, new RegExp(`Invoke-RepoNpm[\\s\\S]*${step.replace(':', '\\:')}`));
  }
  const invokeCount = (text.match(/Invoke-RepoNpm/g) || []).length;
  assert.ok(invokeCount >= 5, `expected at least 5 Invoke-RepoNpm calls, got ${invokeCount}`);
});

test('LOCAL_RUN.md documents SQL Express TCP 14333 and mixed-mode auth', () => {
  const docPath = path.join(repoRoot, 'LOCAL_RUN.md');
  const text = fs.readFileSync(docPath, 'utf8');
  assert.match(text, /TCP\/IP/i);
  assert.match(text, /14333/);
  assert.match(text, /mixed/i);
  assert.match(text, /dynamic\s+port/i);
  assert.match(text, /firewall|loopback|127\.0\.0\.1/i);
});