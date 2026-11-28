import test from 'node:test';
import assert from 'node:assert/strict';
import { allowExistingUserOverwrite } from '../src/lib/bootstrapAdmin.js';

test('allowExistingUserOverwrite requires explicit recovery flag', () => {
  assert.equal(allowExistingUserOverwrite(undefined), false);
  assert.equal(allowExistingUserOverwrite('0'), false);
  assert.equal(allowExistingUserOverwrite('1'), true);
  assert.equal(allowExistingUserOverwrite('true'), true);
});