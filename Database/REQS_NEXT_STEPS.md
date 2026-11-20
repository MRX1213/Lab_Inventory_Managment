# Lab Inventory — Database Next Steps

**Scope:** Actionable requirements for the **group** SQL Server database (`Database/LabInventory.sql`).  
**Does not replace:** `Database/REQS.txt`, `Front-end/REQS_V2.md`.  
**Companion doc:** `Front-end/REQS_NEXT_STEPS.md` (UI integration, same API contract and permission matrix).  
**Behavioral reference only:** Private prototype at `Lab_Invent_Mgnmnt_Private/server/app.js` (SQLite/Node) — patterns to learn from, **not** a mandate to port schema or runtime.

**Important:** T-SQL examples in this document are **design artifacts**. They have **not** been executed against SQL Server and are **not** claims that automated tests have been run.

---

## 1. Current baseline (group repository)

### 1.1 What exists today

| Object | File reference | Notes |
|--------|----------------|-------|
| `Roles`, `Users` | `Database/LabInventory.sql` L9–22 | Only `Admin` role seeded (L96). No `Student Worker` / `Full-time Lab Worker` rows. |
| `Spaces`, `Areas` | L24–35, L98–110 | Makerspace + Project Room; six areas including two distinct `Shelf` rows (different `SpaceID`). |
| `Categories` (tree) | L37–43, L113–138 | Parent/child via `ParentCategoryID`. Subcategories: Cables→HDMI/USB/Arduino; Wood→Plywood/Hardwood/Softwood/MDF. |
| `AreaCategories` | L45–50, L141–175 | **Many-to-many:** categories linked per area — **not** the private repo’s `groups.spaceId` root model. |
| `Items` | L52–73 | `QuantityOnHand`, `ReorderLevel`, `TrackingType`, `Status`. **No row-version column.** |
| `InventoryLogs` | L75–89 | Types: CheckOut, CheckIn, Consume, Restock, Adjust. |
| **No `SupplyRequests`** | — | Supply workflow exists only in front-end mocks. |

### 1.2 Operational gaps

1. **Destructive bootstrap:** Lines 1–4 run `USE Master; DROP DATABASE LabInventory` — unsuitable for shared/dev databases with data.
2. **Auth data model:** `Users` has no `PasswordHash`, `Phone`, or session tables — login cannot be implemented in T-SQL alone; hashing belongs in the **application layer** (same principle as private `server/app.js` L14–22).
3. **Seed typo:** L165 maps `'Length Measurement fSets'` — category seed uses `'Length Measurement Sets'` (L125). Join fails silently → **no** `AreaCategories` row for Length Measurement Sets in Side Shelves.
4. **UTC policy:** New columns should use `DATETIME2` + `SYSUTCDATETIME()`. Existing `CreatedAt`/`LogDate` defaults use `SYSDATETIME()` — **do not assume** historical rows are UTC when displaying.

### 1.3 Taxonomy semantics (retain vs private prototype)

| Concept | Group (SQL Server) | Private prototype | Team decision |
|---------|-------------------|-------------------|---------------|
| Space | `Spaces` | `spaces` | Same names; keep. |
| Location | `Areas` (per space) | `locations` | FE label **Location**; DB name **Areas** — keep both terms documented. |
| Group / subgroup | `Categories` + `AreaCategories` | `groups` with `spaceId` on roots | **Keep M:M mapping.** Do not collapse to private’s space-scoped root groups without lead signoff. |
| Shared category (e.g. **Saws**) | Two root mappings: `Project Room` + `Shelf` (L160) and `Project Room` + `Wood Cutting Station` (L170) | Duplicate group names under locations | Valid in group model via multiple `AreaCategories` rows; child categories inherit via §1.4 **any-ancestor** rule — no extra `AreaCategories` rows required per child. |
| Duplicate area name **Shelf** | Two rows, distinguished by `SpaceID` | Disambiguated display names in private seed | FE must show **contextual labels** (e.g. “Makerspace — Shelf”, “Project Room — Shelf”) without renaming DB rows unless lead approves. |
| Side Shelves | `Side Shelves` area name | `Side Shelves (Project Room)` in private | Display label only on FE; optional future `DisplayName` column — **not required for MVP**. |

### 1.4 Category / area mapping inheritance (agreed rule for SQL + API)

When filtering items by **area A** and **category C**:

1. If `C` is mapped to `A` in `AreaCategories`, it is valid.
2. If `C` is a **child** category, it is valid if **any ancestor** (walk `ParentCategoryID` up to root) is mapped to `A`.
3. If no ancestor is mapped, the category is **not valid** for that area (API returns validation error on item create/move; filter returns empty set with explicit UI message).

Subcategory items use their **leaf** `CategoryID` on `Items`; mapping is always evaluated via ancestor chain — no duplicate `AreaCategories` rows required per child unless team later chooses explicit child mappings for clarity in admin UI.

---

## 2. MVP permission matrix (requires lead signoff)

Derived from group prototype behavior (`Front-end/js/current-user.js`, `Inventory.js`) and `Front-end/REQS_V2.md`, reconciled with prototype limits (students: qty +/- only on inventory; staff CRUD).

