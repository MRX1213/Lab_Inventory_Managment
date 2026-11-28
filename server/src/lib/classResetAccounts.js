/** Inactive integration/smoke fixture users at @example.com (local part prefix). */
export const BLOCKED_TEST_EMAIL_SUFFIX = '@example.com';

export const BLOCKED_TEST_LOCAL_PREFIXES = Object.freeze([
  'staff-it-',
  'student-it-',
  'admin-a-it-',
  'admin-b-it-',
  'staff-del-it-',
  'smoke-admin-it-',
  'smoke-staff-it-',
  'smoke-student-it-',
]);

/** Documented class login accounts (expected after operator runs class reset). */
export const DOCUMENTED_ACTIVE_CLASS_EMAILS = Object.freeze([
  'student.a@lab.example',
  'student.b@lab.example',
  'worker.ft@lab.example',
  'admin@lab.example',
  'lab-review@local.test',
]);

/**
 * @param {{ email: string, isActive: boolean | number | null }} row
 */
export function isBlockedInactiveTestUser(row) {
  if (!row || row.isActive === true || row.isActive === 1) return false;
  const email = String(row.email || '')
    .trim()
    .toLowerCase();
  if (!email.endsWith(BLOCKED_TEST_EMAIL_SUFFIX)) return false;
  const local = email.slice(0, -BLOCKED_TEST_EMAIL_SUFFIX.length);
  return BLOCKED_TEST_LOCAL_PREFIXES.some((prefix) => local.startsWith(prefix));
}

/**
 * @param {Array<{ userId: number, email: string, isActive: boolean | number }>} users
 */
export function partitionBlockedTestUsers(users) {
  const blocked = [];
  const active = [];
  for (const u of users) {
    const row = { email: u.email, isActive: u.isActive };
    if (isBlockedInactiveTestUser(row)) blocked.push(u);
    else if (u.isActive === true || u.isActive === 1) active.push(u);
  }
  return { blocked, active };
}

/**
 * @param {{ logsProcessedForOthers: number, requestsReviewedForOthers: number }} counts
 */
export function unexpectedReferenceError(counts) {
  if (counts.logsProcessedForOthers > 0 || counts.requestsReviewedForOthers > 0) {
    return {
      code: 'UNEXPECTED_USER_REFERENCES',
      logsProcessedForOthers: counts.logsProcessedForOthers,
      requestsReviewedForOthers: counts.requestsReviewedForOthers,
    };
  }
  return null;
}

/**
 * @param {{
 *   blocked: Array<{ userId: number, email: string }>,
 *   active: Array<{ userId: number, email: string }>,
 *   dependentsByUserId: Map<number, { sessions: number, supplyRequests: number, inventoryLogs: number }>,
 *   unexpectedRefs: { logsProcessedForOthers: number, requestsReviewedForOthers: number } | null,
 * }} input
 */
export function formatDryRunReport(input) {
  const lines = ['class-reset-accounts dry-run', '--- blocked inactive test users ---'];
  if (!input.blocked.length) {
    lines.push('(none)');
  } else {
    for (const u of input.blocked) {
      const dep = input.dependentsByUserId.get(u.userId) || {
        sessions: 0,
        supplyRequests: 0,
        inventoryLogs: 0,
      };
      lines.push(
        `  id=${u.userId} email=${u.email} sessions=${dep.sessions} supplyRequests=${dep.supplyRequests} inventoryLogs=${dep.inventoryLogs}`,
      );
    }
  }
  lines.push('--- active users (password will be rotated; hashes not shown) ---');
  if (!input.active.length) {
    lines.push('(none)');
  } else {
    for (const u of input.active) {
      lines.push(`  id=${u.userId} email=${u.email}`);
    }
  }
  if (input.unexpectedRefs) {
    const err = unexpectedReferenceError(input.unexpectedRefs);
    if (err) {
      lines.push(
        `--- FAIL (would abort): ${err.code} logsProcessedForOthers=${err.logsProcessedForOthers} requestsReviewedForOthers=${err.requestsReviewedForOthers}`,
      );
    }
  }
  lines.push(`blockedInactiveTestUserCount=${input.blocked.length}`);
  return `${lines.join('\n')}\n`;
}