import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED_TEST_LOCAL_PREFIXES,
  DOCUMENTED_ACTIVE_CLASS_EMAILS,
  formatDryRunReport,
  isBlockedInactiveTestUser,
  partitionBlockedTestUsers,
  unexpectedReferenceError,
} from '../src/lib/classResetAccounts.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(serverRoot, 'scripts', 'class-reset-accounts.js');

test('isBlockedInactiveTestUser matches only inactive @example.com fixture prefixes', () => {
  for (const prefix of BLOCKED_TEST_LOCAL_PREFIXES) {
    assert.equal(
      isBlockedInactiveTestUser({ email: `${prefix}abc123@example.com`, isActive: false }),
      true,
    );
    assert.equal(
      isBlockedInactiveTestUser({ email: `${prefix}abc123@example.com`, isActive: true }),
      false,
    );
  }
  assert.equal(
    isBlockedInactiveTestUser({ email: 'cleanup-del-it-abc@example.com', isActive: false }),
    false,
  );
  assert.equal(
    isBlockedInactiveTestUser({ email: 'staff-it-abc@lab.example', isActive: false }),
    false,
  );
});

test('partitionBlockedTestUsers splits active vs blocked', () => {
  const users = [
    { userId: 1, email: 'student-it-zzz@example.com', isActive: false },
    { userId: 2, email: 'student.a@lab.example', isActive: true },
    { userId: 3, email: 'partial-it-zzz@example.com', isActive: false },
  ];
  const { blocked, active } = partitionBlockedTestUsers(users);
  assert.deepEqual(
    blocked.map((u) => u.userId),
    [1],
  );
  assert.deepEqual(
    active.map((u) => u.userId),
    [2],
  );
});

test('dry-run report lists ids/emails and dependent counts without password hashes', () => {
  const dependentsByUserId = new Map([
    [9, { sessions: 2, supplyRequests: 1, inventoryLogs: 0 }],
  ]);
  const text = formatDryRunReport({
    blocked: [{ userId: 9, email: 'staff-it-abc@example.com' }],
    active: [{ userId: 1, email: 'admin@lab.example' }],
    dependentsByUserId,
    unexpectedRefs: { logsProcessedForOthers: 0, requestsReviewedForOthers: 0 },
  });
  assert.match(text, /id=9 email=staff-it-abc@example\.com sessions=2 supplyRequests=1/);
  assert.match(text, /id=1 email=admin@lab\.example/);
  assert.doesNotMatch(text, /scrypt:/);
  assert.doesNotMatch(text, /PasswordHash/);
  assert.match(text, /blockedInactiveTestUserCount=1/);
});

test('unexpectedReferenceError fails closed when foreign rows reference blocked users', () => {
  assert.equal(unexpectedReferenceError({ logsProcessedForOthers: 0, requestsReviewedForOthers: 0 }), null);
  const err = unexpectedReferenceError({ logsProcessedForOthers: 1, requestsReviewedForOthers: 0 });
  assert.equal(err?.code, 'UNEXPECTED_USER_REFERENCES');
});

test('class-reset script does not embed class password literal', () => {
  const src = fs.readFileSync(scriptPath, 'utf8');
  assert.match(src, /LAB_CLASS_PASSWORD/);
  assert.doesNotMatch(src, /Panther\$/);
});

test('documented active class emails are listed for operators', () => {
  assert.equal(DOCUMENTED_ACTIVE_CLASS_EMAILS.length, 5);
  assert.ok(DOCUMENTED_ACTIVE_CLASS_EMAILS.includes('lab-review@local.test'));
});