| Capability | Student Worker | Full-time Lab Worker | Admin |
|------------|----------------|----------------------|-------|
| Login / logout / view own profile | Yes | Yes | Yes |
| Browse inventory (all spaces) | Yes | Yes | Yes |
| Item qty +/- (audited) | Yes | Yes | Yes |
| Item / taxonomy / area CRUD | No | Yes | Yes |
| Create supply request (own) | Yes | Yes | Yes |
| View supply requests | Own only | All + review | All + review |
| Approve / reject requests | No | Yes | Yes |
| User management | No | No | Yes |
| Dashboard / counts | Scoped per API rules (see §7) | Same | Same |

**Authority:** Server enforces all gates; front-end `data-roles` is cosmetic. Inactive users (`Users.IsActive = 0`) must fail login and invalidate sessions.

**Note on `REQS_V2`:** Original text suggests all users may add/edit/delete items; **MVP follows the working prototype** (staff-only item/taxonomy CRUD). Document deviation for lead approval.

---

## 3. Prioritized deliverables

### P0 — blocking integration

| ID | Deliverable | Depends on | Acceptance |
|----|-------------|------------|------------|
| **DB-P0-01** | Non-destructive migration script: `LabInventory_Migrate_001.sql` (CREATE/ALTER only; no DROP DATABASE) | — | Fresh DB + existing DB both apply cleanly; idempotent where possible. |
| **DB-P0-02** | Separate **disposable** reset script: `LabInventory_Reset_Dev.sql` (optional DROP) | DB-P0-01 | Documented “dev only”; never run in production path. |
| **DB-P0-03** | Seed roles: `Admin`, `Full-time Lab Worker`, `Student Worker` | DB-P0-01 | Three rows in `Roles`; matches FE `ROLES` strings in `current-user.js` L10–14. |
| **DB-P0-04** | Extend `Users`: `Phone NVARCHAR(40) NULL`, optional `PasswordHash` **or** defer hash to app-only store — **hashing not in T-SQL** | DB-P0-01 | App can persist verifier; inactive flag honored. |
| **DB-P0-05** | `SupplyRequests` table + indexes + FKs | DB-P0-01 | Contract in §4; statuses constrained. |
| **DB-P0-06** | Fix seed typo `Length Measurement fSets` → `Length Measurement Sets` | DB-P0-02 or data patch | `AreaCategories` row exists for Side Shelves + Length Measurement Sets. |
| **DB-P0-07** | Documented category inheritance rule (§1.4) in API spec | — | Same rule referenced in FE doc; filter queries use it. |

### P1 — quality, concurrency, ops

| ID | Deliverable | Depends on | Acceptance |
|----|-------------|------------|------------|
| **DB-P1-01** | Optional `Items.RowVersion ROWVERSION` (or explicit `Version INT`) for optimistic concurrency | DB-P0-01 | Documented in API for PUT/DELETE/qty; aligns with private `version` pattern. |
| **DB-P1-02** | Session table (or document external session store) | DB-P0-04 | Login/logout CSRF-ready design. |
| **DB-P1-03** | History retention / soft-delete policy for users & requests | Lead policy | Written in runbook; implementation in app layer. |
| **DB-P1-04** | Index review: `SupplyRequests(Status, TargetAreaID)`, `Items(AreaID, CategoryID)` | DB-P0-05 | Query plans sane for dashboard scoped counts. |

**Front-end dependencies:** FE-P0-* / Phase-1 tasks in `Front-end/REQS_NEXT_STEPS.md` map to API endpoints in §8.

**API / backend (separate track — not in this repo today):** There is **no** public HTTP backend in the group repository. Schema and T-SQL live under `Database/`; integration is blocked on a new **API service** (separate tickets below). The private Node prototype (`Lab_Invent_Mgnmnt_Private/server/app.js`) is **reference only** — not deployable as group MVP without new hosting and SQL Server wiring.

| ID | Deliverable | Depends on | Notes |
|----|-------------|------------|-------|
| **API-P0-01** | Session auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | DB-P0-03, DB-P0-04, DB-P0-02 (users seed) | HttpOnly cookie; CSRF token in `me` response |
| **API-P0-02** | Read taxonomy: spaces, areas, categories, area-categories | DB-P0-01 | Category tree + `mappedAreaIds[]`; inheritance rule §1.4 enforced on writes |
| **API-P0-03** | Items CRUD + audited `POST /api/items/:id/quantity` | DB-P0-01, matrix §2 | Staff-only create/update/delete; §6.6 transaction pattern |
| **API-P0-04** | Supply requests list/create/decision | DB-P0-05 | §6.3–6.5; scoped counts §7 |
| **API-P0-05** | `GET /api/dashboard/summary` | API-P0-03, API-P0-04 | §6.2 semantics; empty areas included |
| **API-P0-06** | Profile: `GET /api/profile`, `PUT /api/profile` (own user) | DB-P0-04 | Same fields as `Users` + phone; admin user mgmt is separate admin routes (out of MVP table unless lead expands) |
| **API-P0-07** | Audit read: `GET /api/inventory-logs` (paginated, scoped) | DB-P0-01 | Powers dashboard “recent changes” (FE-P1-06) |
| **API-P0-08** | Category CRUD + `AreaCategories` map/unmap | DB-P0-01, matrix §2 | Staff: `POST/PUT/DELETE /api/categories`, `PUT /api/area-categories` (compact payloads) |
| **API-P0-09** | Area CRUD (within space) | DB-P0-01 | Staff: `POST/PUT/DELETE /api/areas` |
| **API-P0-10** | Admin users | DB-P0-04, matrix §2 | Admin: `GET/POST/PUT /api/admin/users` (activate/deactivate, role assign) |

