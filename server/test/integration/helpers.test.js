import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, query } from '../../src/db/pool.js';
import {
  FIXTURE_TAG,
  createFixtureUser,
  registerFixtureAreaId,
  removeFixtureUsers,
  resetFixtureRegistry,
} from './helpers.js';

const runIntegration = process.env.LAB_RUN_INTEGRATION === '1';

const helpersPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helpers.js');

test('integration helpers: cleanup deletes fixture users (not deactivate)', { skip: !runIntegration }, async () => {
  await getPool();
  resetFixtureRegistry();
  const email = `cleanup-del-${FIXTURE_TAG}@example.com`;
  const user = await createFixtureUser({ roleName: 'Student Worker', email });
  try {
    const row = await query('SELECT UserID FROM dbo.Users WHERE UserID=@id', { id: user.userId });
    assert.equal(row.recordset.length, 1);
    await removeFixtureUsers();
    const gone = await query('SELECT UserID FROM dbo.Users WHERE UserID=@id', { id: user.userId });
    assert.equal(gone.recordset.length, 0);
  } finally {
    await removeFixtureUsers();
    resetFixtureRegistry();
  }
});

test('integration helpers: cleanup scopes users by registered ids (no broad LIKE deactivate)', () => {
  const src = fs.readFileSync(helpersPath, 'utf8');
  assert.doesNotMatch(src, /UPDATE\s+dbo\.Users\s+SET\s+IsActive\s*=\s*0/i);
  assert.match(src, /DELETE FROM dbo\.Users WHERE UserID=@id/);
});

test('integration helpers: area cleanup uses registered area ids only', () => {
  const src = fs.readFileSync(helpersPath, 'utf8');
  assert.match(src, /registerFixtureAreaId/);
  assert.doesNotMatch(src, /findEmptyAreaForDelete/);
});

test('integration helpers: partial setup still cleans registered artifacts', { skip: !runIntegration }, async () => {
  await getPool();
  resetFixtureRegistry();
  const user = await createFixtureUser({
    roleName: 'Student Worker',
    email: `partial-${FIXTURE_TAG}@example.com`,
  });
  const makerspace = await query(
    `SELECT TOP 1 SpaceID FROM dbo.Spaces WHERE SpaceName = N'Makerspace' ORDER BY SpaceID`,
  );
  const ins = await query(
    `INSERT INTO dbo.Areas (SpaceID, AreaName) OUTPUT INSERTED.AreaID VALUES (@s, @n)`,
    { s: makerspace.recordset[0].SpaceID, n: `Tmp-${FIXTURE_TAG}` },
  );
  const areaId = ins.recordset[0].AreaID;
  registerFixtureAreaId(areaId);
  assert.ok(user.userId);
  await removeFixtureUsers();
  const areaGone = await query('SELECT AreaID FROM dbo.Areas WHERE AreaID=@id', { id: areaId });
  assert.equal(areaGone.recordset.length, 0);
  const userGone = await query('SELECT UserID FROM dbo.Users WHERE UserID=@id', { id: user.userId });
  assert.equal(userGone.recordset.length, 0);
  resetFixtureRegistry();
});