import test from 'node:test';
import assert from 'node:assert/strict';
import { rowVersionToBase64, base64ToBuffer } from '../src/lib/serialize.js';

test('rowVersion base64 length for 8-byte buffer', () => {
  const b64 = rowVersionToBase64(Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]));
  assert.equal(base64ToBuffer(b64).length, 8);
});

test('base64ToBuffer rejects invalid input', () => {
  assert.equal(base64ToBuffer(''), null);
});