---

## 4. Proposed `SupplyRequests` contract

```sql
-- PROPOSED — not applied in current LabInventory.sql
CREATE TABLE SupplyRequests (
    RequestID           INT IDENTITY(1,1) PRIMARY KEY,
    ItemID              INT NULL REFERENCES Items(ItemID),
    ItemNameSnapshot    NVARCHAR(150) NOT NULL,
    NewItemName         NVARCHAR(150) NOT NULL DEFAULT N'',
    RequestedQuantity   INT NOT NULL,
    Reason              NVARCHAR(4000) NOT NULL,
    RequestedByID       INT NOT NULL REFERENCES Users(UserID),
    CreatedAt           DATETIME2 NOT NULL CONSTRAINT DF_SupplyRequests_CreatedAt DEFAULT (SYSUTCDATETIME()),
    Status              VARCHAR(20) NOT NULL DEFAULT 'Pending'
                        CHECK (Status IN ('Pending','Approved','Rejected')),
  -- Future: 'Ordered','Received','Cancelled' — out of MVP
    DecidedByID         INT NULL REFERENCES Users(UserID),
    DecisionNotes       NVARCHAR(4000) NOT NULL DEFAULT N'',
    DecidedAt           DATETIME2 NULL,
    RowVersion          ROWVERSION NOT NULL,
    TargetAreaID        INT NOT NULL REFERENCES Areas(AreaID),
    CONSTRAINT CK_SupplyRequests_Qty_Positive CHECK (RequestedQuantity >= 1),
    CONSTRAINT CK_SupplyRequests_Item_XOR CHECK (
        (ItemID IS NOT NULL AND NewItemName = N'') OR
        (ItemID IS NULL AND LEN(LTRIM(RTRIM(NewItemName))) > 0)
    ),
    CONSTRAINT CK_SupplyRequests_Pending_Decision CHECK (
        (Status = 'Pending' AND DecidedByID IS NULL AND DecidedAt IS NULL) OR
        (Status IN ('Approved','Rejected') AND DecidedByID IS NOT NULL AND DecidedAt IS NOT NULL)
    )
);
```

**Field rules:**

| Rule | Detail |
|------|--------|
| Existing vs new item | **XOR** on `ItemID` vs non-empty `NewItemName`. |
| `ItemNameSnapshot` | Always set at create: existing item’s current name, or `NewItemName` for new-item requests — **not** part of XOR. |
| `TargetAreaID` | **Required.** Existing item: copy/snapshot `Items.AreaID` at submit time (immune to later item moves). New item: client selects valid target area; server validates category rules if category provided later. |
| Quantity | Positive integer only; **may exceed** `QuantityOnHand` (approval is **not** restocking). |
| Actors / times | `RequestedByID`, `CreatedAt`, `DecidedByID`, `DecidedAt` set **only** from server session — never trust client. |
| Students | May insert rows where `RequestedByID = session user`; may not update others’ requests or decide. |
| Decision | Atomic `UPDATE ... WHERE Status = 'Pending' AND RowVersion = @expected`; 409 on stale/double review. |
| Approval | **Does not** increase inventory; optional future workflow only. |

---

## 5. Users, auth, and audit (application-layer)

1. **Password storage:** Use server framework hashing (e.g. scrypt/Argon2 + per-user salt), comparable to private `hashPassword` / `verifyPassword` (`server/app.js` L14–22). **Do not** add `HASHBYTES`/`PWDENCRYPT` expectations in T-SQL.
2. **Inactive accounts:** `Users.IsActive = 0` → login rejected; existing sessions revoked.
3. **Phone:** `NVARCHAR(40) NULL` for profile/user management (`REQS_V2`).
4. **Quantity changes:** Transaction: update `Items.QuantityOnHand`, insert `InventoryLogs`, check role (student allowed only audited delta per matrix). Roll back if log insert fails; `QuantityOnHand` cannot go negative.
5. **Deletion policy (propose for lead):** Users → soft-deactivate preferred over hard delete; supply requests retained for audit; items with logs → soft-retire or block delete if logs exist.

---

## 6. Parameterized T-SQL examples (UNEXECUTED)

### 6.1 Filtered inventory — recursive category tree + area mapping

**API query parameters (exact MVP subset):** `spaceId` (optional — omit = all spaces), `areaId` (optional), `categoryId` (optional — includes **descendants**), `stock` (`all` \| `low` \| `out`), `q` (optional name/SKU substring). Server maps these to the parameters below.

**Inheritance (consistent with §1.4):** An item’s leaf `CategoryID` is allowed in area `A` if **any ancestor** (walk `ParentCategoryID` to root, including self) appears in `AreaCategories` for `A`.

**Cycle safety:** Production data must not contain cyclic `ParentCategoryID` chains. Recursive CTEs use `OPTION (MAXRECURSION 32)`; exceeding the cap causes SQL Server to **throw** (error 530) — it does **not** silently truncate results. DBA migration should add a check or validator — app must reject admin edits that would create a cycle.

