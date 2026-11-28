import { Router } from 'express';
import { query } from '../db/pool.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { canReview, isAdmin, isStaff } from '../lib/rbac.js';
import {
  createSession,
  destroySession,
  requireCsrf,
  requireSession,
  sessionCookieOptions,
} from '../middleware/session.js';
import { config } from '../config.js';
import { wouldRemoveLastActiveAdmin, validateOptionalPassword } from '../lib/adminGuards.js';
import { requireRowVersion } from '../lib/rowVersion.js';
import { base64ToBuffer, rowVersionToBase64, userJson } from '../lib/serialize.js';

const router = Router();

async function categoryValidForArea(areaId, categoryId) {
  const r = await query(
    `SELECT CASE WHEN EXISTS (
      SELECT 1 FROM dbo.vw_ValidAreaCategories v
      WHERE v.AreaID = @areaId AND v.CategoryID = @catId
    ) THEN 1 ELSE 0 END AS ok`,
    { areaId, catId: categoryId },
  );
  return r.recordset[0]?.ok === 1;
}

function itemJson(row) {
  return {
    itemId: row.ItemID,
    itemName: row.ItemName,
    categoryId: row.CategoryID,
    areaId: row.AreaID,
    spaceId: row.SpaceID,
    quantityOnHand: row.QuantityOnHand,
    reorderLevel: row.ReorderLevel,
    trackingType: row.TrackingType,
    status: row.Status,
    notes: row.Notes ?? '',
    rowVersion: rowVersionToBase64(row.RowVersion),
  };
}

function requestJson(row) {
  return {
    requestId: row.RequestID,
    itemId: row.ItemID,
    itemNameSnapshot: row.ItemNameSnapshot,
    newItemName: row.NewItemName ?? '',
    requestedQuantity: row.Quantity,
    reason: row.Reason ?? '',
    status: row.Status,
    targetAreaId: row.TargetAreaID,
    requestedById: row.RequestedByUserID,
    createdAt: row.CreatedAt?.toISOString?.() ?? row.CreatedAt,
    decidedById: row.ReviewedByUserID,
    decidedAt: row.ReviewedAt ? row.ReviewedAt.toISOString?.() ?? row.ReviewedAt : null,
    decisionNotes: row.ReviewNotes ?? '',
    rowVersion: rowVersionToBase64(row.RowVersion),
  };
}

function requireStaff(req, res, next) {
  if (!isStaff(req.user.RoleName)) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.RoleName)) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
}

async function countActiveAdmins() {
  const r = await query(
    `SELECT COUNT(*) AS c FROM dbo.Users u
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
     WHERE ro.RoleName = N'Admin' AND u.IsActive = 1`,
  );
  return Number(r.recordset[0]?.c ?? 0);
}

// --- Auth ---
router.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required', code: 'VALIDATION_ERROR' });
  }
  const r = await query(
    `SELECT u.*, ro.RoleName FROM dbo.Users u
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
     WHERE LOWER(u.Email) = @email`,
    { email },
  );
  const row = r.recordset[0];
  if (!row || !row.IsActive || !row.PasswordHash || !verifyPassword(password, row.PasswordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password', code: 'AUTH_FAILED' });
  }
  const sess = await createSession(row.UserID);
  res.cookie(config.cookieName, sess.sessionId, sessionCookieOptions());
  return res.status(200).json({ user: userJson(row), csrfToken: sess.csrfToken });
});

router.post('/auth/logout', requireSession(), requireCsrf(), async (req, res) => {
  const sid = req.cookies?.[config.cookieName];
  await destroySession(sid);
  res.clearCookie(config.cookieName, { path: '/' });
  return res.status(204).send();
});

router.get('/auth/me', requireSession(), (req, res) => {
  res.json({ user: userJson(req.user), csrfToken: req.csrfToken });
});

// --- Profile ---
router.get('/profile', requireSession(), (req, res) => {
  res.json({ user: userJson(req.user) });
});

