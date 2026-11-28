import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontEndDir = path.join(repoRoot, 'Front-end');

function assertExactCaseRelative(relPath) {
  const normalized = relPath.replace(/^\//, '').replace(/\//g, path.sep);
  const full = path.join(frontEndDir, normalized);
  const parent = path.dirname(full);
  const base = path.basename(full);
  assert.ok(fs.existsSync(parent), `missing directory for ${relPath}`);
  const entries = fs.readdirSync(parent);
  assert.ok(
    entries.includes(base),
  `exact-case asset missing: ${relPath} (directory has: ${entries.filter((e) => e.toLowerCase() === base.toLowerCase()).join(', ') || 'no case-variant'})`,
  );
}

function collectAssetRefs(html) {
  const refs = [];
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ref = m[1].trim();
    if (!ref || ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('#')) continue;
    refs.push(ref.split('?')[0].split('#')[0]);
  }
  return refs;
}

test('front-end navigation page inventory.html exists with exact case', () => {
  assertExactCaseRelative('inventory.html');
});

test('front-end HTML asset links use exact on-disk paths (case-sensitive FS)', () => {
  const htmlFiles = fs
    .readdirSync(frontEndDir)
    .filter((f) => f.toLowerCase().endsWith('.html'));
  const refs = new Set();
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(frontEndDir, file), 'utf8');
    for (const ref of collectAssetRefs(content)) refs.add(ref);
  }
  for (const ref of refs) {
    assertExactCaseRelative(ref);
  }
});