```sql
-- Parameters: @SpaceID INT NULL, @AreaID INT NULL, @CategoryID INT NULL,
--             @StockFilter VARCHAR(10) = 'all', @Search NVARCHAR(100) NULL

DECLARE @SpaceID INT = @p_SpaceID;
DECLARE @AreaID INT = @p_AreaID;
DECLARE @CategoryID INT = @p_CategoryID;
DECLARE @StockFilter VARCHAR(10) = ISNULL(@p_StockFilter, 'all');
DECLARE @Search NVARCHAR(100) = @p_Search;

;WITH CategoryAncestors AS (
    -- For every category node, enumerate self + all ancestors (recursive up)
    SELECT
        c.CategoryID AS LeafCategoryID,
        c.CategoryID AS AncestorCategoryID,
        0 AS Depth
    FROM Categories c
    UNION ALL
    SELECT
        ca.LeafCategoryID,
        p.CategoryID,
        ca.Depth + 1
    FROM CategoryAncestors ca
    INNER JOIN Categories node ON node.CategoryID = ca.AncestorCategoryID
    INNER JOIN Categories p ON p.CategoryID = node.ParentCategoryID
    WHERE node.ParentCategoryID IS NOT NULL
),
ValidForArea AS (
  -- Categories whose leaf is valid in @AreaID when @AreaID is set (any-ancestor rule)
    SELECT DISTINCT ca.LeafCategoryID AS CategoryID
    FROM CategoryAncestors ca
    INNER JOIN AreaCategories ac
        ON ac.CategoryID = ca.AncestorCategoryID
    WHERE @AreaID IS NOT NULL
      AND ac.AreaID = @AreaID
),
CategoryDescendants AS (
    -- When filtering by @CategoryID, include that node and all descendants (recursive down)
    SELECT c.CategoryID, c.CategoryID AS FilterRootID
    FROM Categories c
    WHERE @CategoryID IS NOT NULL AND c.CategoryID = @CategoryID
    UNION ALL
    SELECT child.CategoryID, cd.FilterRootID
    FROM CategoryDescendants cd
    INNER JOIN Categories child ON child.ParentCategoryID = cd.CategoryID
)
SELECT i.ItemID, i.ItemName, i.CategoryID, i.AreaID, i.QuantityOnHand, i.ReorderLevel
FROM Items i
INNER JOIN Areas a ON a.AreaID = i.AreaID
WHERE (@SpaceID IS NULL OR a.SpaceID = @SpaceID)
  AND (@AreaID IS NULL OR i.AreaID = @AreaID)
  AND (
        @AreaID IS NULL
        OR EXISTS (SELECT 1 FROM ValidForArea v WHERE v.CategoryID = i.CategoryID)
      )
  AND (
        @CategoryID IS NULL
        OR EXISTS (SELECT 1 FROM CategoryDescendants d WHERE d.CategoryID = i.CategoryID)
      )
  AND (
        @StockFilter = 'all'
        OR (@StockFilter = 'out' AND i.QuantityOnHand = 0)
        OR (
            @StockFilter = 'low'
            AND i.QuantityOnHand > 0
            AND i.ReorderLevel IS NOT NULL
            AND i.QuantityOnHand <= i.ReorderLevel
        )
      )
  AND (
        @Search IS NULL
        OR i.ItemName LIKE N'%' + @Search + N'%'
      )
OPTION (MAXRECURSION 32);
```

Use `EXISTS` for `AreaCategories` and descendant checks — avoid joining `Categories` × `Items` in a way that **fans out** duplicate item rows. When `@AreaID` is omitted, still enforce the any-ancestor mapping rule **per item’s own** `Items.AreaID` (correlated `EXISTS`: category ancestors joined to `AreaCategories` on `ac.AreaID = i.AreaID`) — do not skip mapping validation because the client omitted an area filter. **Dashboard aggregates (§6.2) and inventory list queries must share this mapping policy.**

### 6.2 Per-space dashboard — include empty areas

```sql
-- Parameters: @SpaceID INT

DECLARE @SpaceID INT = @p_SpaceID;

SELECT
    a.AreaID,
    a.AreaName,
    COUNT(i.ItemID) AS ItemRecordCount,
    COALESCE(SUM(i.QuantityOnHand), 0) AS TotalQuantity,
    COALESCE(SUM(CASE WHEN i.QuantityOnHand = 0 THEN 1 ELSE 0 END), 0) AS OutOfStockItemCount,
    COALESCE(SUM(CASE
            WHEN i.QuantityOnHand > 0
             AND i.ReorderLevel IS NOT NULL
             AND i.QuantityOnHand <= i.ReorderLevel
            THEN 1 ELSE 0
        END), 0) AS LowStockItemCount
FROM Areas a
LEFT JOIN Items i ON i.AreaID = a.AreaID
WHERE a.SpaceID = @SpaceID
GROUP BY a.AreaID, a.AreaName
ORDER BY a.AreaName;
```

**Note:** `LEFT JOIN` with no items yields `NULL` aggregates for `SUM`; `COALESCE(..., 0)` matches API default of numeric **zero** on dashboard cards.

**Definitions:** **Out** = `QuantityOnHand = 0`. **Low** = `QuantityOnHand > 0` AND `ReorderLevel IS NOT NULL` AND `QuantityOnHand <= ReorderLevel`. NULL `ReorderLevel` → item does not contribute to low-stock count.

