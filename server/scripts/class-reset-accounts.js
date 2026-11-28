import '../test/load-env.js';
import sql from 'mssql';
import { config } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import {
  formatDryRunReport,
  isBlockedInactiveTestUser,
  partitionBlockedTestUsers,
  unexpectedReferenceError,
} from '../src/lib/classResetAccounts.js';

const dryRun = process.argv.includes('--dry-run');
const classPassword = process.env.LAB_CLASS_PASSWORD;

if (!dryRun) {
  if (!classPassword || classPassword.length < 8) {
    console.error(
      'Set LAB_CLASS_PASSWORD in the environment (min 8 characters). Use --dry-run to preview without a password.',
    );
    process.exit(1);
  }
}

const pool = await new sql.ConnectionPool({
  server: config.db.server,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  options: config.db.options,
  pool: config.db.pool,
}).connect();

function mapUser(row) {
  return {
    userId: row.UserID,
    email: String(row.Email).trim().toLowerCase(),
    isActive: row.IsActive,
  };
}

async function loadUsers() {
  const r = await pool.request().query(
    `SELECT UserID, Email, IsActive FROM dbo.Users ORDER BY UserID`,
  );
  return r.recordset.map(mapUser);
}

async function countDependents(userIds) {
  const dependentsByUserId = new Map();
  for (const id of userIds) {
    dependentsByUserId.set(id, { sessions: 0, supplyRequests: 0, inventoryLogs: 0 });
  }
  if (!userIds.length) return dependentsByUserId;

  const idList = userIds.join(',');
  const sessions = await pool.request().query(
    `SELECT UserID, COUNT(*) AS C FROM dbo.UserSessions WHERE UserID IN (${idList}) GROUP BY UserID`,
  );
  for (const row of sessions.recordset) {
    dependentsByUserId.get(row.UserID).sessions = row.C;
  }

  const requests = await pool.request().query(
    `SELECT RequestedByUserID AS UserID, COUNT(*) AS C FROM dbo.SupplyRequests WHERE RequestedByUserID IN (${idList}) GROUP BY RequestedByUserID`,
  );
  for (const row of requests.recordset) {
    dependentsByUserId.get(row.UserID).supplyRequests = row.C;
  }

  const logs = await pool.request().query(
    `SELECT UserID, COUNT(*) AS C FROM dbo.InventoryLogs WHERE UserID IN (${idList}) GROUP BY UserID`,
  );
  for (const row of logs.recordset) {
    dependentsByUserId.get(row.UserID).inventoryLogs = row.C;
  }
  return dependentsByUserId;
}

async function countUnexpectedReferences(blockedIds) {
  if (!blockedIds.length) {
    return { logsProcessedForOthers: 0, requestsReviewedForOthers: 0 };
  }
  const idList = blockedIds.join(',');
  const logs = await pool.request().query(
    `SELECT COUNT(*) AS C FROM dbo.InventoryLogs
     WHERE ProcessedByID IN (${idList}) AND UserID NOT IN (${idList})`,
  );
  const reqs = await pool.request().query(
    `SELECT COUNT(*) AS C FROM dbo.SupplyRequests
     WHERE ReviewedByUserID IN (${idList}) AND RequestedByUserID NOT IN (${idList})`,
  );
  return {
    logsProcessedForOthers: logs.recordset[0].C,
    requestsReviewedForOthers: reqs.recordset[0].C,
  };
}

try {
  const users = await loadUsers();
  const { blocked, active } = partitionBlockedTestUsers(users);
  const blockedIds = blocked.map((u) => u.userId);
  const dependentsByUserId = await countDependents(blockedIds);
  const unexpectedRefs = await countUnexpectedReferences(blockedIds);

  if (dryRun) {
    process.stdout.write(
      formatDryRunReport({ blocked, active, dependentsByUserId, unexpectedRefs }),
    );
    const err = unexpectedReferenceError(unexpectedRefs);
    process.exit(err ? 2 : 0);
  }

  const refErr = unexpectedReferenceError(unexpectedRefs);
  if (refErr) {
    console.error(refErr.code, refErr);
    process.exit(2);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (blockedIds.length) {
      const idList = blockedIds.join(',');
      await new sql.Request(transaction).query(
        `DELETE FROM dbo.SupplyRequests WHERE RequestedByUserID IN (${idList})`,
      );
      await new sql.Request(transaction).query(
        `DELETE FROM dbo.InventoryLogs WHERE UserID IN (${idList})`,
      );
      await new sql.Request(transaction).query(
        `DELETE FROM dbo.UserSessions WHERE UserID IN (${idList})`,
      );
      await new sql.Request(transaction).query(
        `DELETE FROM dbo.Users WHERE UserID IN (${idList})`,
      );
    }

    const activeIds = active.map((u) => u.userId);
    if (activeIds.length) {
      const idList = activeIds.join(',');
      await new sql.Request(transaction).query(`DELETE FROM dbo.UserSessions WHERE UserID IN (${idList})`);
      for (const u of active) {
        const hash = hashPassword(classPassword);
        const req = new sql.Request(transaction);
        req.input('hash', sql.NVarChar(255), hash);
        req.input('id', sql.Int, u.userId);
        await req.query(`UPDATE dbo.Users SET PasswordHash=@hash WHERE UserID=@id`);
      }
    }

    for (const u of active) {
      const req = new sql.Request(transaction);
      req.input('id', sql.Int, u.userId);
      const row = await req.query(`SELECT PasswordHash FROM dbo.Users WHERE UserID=@id`);
      const stored = row.recordset[0]?.PasswordHash;
      if (!verifyPassword(classPassword, stored)) {
        throw new Error(`Password verify failed for active user ${u.email} (id=${u.userId})`);
      }
    }

    const inTxUsers = await new sql.Request(transaction).query(
      `SELECT UserID, Email, IsActive FROM dbo.Users ORDER BY UserID`,
    );
    const remainingBlocked = inTxUsers.recordset
      .map(mapUser)
      .filter((u) => isBlockedInactiveTestUser(u)).length;
    if (remainingBlocked !== 0) {
      throw new Error(
        `Expected 0 blocked inactive test users before commit; found ${remainingBlocked}`,
      );
    }

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }

  console.log(
    `class-reset-accounts: removed ${blocked.length} blocked test user(s); rotated password for ${active.length} active user(s); sessions revoked.`,
  );
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
} finally {
  await pool.close();
}