router.put('/profile', requireSession(), requireCsrf(), async (req, res) => {
  const firstName = String(req.body?.firstName || '').trim();
  const lastName = String(req.body?.lastName || '').trim();
  const phone = req.body?.phone == null ? null : String(req.body.phone).trim();
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Name fields required', code: 'VALIDATION_ERROR' });
  }
  await query(
    `UPDATE dbo.Users SET FirstName=@fn, LastName=@ln, Phone=@ph WHERE UserID=@id`,
    { fn: firstName, ln: lastName, ph: phone || null, id: req.user.UserID },
  );
  const r = await query(
    `SELECT u.*, ro.RoleName FROM dbo.Users u
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID WHERE u.UserID=@id`,
    { id: req.user.UserID },
  );
  res.json({ user: userJson(r.recordset[0]) });
});

router.post('/profile/password', requireSession(), requireCsrf(), async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
  }
  const r = await query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@id', { id: req.user.UserID });
  if (!verifyPassword(current, r.recordset[0]?.PasswordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect', code: 'VALIDATION_ERROR' });
  }
  await query('UPDATE dbo.Users SET PasswordHash=@h WHERE UserID=@id', {
    h: hashPassword(next),
    id: req.user.UserID,
  });
  res.status(204).send();
});

// --- Taxonomy ---
router.get('/spaces', requireSession(), async (_req, res) => {
  const r = await query('SELECT SpaceID AS spaceId, SpaceName AS spaceName FROM dbo.Spaces ORDER BY SpaceName');
  res.json({ spaces: r.recordset });
});

router.get('/areas', requireSession(), async (req, res) => {
  const spaceId = req.query.spaceId ? Number(req.query.spaceId) : null;
  let text = `
    SELECT a.AreaID AS areaId, a.SpaceID AS spaceId, a.AreaName AS areaName,
           d.DisplayLabel AS displayLabel,
           (SELECT COUNT(*) FROM dbo.Items i WHERE i.AreaID = a.AreaID) AS itemCount
    FROM dbo.Areas a
    JOIN dbo.vw_AreaDisplay d ON d.AreaID = a.AreaID`;
  const params = {};
  if (spaceId) {
    text += ' WHERE a.SpaceID = @spaceId';
    params.spaceId = spaceId;
  }
  text += ' ORDER BY d.DisplayLabel';
  res.json({ areas: (await query(text, params)).recordset });
});

router.get('/categories', requireSession(), async (_req, res) => {
  const cats = await query(
    `SELECT CategoryID AS categoryId, ParentCategoryID AS parentCategoryId, CategoryName AS categoryName
     FROM dbo.Categories ORDER BY CategoryName`,
  );
  const maps = await query('SELECT AreaID AS areaId, CategoryID AS categoryId FROM dbo.AreaCategories');
  const byCat = new Map();
  for (const m of maps.recordset) {
    if (!byCat.has(m.categoryId)) byCat.set(m.categoryId, []);
    byCat.get(m.categoryId).push(m.areaId);
  }
  res.json({
    categories: cats.recordset.map((c) => ({ ...c, mappedAreaIds: byCat.get(c.categoryId) || [] })),
  });
});

router.get('/area-categories', requireSession(), async (req, res) => {
  const areaId = req.query.areaId ? Number(req.query.areaId) : null;
  let text = 'SELECT AreaID AS areaId, CategoryID AS categoryId FROM dbo.AreaCategories';
  const params = {};
  if (areaId) {
    text += ' WHERE AreaID = @areaId';
    params.areaId = areaId;
  }
  res.json({ mappings: (await query(text, params)).recordset });
});

router.post('/categories', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const name = String(req.body?.categoryName || '').trim();
  const parentId = req.body?.parentCategoryId == null ? null : Number(req.body.parentCategoryId);
  if (!name) return res.status(400).json({ error: 'Name required', code: 'VALIDATION_ERROR' });
  const ins = await query(
    `INSERT INTO dbo.Categories (ParentCategoryID, CategoryName)
     OUTPUT INSERTED.CategoryID, INSERTED.ParentCategoryID, INSERTED.CategoryName
     VALUES (@p, @n)`,
    { p: parentId, n: name },
  );
  const row = ins.recordset[0];
  res.status(201).json({
    categoryId: row.CategoryID,
    parentCategoryId: row.ParentCategoryID,
    categoryName: row.CategoryName,
    mappedAreaIds: [],
  });
});