### 6.3 Scoped supply request list + embedded status summary

**Scope parameters:** `@ViewerUserID` and `@ViewerIsReviewer` are derived by the **API from the session** — never accepted from the browser or request body.

```sql
-- Parameters: @TargetAreaID INT NULL (NULL = all areas user may see),
--             @ViewerUserID INT, @ViewerIsReviewer BIT  -- SERVER session only
-- Optional @StatusFilter for table rows only — does NOT affect summary counts

-- Table rows (may filter by @StatusFilter for UI search)
SELECT sr.RequestID, sr.ItemNameSnapshot, sr.RequestedQuantity, sr.Status,
       sr.TargetAreaID, sr.CreatedAt, sr.RowVersion
FROM SupplyRequests sr
WHERE (@TargetAreaID IS NULL OR sr.TargetAreaID = @TargetAreaID)
  AND (@ViewerIsReviewer = 1 OR sr.RequestedByID = @ViewerUserID)
  AND (@StatusFilter IS NULL OR sr.Status = @StatusFilter)
ORDER BY sr.CreatedAt DESC;

-- Summary counts: same scope as list, **ignoring** @StatusFilter (and pagination)
SELECT
    SUM(CASE WHEN sr.Status = 'Pending'   THEN 1 ELSE 0 END) AS PendingCnt,
    SUM(CASE WHEN sr.Status = 'Approved'  THEN 1 ELSE 0 END) AS ApprovedCnt,
    SUM(CASE WHEN sr.Status = 'Rejected'  THEN 1 ELSE 0 END) AS RejectedCnt
FROM SupplyRequests sr
WHERE (@TargetAreaID IS NULL OR sr.TargetAreaID = @TargetAreaID)
  AND (@ViewerIsReviewer = 1 OR sr.RequestedByID = @ViewerUserID);
```

**API contract:** `GET /api/requests` returns **`summary`** `{ pending, approved, rejected }` in the **same response** as `requests[]`, computed with the logic above — not a separate optional count endpoint.

### 6.4 Create request (server-side identity) — illustrative

**MUST** run inside a transaction with `SET XACT_ABORT ON` and `TRY`/`CATCH`. Verify the session actor is an **active** user before insert. For **existing** items: `SELECT` name + `AreaID` from `Items` with `(UPDLOCK, HOLDLOCK)` inside the transaction **before** insert; set `TargetAreaID` from that row — **do not trust** client-supplied area for existing items. Return the canonical row via `INSERT ... OUTPUT inserted.*`.

```sql
SET XACT_ABORT ON;

DECLARE @ItemID INT = @p_ItemID;
DECLARE @NewItemName NVARCHAR(150) = @p_NewItemName;
DECLARE @Qty INT = @p_RequestedQuantity;
DECLARE @Reason NVARCHAR(4000) = @p_Reason;
DECLARE @RequestedByID INT = @p_SessionUserID;
DECLARE @ClientTargetAreaID INT = @p_TargetAreaID; -- new-item path only; ignored for existing item
DECLARE @TargetAreaID INT;
DECLARE @Snap NVARCHAR(150);

BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (
        SELECT 1 FROM Users
        WHERE UserID = @RequestedByID AND IsActive = 1
    )
        THROW 51001, 'Inactive or unknown requester.', 1;

    IF @ItemID IS NOT NULL
    BEGIN
        SELECT @Snap = ItemName, @TargetAreaID = AreaID
        FROM Items WITH (UPDLOCK, HOLDLOCK)
        WHERE ItemID = @ItemID;

        IF @Snap IS NULL
            THROW 51002, 'Item not found.', 1;
    END
    ELSE
    BEGIN
        SET @Snap = @NewItemName;
        SET @TargetAreaID = @ClientTargetAreaID;
        -- API validates XOR, positive qty, area exists, category mapping for new-item path
    END;

    INSERT INTO SupplyRequests (
        ItemID, ItemNameSnapshot, NewItemName, RequestedQuantity, Reason,
        RequestedByID, TargetAreaID
    )
    OUTPUT inserted.*
    VALUES (
        @ItemID, @Snap, ISNULL(@NewItemName, N''), @Qty, @Reason,
        @RequestedByID, @TargetAreaID
    );

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRAN;
    THROW;
END CATCH;
```

### 6.5 Atomic guarded decision

```sql
DECLARE @RequestID INT = @p_RequestID;
DECLARE @ExpectedRowVersion BINARY(8) = @p_RowVersion;
DECLARE @NewStatus VARCHAR(20) = @p_Status; -- Approved | Rejected
DECLARE @DecidedByID INT = @p_SessionUserID;
DECLARE @Notes NVARCHAR(4000) = @p_DecisionNotes;
DECLARE @Now DATETIME2 = SYSUTCDATETIME();

UPDATE SupplyRequests
SET Status = @NewStatus,
    DecidedByID = @DecidedByID,
    DecisionNotes = @Notes,
    DecidedAt = @Now
OUTPUT inserted.RequestID, inserted.Status, inserted.RowVersion
WHERE RequestID = @RequestID
  AND Status = 'Pending'
  AND RowVersion = @ExpectedRowVersion;

-- If @@ROWCOUNT = 0 → 409 conflict (already decided or stale RowVersion)
```

