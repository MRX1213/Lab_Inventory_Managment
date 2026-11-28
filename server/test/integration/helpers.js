import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { hashPassword } from '../../src/lib/password.js';
import { query, getPool } from '../../src/db/pool.js';

export const FIXTURE_TAG = `it-${Date.now().toString(36)}`;

export const KNOWN_QA_ITEM_NAMES = [
  'Makerspace PLA Black',
  'Makerspace Resin Grey',
  'Cordless Drill',
];

const registered = {
  userIds: new Set(),
  itemIds: new Set(),
  areaIds: new Set(),
  emails: new Set(),
};

export function resetFixtureRegistry() {
  registered.userIds.clear();
  registered.itemIds.clear();
  registered.areaIds.clear();
  registered.emails.clear();
}

export function registerFixtureItemId(itemId) {
  if (itemId != null) registered.itemIds.add(Number(itemId));
}

export function registerFixtureAreaId(areaId) {
  if (areaId != null) registered.areaIds.add(Number(areaId));
}

export function registerFixtureUserId(userId, email) {
  if (userId != null) registered.userIds.add(Number(userId));
  if (email) registered.emails.add(String(email));
}

export async function startTestServer() {
  await getPool();
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}`, cookieName: config.cookieName };
}

export function parseSetCookie(setCookie) {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) return null;
  const [pair] = raw.split(';');
  const [name, value] = pair.split('=');
  return { name: name.trim(), value: value.trim() };
}

export async function apiJson(base, path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { res, json };
}

export async function login(base, cookieName, email, password) {
  const { res, json } = await apiJson(base, '/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const sc = parseSetCookie(res.headers.getSetCookie?.() ?? res.headers.get('set-cookie'));
  const sessionCookie = sc ? `${cookieName}=${sc.value}` : null;
  return { res, json, sessionCookie, csrf: json?.csrfToken };
}

export async function createFixtureUser({ roleName, email, password = 'TestPass123!' }) {
  const role = await query('SELECT RoleID FROM dbo.Roles WHERE RoleName=@n', { n: roleName });
  if (!role.recordset.length) throw new Error(`Missing role ${roleName}`);
  const hash = hashPassword(password);
  const ins = await query(
    `INSERT INTO dbo.Users (FirstName, LastName, Email, RoleID, PasswordHash, IsActive)
     OUTPUT INSERTED.UserID
     VALUES (@fn, @ln, @em, @rid, @hash, 1)`,
    {
      fn: 'Int',
      ln: FIXTURE_TAG,
      em: email,
      rid: role.recordset[0].RoleID,
      hash,
    },
  );
  const userId = ins.recordset[0].UserID;
  registerFixtureUserId(userId, email);
  return { userId, email, password, roleName };
}

export async function snapshotQaItemQuantities() {
  const r = await query(
    `SELECT ItemName, QuantityOnHand
     FROM dbo.Items
     WHERE ItemName IN (N'Makerspace PLA Black', N'Makerspace Resin Grey', N'Cordless Drill')`,
  );
  return new Map(r.recordset.map((row) => [row.ItemName, row.QuantityOnHand]));
}

const FIXTURE_ITEM_EXACT_NAME = () => `IT-Fixture-${FIXTURE_TAG}`;
const FIXTURE_AREA_EXACT_NAME = () => `Tmp-${FIXTURE_TAG}`;

export async function createFixtureItem() {
  const space = await query(
    `SELECT TOP 1 SpaceID FROM dbo.Spaces WHERE SpaceName = N'Makerspace' ORDER BY SpaceID`,
  );
  const area = await query(
    `SELECT TOP 1 AreaID FROM dbo.Areas
     WHERE AreaName = N'3D Printer Area' AND SpaceID = @sid ORDER BY AreaID`,
    { sid: space.recordset[0].SpaceID },
  );
  const category = await query(
    `SELECT CategoryID FROM dbo.Categories WHERE CategoryName = N'Filament' AND ParentCategoryID IS NULL`,
  );
  const itemName = FIXTURE_ITEM_EXACT_NAME();
  const ins = await query(
    `INSERT INTO dbo.Items (ItemName, CategoryID, AreaID, TrackingType, QuantityOnHand, ReorderLevel, Notes)
     OUTPUT INSERTED.ItemID, INSERTED.ItemName, INSERTED.QuantityOnHand, INSERTED.CategoryID, INSERTED.AreaID, INSERTED.RowVersion
     VALUES (@n, @c, @a, 'Bulk', @q, 1, @notes)`,
    {
      n: itemName,
      c: category.recordset[0].CategoryID,
      a: area.recordset[0].AreaID,
      q: 10,
      notes: `integration-${FIXTURE_TAG}`,
    },
  );
  const row = ins.recordset[0];
  registerFixtureItemId(row.ItemID);
  return {
    ItemID: row.ItemID,
    ItemName: row.ItemName,
    QuantityOnHand: row.QuantityOnHand,
    CategoryID: row.CategoryID,
    AreaID: row.AreaID,
    RowVersion: row.RowVersion,
    SpaceID: space.recordset[0].SpaceID,
  };
}

async function deleteFixtureSupplyRequests() {
  for (const itemId of registered.itemIds) {
    await query('DELETE FROM dbo.SupplyRequests WHERE ItemID=@id', { id: itemId });
  }
  for (const userId of registered.userIds) {
    await query(
      'DELETE FROM dbo.SupplyRequests WHERE RequestedByUserID=@id OR ReviewedByUserID=@id',
      { id: userId },
    );
  }
}

async function deleteFixtureInventoryLogs() {
  for (const itemId of registered.itemIds) {
    await query('DELETE FROM dbo.InventoryLogs WHERE ItemID=@id', { id: itemId });
  }
}

async function deleteFixtureItems() {
  for (const itemId of registered.itemIds) {
    await query('DELETE FROM dbo.Items WHERE ItemID=@id', { id: itemId });
  }
  await query('DELETE FROM dbo.Items WHERE ItemName=@n', { n: FIXTURE_ITEM_EXACT_NAME() });
}

async function deleteFixtureAreas() {
  for (const areaId of registered.areaIds) {
    await query('DELETE FROM dbo.AreaCategories WHERE AreaID=@id', { id: areaId });
    await query('DELETE FROM dbo.Areas WHERE AreaID=@id', { id: areaId });
  }
  const byName = await query('SELECT AreaID FROM dbo.Areas WHERE AreaName=@n', {
    n: FIXTURE_AREA_EXACT_NAME(),
  });
  for (const row of byName.recordset) {
    await query('DELETE FROM dbo.AreaCategories WHERE AreaID=@id', { id: row.AreaID });
    await query('DELETE FROM dbo.Areas WHERE AreaID=@id', { id: row.AreaID });
  }
}

async function deleteFixtureUsersAndSessions() {
  for (const userId of registered.userIds) {
    await query('DELETE FROM dbo.UserSessions WHERE UserID=@id', { id: userId });
    await query('DELETE FROM dbo.Users WHERE UserID=@id', { id: userId });
  }
  for (const email of registered.emails) {
    await query(
      `DELETE FROM dbo.UserSessions WHERE UserID IN (SELECT UserID FROM dbo.Users WHERE Email=@em)`,
      { em: email },
    );
    await query('DELETE FROM dbo.Users WHERE Email=@em', { em: email });
  }
}

export async function cleanupFixtureTestArtifacts() {
  await deleteFixtureSupplyRequests();
  await deleteFixtureInventoryLogs();
  await deleteFixtureItems();
  await deleteFixtureAreas();
  await deleteFixtureUsersAndSessions();
}

export async function removeFixtureUsers() {
  await cleanupFixtureTestArtifacts();
  resetFixtureRegistry();
}