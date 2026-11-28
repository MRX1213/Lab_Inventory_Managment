import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRowVersion } from '../src/lib/rowVersion.js';

test('requireRowVersion rejects missing value', () => {
  const r = requireRowVersion(null);
  assert.equal(r.ok, false);
});

test('requireRowVersion rejects wrong length', () => {
  const r = requireRowVersion('AAAAAAAB');
  assert.equal(r.ok, false);
});

test('requireRowVersion accepts 8-byte base64', () => {
  const r = requireRowVersion('AAAAAAAAAAE=');
  assert.equal(r.ok, true);
  assert.equal(r.buffer.length, 8);
});