router.put('/categories/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.categoryName || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required', code: 'VALIDATION_ERROR' });
  await query('UPDATE dbo.Categories SET CategoryName=@n WHERE CategoryID=@id', { n: name, id });
  res.json({ categoryId: id, categoryName: name });
});

router.delete('/categories/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const child = await query('SELECT 1 FROM dbo.Categories WHERE ParentCategoryID=@id', { id });
  if (child.recordset.length) {
    return res.status(400).json({ error: 'Delete subgroups first', code: 'VALIDATION_ERROR' });
  }
  const items = await query('SELECT 1 FROM dbo.Items WHERE CategoryID=@id', { id });
  if (items.recordset.length) {
    return res.status(400).json({ error: 'Category has items', code: 'VALIDATION_ERROR' });
  }
  await query('DELETE FROM dbo.AreaCategories WHERE CategoryID=@id', { id });
  await query('DELETE FROM dbo.Categories WHERE CategoryID=@id', { id });
  res.status(204).send();
});

router.put('/area-categories', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const areaId = Number(req.body?.areaId);
  const categoryId = Number(req.body?.categoryId);
  const action = req.body?.action === 'unmap' ? 'unmap' : 'map';
  if (!areaId || !categoryId) {
    return res.status(400).json({ error: 'areaId and categoryId required', code: 'VALIDATION_ERROR' });
  }
  if (action === 'map') {
    await query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.AreaCategories WHERE AreaID=@a AND CategoryID=@c)
       INSERT INTO dbo.AreaCategories (AreaID, CategoryID) VALUES (@a, @c)`,
      { a: areaId, c: categoryId },
    );
  } else {
    await query('DELETE FROM dbo.AreaCategories WHERE AreaID=@a AND CategoryID=@c', { a: areaId, c: categoryId });
  }
  const maps = await query('SELECT AreaID AS areaId, CategoryID AS categoryId FROM dbo.AreaCategories WHERE AreaID=@a', {
    a: areaId,
  });
  res.json({ mappings: maps.recordset });
});

router.post('/areas', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const spaceId = Number(req.body?.spaceId);
  const areaName = String(req.body?.areaName || '').trim();
  if (!spaceId || !areaName) {
    return res.status(400).json({ error: 'spaceId and areaName required', code: 'VALIDATION_ERROR' });
  }
  const ins = await query(
    `INSERT INTO dbo.Areas (SpaceID, AreaName) OUTPUT INSERTED.* VALUES (@s, @n)`,
    { s: spaceId, n: areaName },
  );
  const row = ins.recordset[0];
  res.status(201).json({ areaId: row.AreaID, spaceId: row.SpaceID, areaName: row.AreaName });
});

router.put('/areas/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const areaName = String(req.body?.areaName || '').trim();
  if (!areaName) return res.status(400).json({ error: 'areaName required', code: 'VALIDATION_ERROR' });
  await query('UPDATE dbo.Areas SET AreaName=@n WHERE AreaID=@id', { n: areaName, id });
  res.json({ areaId: id, areaName });
});

router.delete('/areas/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const items = await query('SELECT 1 FROM dbo.Items WHERE AreaID=@id', { id });
  if (items.recordset.length) {
    return res.status(400).json({ error: 'Area has items', code: 'VALIDATION_ERROR' });
  }
  await query('DELETE FROM dbo.AreaCategories WHERE AreaID=@id', { id });
  await query('DELETE FROM dbo.Areas WHERE AreaID=@id', { id });
  res.status(204).send();
});

// --- Items ---
router.get('/items', requireSession(), async (req, res) => {
  const spaceId = req.query.spaceId ? Number(req.query.spaceId) : null;
  const areaId = req.query.areaId ? Number(req.query.areaId) : null;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const stock = String(req.query.stock || 'all');
  const q = req.query.q ? String(req.query.q).trim() : null;

  const text = `
    ;WITH CategoryDescendants AS (
      SELECT c.CategoryID, c.CategoryID AS RootID
      FROM dbo.Categories c
      WHERE @categoryId IS NOT NULL AND c.CategoryID = @categoryId
      UNION ALL
      SELECT ch.CategoryID, cd.RootID
      FROM CategoryDescendants cd
      INNER JOIN dbo.Categories ch ON ch.ParentCategoryID = cd.CategoryID
    )
    SELECT i.*, a.SpaceID
    FROM dbo.Items i
    INNER JOIN dbo.Areas a ON a.AreaID = i.AreaID
    WHERE (@spaceId IS NULL OR a.SpaceID = @spaceId)
      AND (@areaId IS NULL OR i.AreaID = @areaId)
      AND EXISTS (
        SELECT 1 FROM dbo.vw_ValidAreaCategories v
        WHERE v.AreaID = i.AreaID AND v.CategoryID = i.CategoryID
      )
      AND (
        @categoryId IS NULL
        OR EXISTS (SELECT 1 FROM CategoryDescendants d WHERE d.CategoryID = i.CategoryID)
      )
      AND (
        @stock = 'all'
        OR (@stock = 'out' AND i.QuantityOnHand = 0)
        OR (@stock = 'low' AND i.QuantityOnHand > 0 AND i.ReorderLevel IS NOT NULL AND i.QuantityOnHand <= i.ReorderLevel)
      )
      AND (@q IS NULL OR i.ItemName LIKE N'%' + @q + N'%')
    ORDER BY i.ItemName
    OPTION (MAXRECURSION 32)`;

  const r = await query(text, {
    spaceId: spaceId ?? null,
    areaId: areaId ?? null,
    categoryId: categoryId ?? null,
    stock,
    q,
  });
  res.json({ items: r.recordset.filter((row) => true).map(itemJson) });
});

router.post('/items', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const itemName = String(req.body?.itemName || '').trim();
  const categoryId = Number(req.body?.categoryId);
  const areaId = Number(req.body?.areaId);
  const qty = Number(req.body?.quantityOnHand ?? 0);
  const reorderLevel = req.body?.reorderLevel == null || req.body?.reorderLevel === '' ? null : Number(req.body.reorderLevel);
  const notes = String(req.body?.notes || '').trim();
  if (!itemName || !categoryId || !areaId || qty < 0) {
    return res.status(400).json({ error: 'Invalid item fields', code: 'VALIDATION_ERROR' });
  }
  if (!(await categoryValidForArea(areaId, categoryId))) {
    return res.status(400).json({
      error: 'Category not mapped to this area',
      code: 'VALIDATION_ERROR',
      fields: { areaId: 'Category not mapped to this area' },
    });
  }
  const ins = await query(
    `INSERT INTO dbo.Items (ItemName, CategoryID, AreaID, TrackingType, QuantityOnHand, ReorderLevel, Notes)
     OUTPUT INSERTED.ItemID AS id VALUES (@n, @c, @a, 'Bulk', @q, @rl, @notes)`,
    { n: itemName, c: categoryId, a: areaId, q: qty, rl: reorderLevel, notes: notes || null },
  );
  const newId = ins.recordset[0].id;
  const r = await query(
    `SELECT i.*, a.SpaceID FROM dbo.Items i INNER JOIN dbo.Areas a ON a.AreaID = i.AreaID WHERE i.ItemID=@id`,
    { id: newId },
  );
  res.status(201).json(itemJson(r.recordset[0]));
});

router.put('/items/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const itemName = String(req.body?.itemName || '').trim();
  const categoryId = Number(req.body?.categoryId);
  const areaId = Number(req.body?.areaId);
  const reorderLevel = req.body?.reorderLevel == null || req.body?.reorderLevel === '' ? null : Number(req.body.reorderLevel);
  const notes = String(req.body?.notes || '').trim();
  const parsedRv = requireRowVersion(req.body?.rowVersion);
  if (!parsedRv.ok) {
    return res.status(400).json({ error: parsedRv.error, code: 'VALIDATION_ERROR' });
  }
  if (!itemName || !categoryId || !areaId) {
    return res.status(400).json({ error: 'Invalid item fields', code: 'VALIDATION_ERROR' });
  }
  if (!(await categoryValidForArea(areaId, categoryId))) {
    return res.status(400).json({ error: 'Category not mapped to this area', code: 'VALIDATION_ERROR' });
  }
  const chk = await query(
    `UPDATE dbo.Items SET ItemName=@n, CategoryID=@c, AreaID=@a, ReorderLevel=@rl, Notes=@notes
     WHERE ItemID=@id AND RowVersion=@rv`,
    { n: itemName, c: categoryId, a: areaId, rl: reorderLevel, notes: notes || null, id, rv: parsedRv.buffer },
  );
  if (!chk.rowsAffected[0]) {
    return res.status(409).json({ error: 'Conflict or not found', code: 'CONFLICT' });
  }
  const r = await query(
    `SELECT i.*, a.SpaceID FROM dbo.Items i INNER JOIN dbo.Areas a ON a.AreaID = i.AreaID WHERE i.ItemID=@id`,
    { id },
  );
  res.json(itemJson(r.recordset[0]));
});

router.delete('/items/:id', requireSession(), requireCsrf(), requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const parsedRv = requireRowVersion(req.body?.rowVersion);
  if (!parsedRv.ok) {
    return res.status(400).json({ error: parsedRv.error, code: 'VALIDATION_ERROR' });
  }
  const del = await query(
    `DELETE FROM dbo.Items OUTPUT DELETED.ItemID WHERE ItemID=@id AND RowVersion=@rv`,
    { id, rv: parsedRv.buffer },
  );
  if (!del.recordset.length) return res.status(409).json({ error: 'Conflict or not found', code: 'CONFLICT' });
  res.status(204).send();
});

router.post('/items/:id/quantity', requireSession(), requireCsrf(), async (req, res) => {
  const id = Number(req.params.id);
  const delta = Number(req.body?.delta);
  const notes = String(req.body?.notes || '').trim() || null;
  if (!Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ error: 'Invalid delta', code: 'VALIDATION_ERROR' });
  }
  try {
    await query('EXEC dbo.usp_AdjustItemQuantity @ItemID=@id, @UserID=@uid, @Change=@d, @Notes=@notes', {
      id,
      uid: req.user.UserID,
      d: delta,
      notes,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Quantity change failed', code: 'VALIDATION_ERROR' });
  }
  const r = await query(
    `SELECT i.*, a.SpaceID FROM dbo.Items i INNER JOIN dbo.Areas a ON a.AreaID = i.AreaID WHERE i.ItemID=@id`,
    { id },
  );
  res.json(itemJson(r.recordset[0]));
});

// --- Supply requests ---
router.get('/requests', requireSession(), async (req, res) => {
  const areaId = req.query.areaId ? Number(req.query.areaId) : null;
  const spaceId = req.query.spaceId ? Number(req.query.spaceId) : null;
  const statusFilter = req.query.status ? String(req.query.status) : null;
  const reviewer = canReview(req.user.RoleName);
  const viewerId = req.user.UserID;

  let scopeWhere = ' WHERE 1=1 ';
  const params = { viewerId };
  if (!reviewer) {
    scopeWhere += ' AND sr.RequestedByUserID = @viewerId ';
  }
  if (areaId) {
    scopeWhere += ' AND sr.TargetAreaID = @areaId ';
    params.areaId = areaId;
  }
  if (spaceId) {
    scopeWhere += ' AND EXISTS (SELECT 1 FROM dbo.Areas a WHERE a.AreaID = sr.TargetAreaID AND a.SpaceID = @spaceId) ';
    params.spaceId = spaceId;
  }

  const summarySql = `
    SELECT
      SUM(CASE WHEN sr.Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN sr.Status = 'Approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN sr.Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected
    FROM dbo.SupplyRequests sr ${scopeWhere}`;

  const listSql = `
    SELECT sr.*, ru.Email AS RequestedByEmail, du.Email AS DecidedByEmail
    FROM dbo.SupplyRequests sr
    INNER JOIN dbo.Users ru ON ru.UserID = sr.RequestedByUserID
    LEFT JOIN dbo.Users du ON du.UserID = sr.ReviewedByUserID
    ${scopeWhere}
    ${statusFilter ? ' AND sr.Status = @statusFilter ' : ''}
    ORDER BY sr.CreatedAt DESC`;

  if (statusFilter) params.statusFilter = statusFilter;

  const summary = await query(summarySql, params);
  const list = await query(listSql, params);
  const s = summary.recordset[0] || {};
  res.json({
    summary: {
      pending: s.pending ?? 0,
      approved: s.approved ?? 0,
      rejected: s.rejected ?? 0,
    },
    requests: list.recordset.map((row) => ({
      ...requestJson(row),
      requestedByEmail: row.RequestedByEmail,
      decidedByEmail: row.DecidedByEmail ?? '',
    })),
  });
});

router.post('/requests', requireSession(), requireCsrf(), async (req, res) => {
  const itemId = req.body?.itemId == null ? null : Number(req.body.itemId);
  const newItemName = String(req.body?.newItemName || '').trim();
  const qty = Number(req.body?.requestedQuantity);
  const reason = String(req.body?.reason || '').trim();
  const clientArea = Number(req.body?.targetAreaId);
  if (!Number.isInteger(qty) || qty < 1 || !reason) {
    return res.status(400).json({ error: 'Invalid request', code: 'VALIDATION_ERROR' });
  }
  let snap;
  let targetAreaId;
  let newName = '';
  if (itemId) {
    const it = await query('SELECT ItemName, AreaID FROM dbo.Items WHERE ItemID=@id', { id: itemId });
    if (!it.recordset.length) return res.status(400).json({ error: 'Item not found', code: 'VALIDATION_ERROR' });
    snap = it.recordset[0].ItemName;
    targetAreaId = it.recordset[0].AreaID;
  } else {
    if (!newItemName || !clientArea) {
      return res.status(400).json({ error: 'New item needs name and target area', code: 'VALIDATION_ERROR' });
    }
    snap = newItemName;
    targetAreaId = clientArea;
    newName = newItemName;
  }
  const ins = await query(
    `INSERT INTO dbo.SupplyRequests (
      RequestedByUserID, ItemID, ItemNameSnapshot, NewItemName, TargetAreaID, Quantity, Reason
    ) OUTPUT INSERTED.*
    VALUES (@uid, @itemId, @snap, @newName, @area, @qty, @reason)`,
    {
      uid: req.user.UserID,
      itemId: itemId ?? null,
      snap,
      newName: itemId ? null : newName,
      area: targetAreaId,
      qty,
      reason,
    },
  );
  res.status(201).json(requestJson(ins.recordset[0]));
});

router.patch('/requests/:id/decision', requireSession(), requireCsrf(), async (req, res) => {
  if (!canReview(req.user.RoleName)) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  const notes = String(req.body?.decisionNotes || '').trim();
  const rv = base64ToBuffer(req.body?.rowVersion);
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });
  }
  if (!rv || rv.length !== 8) {
    return res.status(400).json({ error: 'Invalid rowVersion', code: 'VALIDATION_ERROR' });
  }
  const exists = await query('SELECT 1 FROM dbo.SupplyRequests WHERE RequestID=@id', { id });
  if (!exists.recordset.length) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const upd = await query(
    `UPDATE dbo.SupplyRequests
     SET Status=@status, ReviewedByUserID=@uid, ReviewNotes=@notes, ReviewedAt=SYSUTCDATETIME()
     OUTPUT INSERTED.*
     WHERE RequestID=@id AND Status='Pending' AND RowVersion=@rv`,
    { status, uid: req.user.UserID, notes, id, rv },
  );
  if (!upd.recordset.length) return res.status(409).json({ error: 'Conflict', code: 'CONFLICT' });
  res.json(requestJson(upd.recordset[0]));
});

// --- Dashboard & logs ---
router.get('/dashboard/summary', requireSession(), async (req, res) => {
  const spaceId = req.query.spaceId ? Number(req.query.spaceId) : null;
  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId required', code: 'VALIDATION_ERROR' });
  }
  const areas = await query(
    `SELECT a.AreaID AS areaId, a.AreaName AS areaName,
       COUNT(i.ItemID) AS itemRecordCount,
       COALESCE(SUM(i.QuantityOnHand), 0) AS totalQuantity,
       COALESCE(SUM(CASE WHEN i.QuantityOnHand = 0 THEN 1 ELSE 0 END), 0) AS outOfStockItemCount,
       COALESCE(SUM(CASE WHEN i.QuantityOnHand > 0 AND i.ReorderLevel IS NOT NULL
         AND i.QuantityOnHand <= i.ReorderLevel THEN 1 ELSE 0 END), 0) AS lowStockItemCount
     FROM dbo.Areas a
     LEFT JOIN dbo.Items i ON i.AreaID = a.AreaID
       AND EXISTS (
         SELECT 1 FROM dbo.vw_ValidAreaCategories v
         WHERE v.AreaID = i.AreaID AND v.CategoryID = i.CategoryID
       )
     WHERE a.SpaceID = @spaceId
     GROUP BY a.AreaID, a.AreaName
     ORDER BY a.AreaName`,
    { spaceId },
  );
  const reviewer = canReview(req.user.RoleName);
  const reqScope = reviewer ? '' : ' AND sr.RequestedByUserID = @uid ';
  const pendingByArea = await query(
    `SELECT sr.TargetAreaID AS areaId, COUNT(*) AS cnt
     FROM dbo.SupplyRequests sr
     INNER JOIN dbo.Areas a ON a.AreaID = sr.TargetAreaID
     WHERE a.SpaceID = @spaceId AND sr.Status = 'Pending' ${reqScope}
     GROUP BY sr.TargetAreaID`,
    { spaceId, uid: req.user.UserID },
  );
  const pmap = new Map(pendingByArea.recordset.map((r) => [r.areaId, r.cnt]));
  const areaRows = areas.recordset.map((a) => ({
    ...a,
    pendingRequestCount: pmap.get(a.areaId) ?? 0,
  }));
  const totals = areaRows.reduce(
    (acc, a) => {
      acc.total += a.itemRecordCount;
      acc.low += a.lowStockItemCount;
      acc.out += a.outOfStockItemCount;
      return acc;
    },
    { total: 0, low: 0, out: 0 },
  );
  const statusCounts = await query(
    `SELECT
       SUM(CASE WHEN sr.Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN sr.Status = 'Approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN sr.Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected
     FROM dbo.SupplyRequests sr
     INNER JOIN dbo.Areas a ON a.AreaID = sr.TargetAreaID
     WHERE a.SpaceID = @spaceId ${reqScope}`,
    { spaceId, uid: req.user.UserID },
  );
  const sc = statusCounts.recordset[0] || {};
  res.json({
    spaceId,
    areaId: req.query.areaId ? Number(req.query.areaId) : null,
    totals: { itemRecordCount: totals.total, lowStockItemCount: totals.low, outOfStockItemCount: totals.out },
    areas: areaRows,
    requestStatusCounts: {
      pending: sc.pending ?? 0,
      approved: sc.approved ?? 0,
      rejected: sc.rejected ?? 0,
    },
  });
});

router.get('/inventory-logs', requireSession(), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const spaceId = req.query.spaceId ? Number(req.query.spaceId) : null;
  const r = await query(
    `SELECT TOP (@limit) l.LogID AS logId, l.ItemID AS itemId, i.ItemName AS itemName,
       l.LogType AS logType, l.Quantity AS quantity, l.LogDate AS logDate, l.Notes AS notes,
       u.FirstName + ' ' + u.LastName AS userName
     FROM dbo.InventoryLogs l
     INNER JOIN dbo.Items i ON i.ItemID = l.ItemID
     INNER JOIN dbo.Users u ON u.UserID = l.UserID
     INNER JOIN dbo.Areas a ON a.AreaID = i.AreaID
     WHERE (@spaceId IS NULL OR a.SpaceID = @spaceId)
     ORDER BY l.LogDate DESC`,
    { limit, spaceId: spaceId ?? null },
  );
  res.json({
    logs: r.recordset.map((row) => ({
      ...row,
      logDate: row.logDate?.toISOString?.() ?? row.logDate,
    })),
  });
});

// --- Admin users ---
router.get('/admin/users', requireSession(), requireAdmin, async (_req, res) => {
  const r = await query(
    `SELECT u.UserID AS userId, u.FirstName AS firstName, u.LastName AS lastName, u.Email AS email,
       u.Phone AS phone, ro.RoleName AS role, u.IsActive AS isActive, u.CreatedAt AS createdAt
     FROM dbo.Users u INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
     ORDER BY u.Email`,
  );
  res.json({
    users: r.recordset.map((u) => ({
      ...u,
      isActive: !!u.isActive,
      createdAt: u.createdAt?.toISOString?.()?.slice(0, 10) ?? u.createdAt,
    })),
  });
});

router.post('/admin/users', requireSession(), requireCsrf(), requireAdmin, async (req, res) => {
  const firstName = String(req.body?.firstName || '').trim();
  const lastName = String(req.body?.lastName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim();
  const roleName = String(req.body?.role || '').trim();
  const password = String(req.body?.password || '');
  if (!firstName || !email || !roleName || password.length < 8) {
    return res.status(400).json({ error: 'Invalid user fields', code: 'VALIDATION_ERROR' });
  }
  const role = await query('SELECT RoleID FROM dbo.Roles WHERE RoleName=@n', { n: roleName });
  if (!role.recordset.length) return res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' });
  try {
    const ins = await query(
      `INSERT INTO dbo.Users (FirstName, LastName, Email, RoleID, Phone, PasswordHash, IsActive)
       OUTPUT INSERTED.UserID VALUES (@fn, @ln, @em, @rid, @ph, @hash, 1)`,
      {
        fn: firstName,
        ln: lastName || '',
        em: email,
        rid: role.recordset[0].RoleID,
        ph: phone || null,
        hash: hashPassword(password),
      },
    );
    res.status(201).json({ userId: ins.recordset[0].UserID });
  } catch {
    return res.status(400).json({ error: 'Email may already exist', code: 'VALIDATION_ERROR' });
  }
});

router.put('/admin/users/:id', requireSession(), requireCsrf(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const firstName = String(req.body?.firstName || '').trim();
  const lastName = String(req.body?.lastName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim();
  const roleName = String(req.body?.role || '').trim();
  const isActive = req.body?.isActive !== false;
  const passwordErr = validateOptionalPassword(req.body?.password);
  if (passwordErr) {
    return res.status(400).json({ error: passwordErr, code: 'VALIDATION_ERROR' });
  }
  const password = req.body?.password ? String(req.body.password) : null;
  const role = await query('SELECT RoleID FROM dbo.Roles WHERE RoleName=@n', { n: roleName });
  if (!role.recordset.length) return res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' });
  const cur = await query(
    `SELECT u.IsActive, ro.RoleName FROM dbo.Users u
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID WHERE u.UserID=@id`,
    { id },
  );
  if (!cur.recordset.length) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const activeAdmins = await countActiveAdmins();
  const row = cur.recordset[0];
  if (
    wouldRemoveLastActiveAdmin({
      currentRoleName: row.RoleName,
      currentIsActive: !!row.IsActive,
      nextRoleName: roleName,
      nextIsActive: isActive,
      activeAdminCount: activeAdmins,
    })
  ) {
    return res.status(400).json({ error: 'Cannot demote or deactivate the last active admin', code: 'VALIDATION_ERROR' });
  }
  await query(
    `UPDATE dbo.Users SET FirstName=@fn, LastName=@ln, Email=@em, Phone=@ph, RoleID=@rid, IsActive=@active
     ${password && password.length >= 8 ? ', PasswordHash=@hash' : ''}
     WHERE UserID=@id`,
    {
      fn: firstName,
      ln: lastName || '',
      em: email,
      ph: phone || null,
      rid: role.recordset[0].RoleID,
      active: isActive ? 1 : 0,
      hash: password ? hashPassword(password) : undefined,
      id,
    },
  );
  res.status(204).send();
});

router.delete('/admin/users/:id', requireSession(), requireCsrf(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.UserID) {
    return res.status(400).json({ error: 'Cannot delete yourself', code: 'VALIDATION_ERROR' });
  }
  const cur = await query(
    `SELECT u.IsActive, ro.RoleName FROM dbo.Users u
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID WHERE u.UserID=@id`,
    { id },
  );
  if (!cur.recordset.length) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  const row = cur.recordset[0];
  const activeAdmins = await countActiveAdmins();
  if (
    wouldRemoveLastActiveAdmin({
      currentRoleName: row.RoleName,
      currentIsActive: !!row.IsActive,
      nextRoleName: row.RoleName,
      nextIsActive: false,
      activeAdminCount: activeAdmins,
    })
  ) {
    return res.status(400).json({ error: 'Cannot deactivate the last active admin', code: 'VALIDATION_ERROR' });
  }
  await query('UPDATE dbo.Users SET IsActive=0 WHERE UserID=@id', { id });
  res.status(204).send();
});

export default router;