**Mandatory API preconditions (before parameterized call):**

1. **Reviewer role:** Derived **only** from the authenticated session (`GET /api/auth/me` role string). Allow **Admin** or **Full-time Lab Worker**; deny **Student Worker** with **403**. Do **not** accept `ViewerIsReviewer`, reviewer flags, or role overrides from the browser, query string, or request body.
2. **Status:** `@p_Status` must be exactly `Approved` or `Rejected`; otherwise **400** validation.
3. **Row existence:** If no `SupplyRequests` row matches `@p_RequestID`, respond **404** (missing request).
4. **Stale / already decided:** If the row exists but `UPDATE` returns `@@ROWCOUNT = 0` (not `Pending`, or `RowVersion` mismatch), respond **409** — distinct from **404**.

### 6.6 Audited quantity adjustment (trusted role)

```sql
SET XACT_ABORT ON;

DECLARE @ItemID INT = @p_ItemID;
DECLARE @Delta INT = @p_Delta;
DECLARE @UserID INT = @p_SessionUserID;
DECLARE @Notes NVARCHAR(500) = @p_Notes;
DECLARE @LogType VARCHAR(15);
DECLARE @LogQty INT;

BEGIN TRY
  -- Validate @Delta before any arithmetic, LogType, or ABS (API should also reject 0 pre-call)
    IF @Delta = 0 OR @Delta < -1000000000 OR @Delta > 1000000000
        THROW 51010, 'Invalid delta.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM Users u
        INNER JOIN Roles r ON r.RoleID = u.RoleID
        WHERE u.UserID = @UserID
          AND u.IsActive = 1
          AND r.RoleName IN (N'Admin', N'Full-time Lab Worker', N'Student Worker')
    )
        THROW 51011, 'Inactive or unauthorized user.', 1;

    SET @LogType = CASE WHEN @Delta > 0 THEN 'Restock' ELSE 'Consume' END;
    SET @LogQty = ABS(@Delta);

    BEGIN TRAN;

    -- Before UPDATE: validate leaf category vs i.AreaID (§1.4 correlated EXISTS — see prose below)

    UPDATE Items
    SET QuantityOnHand = CONVERT(INT, CONVERT(BIGINT, QuantityOnHand) + @Delta)
    WHERE ItemID = @ItemID
      AND CONVERT(BIGINT, QuantityOnHand) + @Delta BETWEEN 0 AND 2147483647;

    IF @@ROWCOUNT = 0
        THROW 51000, 'Insufficient stock, overflow, or item not found.', 1;

    INSERT INTO InventoryLogs (ItemID, UserID, ProcessedByID, LogType, Quantity, Notes)
    VALUES (@ItemID, @UserID, @UserID, @LogType, @LogQty, @Notes);

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRAN;
    THROW;
END CATCH;
```

**Mapping validation (required):** Before applying `@Delta`, verify the item’s leaf `CategoryID` satisfies §1.4 for **that item’s** `Items.AreaID` using a correlated `EXISTS` (category ancestors joined to `AreaCategories` on `ac.AreaID = i.AreaID`) — independent of any list `areaId` filter the client omitted. **Inventory list (§6.1), dashboard counts (§6.2), and this path must share the same mapping policy.** Recursive CTEs: `OPTION (MAXRECURSION 32)` **throws** on exceed — does not silently truncate (same as §6.1).

**Parameter contract:** `@p_SessionUserID` is always the trusted session user ID; API rejects zero or out-of-range `delta` before the call. Client sends `delta`, optional `notes`, and **`rowVersion`** (base64, 8-byte) when **DB-P1-01** adds `Items.RowVersion` — same canonical name as §8.

---

## 7. Dashboard and request scoping (API behavior)

- **Inventory counts** on dashboard: when user selects `SpaceID` + optional `AreaID`, apply same filters as §6.2 and inventory list endpoints.
- **Request counts** (pending / approved / rejected): scope by **`TargetAreaID`** (and space via join to `Areas`), **not** by status filter used for table search. Counts reflect **full scoped set**, not current table page.
- Students: scope list + counts to `RequestedByID = self` only.
- Reviewers: all requests in scope (optionally filter by space/area).

Private `bootstrap` dashboard (`server/app.js` L447) uses **global** item counts — group MVP should **improve** with space/area scoping per product direction in FE doc.

---

## 8. Proposed REST API (NOT IMPLEMENTED — **API-P0-*** track)

Single contract for the **future API service** (see §3 API table). Front-end uses **only** these JSON shapes in `api-client.js` / `mock-api.js` — not parallel alias fields in components.

**Defaults:** List endpoints return `{ "items": [] }` or a bare `[]` only where noted; numeric aggregates default to **0**, never `null`. Empty areas still appear on dashboard arrays with zero counts.

**`rowVersion`:** `SupplyRequests.RowVersion` is **required** once **DB-P0-05** is applied — always present on request rows in JSON (8-byte value, base64). `Items.RowVersion` is **optional** until **DB-P1-01** only; when the column is absent, omit `rowVersion` from item JSON. **Decisions** (`PATCH .../decision`) and item writes **always** require clients to send a valid **8-byte** base64 `rowVersion` when the backing column exists; reject wrong-length values (example invalid length `AAAAAAAB` → use `AAAAAAAAAAE=`).

