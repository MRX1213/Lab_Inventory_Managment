import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const httpTestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'http.test.js');

test('integration http.test does not map AreaCategories onto pre-existing areas', () => {
  const src = fs.readFileSync(httpTestPath, 'utf8');
  assert.doesNotMatch(src, /findEmptyAreaForDelete/);
});