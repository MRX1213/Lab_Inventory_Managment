import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

test('hashPassword and verifyPassword round-trip', () => {
  const hash = hashPassword('correct-horse-battery-staple');
  assert.ok(hash.startsWith('scrypt:'));
  assert.equal(verifyPassword('correct-horse-battery-staple', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
});

test('verifyPassword rejects malformed stored hash', () => {
  assert.equal(verifyPassword('x', 'plain'), false);
  assert.equal(verifyPassword('x', 'bcrypt:aaaa'), false);
});