### 8.1 Canonical response shapes

**`GET /api/auth/me`** — `200`

```json
{
  "user": {
    "userId": 2,
    "email": "student.a@lab.example",
    "firstName": "Alex",
    "lastName": "Student",
    "phone": null,
    "role": "Student Worker",
    "isActive": true
  },
  "csrfToken": "fake-csrf-token-for-ui-dev"
}
```

**`GET /api/items?spaceId=1&areaId=3&stock=all`** — `200`

```json
{
  "items": [
    {
      "itemId": 101,
      "itemName": "Makerspace PLA Black",
      "categoryId": 12,
      "areaId": 3,
      "spaceId": 1,
      "quantityOnHand": 12,
      "reorderLevel": 4,
      "trackingType": "Consumable",
      "status": "Active",
      "rowVersion": null
    }
  ]
}
```

**`GET /api/requests`** — `200` — list **`requests`** plus embedded **`summary`** (pending / approved / rejected computed per §6.3, **independent** of optional table `status` filter):

```json
{
  "summary": {
    "pending": 1,
    "approved": 0,
    "rejected": 1
  },
  "requests": [
    {
      "requestId": 55,
      "itemId": 101,
      "itemNameSnapshot": "Makerspace PLA Black",
      "newItemName": "",
      "requestedQuantity": 5,
      "reason": "Running low for class project",
      "status": "Pending",
      "targetAreaId": 3,
      "requestedById": 2,
      "createdAt": "2026-03-01T18:30:00.000Z",
      "decidedById": null,
      "decidedAt": null,
      "decisionNotes": "",
      "rowVersion": "AAAAAAAAAAE="
    }
  ]
}
```

**`GET /api/dashboard/summary?spaceId=1&areaId=`** — `200` — **reviewer**, Makerspace scope, **§9.1 QA fixture** (`spaceId` / `areaId` numeric IDs may differ from `LabInventory.sql` identity seeds; samples use consistent fake IDs):

```json
{
  "spaceId": 1,
  "areaId": null,
  "areas": [
    {
      "areaId": 3,
      "areaName": "3D Printer Area",
      "itemRecordCount": 2,
      "totalQuantity": 14,
      "lowStockItemCount": 1,
      "outOfStockItemCount": 0,
      "pendingRequestCount": 1
    },
    {
      "areaId": 4,
      "areaName": "Laser Cutter Area",
      "itemRecordCount": 0,
      "totalQuantity": 0,
      "lowStockItemCount": 0,
      "outOfStockItemCount": 0,
      "pendingRequestCount": 0
    },
    {
      "areaId": 5,
      "areaName": "Shelf",
      "itemRecordCount": 0,
      "totalQuantity": 0,
      "lowStockItemCount": 0,
      "outOfStockItemCount": 0,
      "pendingRequestCount": 0
    }
  ],
  "requestStatusCounts": {
    "pending": 1,
    "approved": 1,
    "rejected": 0
  }
}
```

