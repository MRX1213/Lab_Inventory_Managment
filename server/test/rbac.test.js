import test from 'node:test';
import assert from 'node:assert/strict';
import { canReview, isAdmin, isStaff } from '../src/lib/rbac.js';

test('student cannot review or manage staff routes', () => {
  assert.equal(isStaff('Student Worker'), false);
  assert.equal(canReview('Student Worker'), false);
  assert.equal(isAdmin('Student Worker'), false);
});

test('full-time worker is staff and reviewer', () => {
  assert.equal(isStaff('Full-time Lab Worker'), true);
  assert.equal(canReview('Full-time Lab Worker'), true);
});

test('admin has admin flag', () => {
  assert.equal(isAdmin('Admin'), true);
  assert.equal(canReview('Admin'), true);
});