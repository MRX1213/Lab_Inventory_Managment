import test from 'node:test';
import assert from 'node:assert/strict';
import { wouldRemoveLastActiveAdmin, validateOptionalPassword } from '../src/lib/adminGuards.js';

test('wouldRemoveLastActiveAdmin blocks demote of sole admin', () => {
  assert.equal(
    wouldRemoveLastActiveAdmin({
      currentRoleName: 'Admin',
      currentIsActive: true,
      nextRoleName: 'Student Worker',
      nextIsActive: true,
      activeAdminCount: 1,
    }),
    true,
  );
});

test('wouldRemoveLastActiveAdmin allows when another admin exists', () => {
  assert.equal(
    wouldRemoveLastActiveAdmin({
      currentRoleName: 'Admin',
      currentIsActive: true,
      nextRoleName: 'Student Worker',
      nextIsActive: true,
      activeAdminCount: 2,
    }),
    false,
  );
});

test('validateOptionalPassword rejects short explicit password', () => {
  assert.equal(validateOptionalPassword('short'), 'Password must be at least 8 characters');
});

test('validateOptionalPassword allows omit', () => {
  assert.equal(validateOptionalPassword(''), null);
  assert.equal(validateOptionalPassword(undefined), null);
});