**Error envelope** — `400` / `401` / `403` / `409`

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "fields": {
    "targetAreaId": "Category not mapped to this area"
  }
}
```

### 8.2 Endpoint coverage (MVP)

| Method | Path | Auth | Body / query | Response |
|--------|------|------|--------------|----------|
| POST | `/api/auth/login` | Public | `email`, `password` | `204` + Set-Cookie; or `200` + `me` shape |
| POST | `/api/auth/logout` | Session | CSRF header | `204` |
| GET | `/api/auth/me` | Session | | §8.1 `me` |
| GET | `/api/profile` | Session | | Same `user` object as `me` (profile view) |
| PUT | `/api/profile` | Session | `firstName`, `lastName`, `phone` | Updated `user` |
| GET | `/api/spaces` | Session | | `{ "spaces": [ { "spaceId", "spaceName" } ] }` |
| GET | `/api/areas` | Session | `?spaceId=` | `{ "areas": [ { "areaId", "spaceId", "areaName" } ] }` |
| GET | `/api/categories` | Session | | `{ "categories": [ { "categoryId", "parentCategoryId", "categoryName", "mappedAreaIds": [1,2] } ] }` — tree built client-side |
| GET | `/api/area-categories` | Session | `?areaId=` | `{ "mappings": [ { "areaId", "categoryId" } ] }` |
| GET | `/api/items` | Session | `spaceId`, `areaId`, `categoryId`, `stock`, `q` | §8.1 items |
| POST | `/api/items` | Staff | item fields | `201` + item object |
| PUT | `/api/items/:id` | Staff | fields + optional `rowVersion` | `200` or `409` |
| DELETE | `/api/items/:id` | Staff | optional `rowVersion` | `204` or `409` |
| POST | `/api/items/:id/quantity` | Session | `delta`, `notes`, optional `rowVersion` | `200` + updated item |
| GET | `/api/dashboard/summary` | Session | `spaceId`, `areaId` optional | §8.1 dashboard |
| GET | `/api/requests` | Session | `spaceId`, `areaId`, `status` optional (table only) | §8.1 `requests` + `summary` |
| POST | `/api/requests` | Session | `itemId` \| `newItemName`, `requestedQuantity`, `reason`, `targetAreaId` | `201` + row |
| PATCH | `/api/requests/:id/decision` | Reviewer | `status`, `decisionNotes`, `rowVersion` | `200` or `409` |
| GET | `/api/inventory-logs` | Session | `?limit=&spaceId=` | `{ "logs": [ … ] }` for dashboard |
| POST/PUT/DELETE | `/api/categories`, `/api/categories/:id` | Staff | tree fields | §8.1 category shape |
| PUT | `/api/area-categories` | Staff | `areaId`, `categoryId` map ops | `{ "mappings": [ … ] }` |
| POST/PUT/DELETE | `/api/areas`, `/api/areas/:id` | Staff | `spaceId`, `areaName` | §8.1 area shape |
| GET/POST/PUT | `/api/admin/users`, `/api/admin/users/:id` | Admin | user + role fields | user object |

**Dependencies:** Every **API-P0-*** row requires **DB-P0-01** applied; auth routes require **DB-P0-03/04** and seeded users; requests require **DB-P0-05**.

**Label fixtures (fake JSON for UI dev):** `Front-end/fixtures/*.json` must copy §8.1 shapes exactly — **proposed only**; not committed until FE-P0-07.

---

## 9. Query / seed test fixtures (manual QA checklist)

Use after migrations applied to a **throwaway** database copy.

**Dev / QA SQL seed policy (MVP):** Migration `LabInventory_Migrate_001.sql` + companion **`LabInventory_Seed_QA.sql`** (proposed) insert **only**:

- `Roles`, `Users` (test accounts below)
- `Spaces`, `Areas`, `Categories`, `AreaCategories` (including **DB-P0-06** typo fix)

**Do not** insert `Items`, `InventoryLogs`, or `SupplyRequests` in the base SQL seed script. Integration tests and shared FE fixtures load **Items** and **SupplyRequests** via API or a separate **`LabInventory_Seed_QA_Data.sql`** documented in the same folder — keeps empty-inventory scenarios reproducible.

### 9.1 Shared QA dataset (both FE + API manual runs)

| Entity | Records |
|--------|---------|
| **Users** | `student.a@lab.example` (Student Worker), `student.b@lab.example` (Student Worker), `worker.ft@lab.example` (Full-time Lab Worker), `admin@lab.example` (Admin) |
| **Items** | **Makerspace — 3D Printer Area:** (1) `Makerspace PLA Black` qty **12**, reorder **4**; (2) `Makerspace Resin Grey` qty **2**, reorder **3**. **Project Room — Shelf:** (3) `Cordless Drill` qty **0**, reorder **1** (out of stock). No items in Laser Cutter, Side Shelves, Wood Cutting Station for “empty location” card tests. |
| **SupplyRequests** | Three rows, **different** `TargetAreaID`: **Pending** (area = Makerspace 3D Printer, by student.a, qty 5), **Approved** (area = Makerspace Shelf, by student.b), **Rejected** (area = Project Room Shelf, by student.a). Reviewer = `worker.ft@lab.example`. |
| **Scoped counts** | Student **a** request summary: pending **1**, approved **0**, rejected **1** (own only). Reviewer **all** in Makerspace: pending **1**, approved **1**, rejected **0** (if third request is Project Room only). Dashboard per-area pending uses `TargetAreaID`, not requester. |

### 9.2 Scenarios

| Fixture | Expected |
|---------|----------|
| Side Shelves + Length Measurement Sets mapping | Exists after **DB-P0-06** |
| **Empty area** — Laser Cutter, no items | Dashboard `itemRecordCount = 0`, `totalQuantity = 0`, area row **present** |
| **Full zero space** — separate DB with no items anywhere | All areas listed; all counts **0**; FE shows zero vs loading distinction |
| Concurrent decision two reviewers | One succeeds; second gets **409** |
| Student PATCH decision | **403** |
| Tampered `RequestedByID` in body | Server ignores; uses session |
| Plywood item (when added in QA data script) | Under **Wood / Plywood** + **Wood Cutting Station**, not Laser Cutter |
| Two students + one reviewer | Matrix §2 on list scope and decisions |
| HDMI subgroup filter | Valid only where Cables ancestor mapped (Makerspace Shelf); invalid area → empty list + API validation on write |

---

## 10. Migration packaging

**`LabInventory_Migrate_001.sql` (sketch):**

1. `USE LabInventory;` — never `Master` drop.
2. `IF NOT EXISTS` role seeds.
3. `ALTER TABLE Users ADD` phone column if missing.
4. `CREATE TABLE SupplyRequests` if missing.
5. Data fix: update seed mapping typo via merge, not full reseed.
6. Optional `LabInventory_Seed_QA.sql` — taxonomy + users only (§9); **no** `Items`.

**`LabInventory_Reset_Dev.sql`:** May drop and recreate — clearly watermarked DEV ONLY.

---

## 11. Cross-references

| Document | Purpose |
|----------|---------|
| `Database/REQS.txt` | Original domain vocabulary |
| `Front-end/REQS_V2.md` | Product requirements |
| `Front-end/REQS_NEXT_STEPS.md` | UI tasks, acceptance scenarios, FE–DB ID mapping |
| `Database/LabInventory.sql` L165 | Seed typo to fix |
| Private `server/app.js` | Request XOR (L260–263), decision guard (L278), session auth (L187–194) |

---

*End of database next-steps document.*