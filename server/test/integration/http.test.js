import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { getPool, query } from '../../src/db/pool.js';
import {
  FIXTURE_TAG,
  apiJson,
  createFixtureItem,
  createFixtureUser,
  registerFixtureAreaId,
  removeFixtureUsers,
  login,
  snapshotQaItemQuantities,
  startTestServer,
} from './helpers.js';

const runIntegration = process.env.LAB_RUN_INTEGRATION === '1';

test('integration: login rejects empty body', { skip: !runIntegration }, async () => {
  await getPool();
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('integration: auth session, inventory, rbac, requests, profile, taxonomy, dashboard, admin', { skip: !runIntegration }, async (t) => {
  const qaBefore = await snapshotQaItemQuantities();

  t.after(async () => {
    await removeFixtureUsers();
    const qaAfter = await snapshotQaItemQuantities();
    for (const [name, qty] of qaBefore) {
      assert.equal(qaAfter.get(name), qty, `QA seed item ${name} must not change during integration tests`);
    }
  });

  const fixture = await createFixtureItem();

  const staff = await createFixtureUser({
    roleName: 'Full-time Lab Worker',
    email: `staff-${FIXTURE_TAG}@example.com`,
  });
  const student = await createFixtureUser({
    roleName: 'Student Worker',
    email: `student-${FIXTURE_TAG}@example.com`,
  });
  const adminA = await createFixtureUser({
    roleName: 'Admin',
    email: `admin-a-${FIXTURE_TAG}@example.com`,
  });
  const adminB = await createFixtureUser({
    roleName: 'Admin',
    email: `admin-b-${FIXTURE_TAG}@example.com`,
  });

  const { server, base, cookieName } = await startTestServer();

  try {
    const staffLogin = await login(base, cookieName, staff.email, staff.password);
    assert.equal(staffLogin.res.status, 200);
    assert.ok(staffLogin.sessionCookie);
    assert.ok(staffLogin.csrf);

    const studentLogin = await login(base, cookieName, student.email, student.password);
    const student403 = await apiJson(base, '/admin/users', {
      cookie: studentLogin.sessionCookie,
      csrf: studentLogin.csrf,
    });
    assert.equal(student403.res.status, 403);

    const getItem = await apiJson(base, `/items?areaId=${fixture.AreaID}`, {
      cookie: staffLogin.sessionCookie,
    });
    assert.equal(getItem.res.status, 200);
    const listItem = getItem.json.items.find((i) => i.itemId === fixture.ItemID);
    const rv = listItem?.rowVersion;
    assert.ok(rv);

    const qtyBefore = listItem.quantityOnHand;
    const putPreserveQty = await apiJson(base, `/items/${fixture.ItemID}`, {
      method: 'PUT',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: {
        itemName: listItem.itemName,
        categoryId: listItem.categoryId,
        areaId: listItem.areaId,
        quantityOnHand: qtyBefore + 99,
        reorderLevel: listItem.reorderLevel,
        notes: listItem.notes,
        rowVersion: rv,
      },
    });
    assert.equal(putPreserveQty.res.status, 200);
    assert.equal(putPreserveQty.json.quantityOnHand, qtyBefore);

    const putNoRv = await apiJson(base, `/items/${fixture.ItemID}`, {
      method: 'PUT',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: {
        itemName: listItem.itemName,
        categoryId: listItem.categoryId,
        areaId: listItem.areaId,
        reorderLevel: listItem.reorderLevel,
        notes: listItem.notes,
      },
    });
    assert.equal(putNoRv.res.status, 400);

    const stalePut = await apiJson(base, `/items/${fixture.ItemID}`, {
      method: 'PUT',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: {
        itemName: listItem.itemName,
        categoryId: listItem.categoryId,
        areaId: listItem.areaId,
        reorderLevel: listItem.reorderLevel,
        notes: 'stale',
        rowVersion: rv,
      },
    });
    assert.equal(stalePut.res.status, 409);

    const afterPut = await apiJson(base, `/items?areaId=${fixture.AreaID}`, {
      cookie: staffLogin.sessionCookie,
    });
    const freshRv = afterPut.json.items.find((i) => i.itemId === fixture.ItemID).rowVersion;

    const qtyAdj = await apiJson(base, `/items/${fixture.ItemID}/quantity`, {
      method: 'POST',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: { delta: 1, notes: `it-${FIXTURE_TAG}` },
    });
    assert.equal(qtyAdj.res.status, 200);
    assert.equal(qtyAdj.json.quantityOnHand, qtyBefore + 1);

    const qtyGet = await apiJson(base, `/items?areaId=${fixture.AreaID}`, {
      cookie: staffLogin.sessionCookie,
    });
    const persisted = qtyGet.json.items.find((i) => i.itemId === fixture.ItemID);
    assert.equal(persisted.quantityOnHand, qtyBefore + 1);

    const reqCreate = await apiJson(base, '/requests', {
      method: 'POST',
      cookie: studentLogin.sessionCookie,
      csrf: studentLogin.csrf,
      body: { itemId: fixture.ItemID, requestedQuantity: 1, reason: `need-${FIXTURE_TAG}` },
    });
    assert.equal(reqCreate.res.status, 201);
    const reqId = reqCreate.json.requestId;
    const reqRv = reqCreate.json.rowVersion;

    const adminLogin = await login(base, cookieName, adminA.email, adminA.password);
    const decision409 = await apiJson(base, `/requests/${reqId}/decision`, {
      method: 'PATCH',
      cookie: adminLogin.sessionCookie,
      csrf: adminLogin.csrf,
      body: { status: 'Approved', decisionNotes: 'ok', rowVersion: reqRv },
    });
    assert.equal(decision409.res.status, 200);

    const decisionStale = await apiJson(base, `/requests/${reqId}/decision`, {
      method: 'PATCH',
      cookie: adminLogin.sessionCookie,
      csrf: adminLogin.csrf,
      body: { status: 'Rejected', decisionNotes: 'late', rowVersion: reqRv },
    });
    assert.equal(decisionStale.res.status, 409);

    const profile = await apiJson(base, '/profile', {
      method: 'PUT',
      cookie: studentLogin.sessionCookie,
      csrf: studentLogin.csrf,
      body: { firstName: 'Pat', lastName: FIXTURE_TAG, phone: null },
    });
    assert.equal(profile.res.status, 200);
    assert.equal(profile.json.user.lastName, FIXTURE_TAG);

    const listForSpace = await apiJson(base, `/items?spaceId=${fixture.SpaceID}`, {
      cookie: staffLogin.sessionCookie,
    });
    assert.equal(listForSpace.res.status, 200);
    const listCount = listForSpace.json.items.length;

    const dash = await apiJson(base, `/dashboard/summary?spaceId=${fixture.SpaceID}`, {
      cookie: staffLogin.sessionCookie,
    });
    assert.equal(dash.res.status, 200);
    assert.ok(dash.json.totals);
    assert.equal(dash.json.totals.itemRecordCount, listCount);

    const newArea = await apiJson(base, '/areas', {
      method: 'POST',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: { spaceId: fixture.SpaceID, areaName: `Tmp-${FIXTURE_TAG}` },
    });
    assert.equal(newArea.res.status, 201);
    registerFixtureAreaId(newArea.json.areaId);
    const cat = await query('SELECT TOP 1 CategoryID FROM dbo.Categories');
    await query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.AreaCategories WHERE AreaID=@a AND CategoryID=@c)
       INSERT INTO dbo.AreaCategories (AreaID, CategoryID) VALUES (@a, @c)`,
      { a: newArea.json.areaId, c: cat.recordset[0].CategoryID },
    );
    const delArea = await apiJson(base, `/areas/${newArea.json.areaId}`, {
      method: 'DELETE',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
    });
    assert.equal(delArea.res.status, 204);

    const adminsBefore = await query(
      `SELECT COUNT(*) AS c FROM dbo.Users u
       INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
       WHERE ro.RoleName = N'Admin' AND u.IsActive = 1`,
    );
    const adminCountBefore = Number(adminsBefore.recordset[0].c);

    const demoteB = await apiJson(base, `/admin/users/${adminB.userId}`, {
      method: 'PUT',
      cookie: adminLogin.sessionCookie,
      csrf: adminLogin.csrf,
      body: {
        firstName: 'Int',
        lastName: FIXTURE_TAG,
        email: adminB.email,
        phone: '',
        role: 'Student Worker',
        isActive: true,
      },
    });
    assert.equal(demoteB.res.status, 204);

    const adminsAfter = await query(
      `SELECT COUNT(*) AS c FROM dbo.Users u
       INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
       WHERE ro.RoleName = N'Admin' AND u.IsActive = 1`,
    );
    const adminCountAfter = Number(adminsAfter.recordset[0].c);
    assert.equal(adminCountAfter, adminCountBefore - 1);

    if (adminCountAfter <= 1) {
      const lastAdminBlock = await apiJson(base, `/admin/users/${adminA.userId}`, {
        method: 'PUT',
        cookie: adminLogin.sessionCookie,
        csrf: adminLogin.csrf,
        body: {
          firstName: 'Int',
          lastName: FIXTURE_TAG,
          email: adminA.email,
          phone: '',
          role: 'Student Worker',
          isActive: true,
        },
      });
      assert.equal(lastAdminBlock.res.status, 400);
    }

    const badPwd = await apiJson(base, `/admin/users/${adminA.userId}`, {
      method: 'PUT',
      cookie: adminLogin.sessionCookie,
      csrf: adminLogin.csrf,
      body: {
        firstName: 'Int',
        lastName: FIXTURE_TAG,
        email: adminA.email,
        phone: '',
        role: 'Admin',
        isActive: true,
        password: 'short',
      },
    });
    assert.equal(badPwd.res.status, 400);

    const delStale = await apiJson(base, `/items/${fixture.ItemID}`, {
      method: 'DELETE',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: { rowVersion: freshRv },
    });
    if (delStale.res.status === 409) {
      const cur = await apiJson(base, `/items?areaId=${fixture.AreaID}`, { cookie: staffLogin.sessionCookie });
      const curRv = cur.json.items.find((i) => i.itemId === fixture.ItemID)?.rowVersion;
      assert.ok(curRv);
    }
  } finally {
    server.close();
  }
});

test('integration: item delete requires rowVersion', { skip: !runIntegration }, async (t) => {
  const qaBefore = await snapshotQaItemQuantities();
  t.after(async () => {
    await removeFixtureUsers();
    const qaAfter = await snapshotQaItemQuantities();
    for (const [name, qty] of qaBefore) {
      assert.equal(qaAfter.get(name), qty);
    }
  });
  const fixture = await createFixtureItem();
  const staff = await createFixtureUser({
    roleName: 'Full-time Lab Worker',
    email: `staff-del-${FIXTURE_TAG}@example.com`,
  });
  const { server, base, cookieName } = await startTestServer();
  try {
    const staffLogin = await login(base, cookieName, staff.email, staff.password);
    const del = await apiJson(base, `/items/${fixture.ItemID}`, {
      method: 'DELETE',
      cookie: staffLogin.sessionCookie,
      csrf: staffLogin.csrf,
      body: {},
    });
    assert.equal(del.res.status, 400);
  } finally {
    server.close();
  }
});