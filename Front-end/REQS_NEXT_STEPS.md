# Lab Inventory — Front-End Next Steps

**Scope:** Actionable integration plan for the **group** static front-end (`Front-end/`).  
**Does not replace:** `Front-end/REQS_V2.md`.  
**Companion doc:** `Database/REQS_NEXT_STEPS.md` (schema, T-SQL, proposed API).  
**Reference behavior:** Private SPA `Lab_Invent_Mgnmnt_Private/web/app.js` + `server/app.js` — use for interaction patterns, **not** for copying private taxonomy (space-scoped root groups) into the public UI.

**Permission matrix:** Identical to Database doc §2 — all authenticated users browse + submit own requests + profile; students audited qty ±; staff item/taxonomy/area CRUD + review all requests; admin-only user mgmt. **Lead signoff required** where matrix differs from `REQS_V2.md` (all-user item CRUD).

---

## 1. Current state vs target

### 1.1 Observed gaps (grounded in repo)

| Area | Evidence | Gap |
|------|----------|-----|
| Identity | `js/current-user.js` L16–26 | Fake student via `TEST_ROLE` when `sessionStorage` empty — must not run in integrated mode. |
| Role helper scope | `current-user.js` L26–29 | Only loaded on Inventory + Supply Requests; **Dashboard** (`dashboard.html` L59) has **no** `current-user.js`. |
| Login | `js/login.js` L20–23 | Placeholder only; no session write. |
| Profile | `js/profile.js` L6–14 | Local `currentUser` object collides with `current-user.js` export name — rename when consolidating. |
| Dashboard | `js/dashboard.js` L4–9 | Hardcoded zeros; no space/location selectors. |
| Inventory assets | `Inventory.html` L7–8 vs filesystem | Links `css/inventory.css`, `js/inventory.js` — files are `Inventory.css`, `Inventory.js` (Windows may mask; breaks on Linux hosting). |
| Inventory DOM | `js/Inventory.js` L55–58, L79–80, L389 | Expects `#page-message`, `#item-empty`, `#delete-modal`, `#delete-confirm-btn` — **missing** from `Inventory.html` grep. |
| Mock taxonomy | `js/Inventory.js` L10–16 | Missing **Side Shelves** area; mock **Plywood** at Laser Cutter (`locationId: 2` L39) vs SQL seed Wood Cutting Station — **flag for lead review**, do not silently relocate. |
| Filters | `Inventory.js` L169–178 | Space, location, group filters independent — allows impossible combos (location from space A + space B selected). |
| Supply Requests CSS | `supply-requests.html` L7 | `css/components.css` **does not exist** in repo. |
| Empty state | `supply-requests.js` L48, L140–143; `supply-requests.html` (no `id="empty-state"`) | **`#empty-state` is missing** from HTML — add element or retarget script (FE-P0-05 scope for supply page). |
| Hidden vs display | `supply-requests.html` L31 `hidden` vs `supply-requests.js` L83 `style.display` | Mixed visibility patterns — standardize. |
| Request dates | `supply-requests.js` L97–98 | Local `en-US` display — target display format **`dd/mm/yyyy HH:mm`** with explicit timezone label (e.g. **ET**); transport **UTC ISO** from API via `datetime-display.js` (FE-P1-08, **Phase 1 dependency**). |
| Approval semantics | mocks | Approving must **not** increase stock (matches DB doc). |

### 1.2 What to keep from group prototype (do not copy private blindly)

- **Locations** dropdown on Inventory (`REQS_V2` L125) — private collapsed locations into inventory filters differently; **retain** Locations nav + filters unless lead decides otherwise.
- **Categories** via `AreaCategories` + tree — not private `groups.spaceId` roots.
- Contextual labels for two **Shelf** areas and **Side Shelves** without DB rename.

---

## 2. Prioritized front-end tasks

### P0 — integration core

| ID | Task | Target files | DB / API deps |
|----|------|--------------|---------------|
| **FE-P0-01** | Shared `js/api-client.js` (fetch wrapper, CSRF, 401→login, error mapping) | **new** | API §8 in DB doc |
| **FE-P0-02** | Shared `js/auth-session.js`: load user from `GET /api/auth/me`; remove `TEST_ROLE` in production build | `current-user.js` → refactor | DB-P0-04, sessions |
| **FE-P0-03** | Load auth helper on **every** authenticated page | `dashboard.html`, `profile.html`, `locations.html`, `user-management.html`, `login.html` redirect | FE-P0-02 |
| **FE-P0-04** | Login posts to `/api/auth/login`; stores nothing sensitive in `sessionStorage` beyond display cache if needed | `login.js` | DB-P0-04 |
| **FE-P0-05** | Repair Inventory asset paths and missing DOM | `Inventory.html`, optional rename files to lowercase for consistency | — |
| **FE-P0-06** | Add `components.css` OR remove link and merge into `layout.css` / page CSS; add missing `#empty-state` to `supply-requests.html` | `supply-requests.html` | — |
| **FE-P0-07** | Mock adapter module `js/mock-api.js` until backend ready; single flag `USE_MOCK_API` | **new** | Allows CI of UI without SQL |
| **FE-P0-08** | Supply request POST only on success; disable submit while pending; preserve form on failure | `supply-requests.js` | `POST /api/requests` |
| **FE-P0-09** | XOR existing/new item fields; qty positive integer **not** capped by stock; reason required | `supply-requests.js` | Matches `server/app.js` L260–267 |
| **FE-P0-10** | Reviewers: default status filter **Pending**; students: own requests only | `supply-requests.js` | `GET /api/requests` scoping |
| **FE-P0-11** | Status summary cards from API embedded `summary` (full scoped set), not table `status` filter | `supply-requests.js` L117–121 | DB doc §6.3, §7 |
| **FE-P0-14** | Hierarchical category dropdown with inheritance rule (DB doc §1.4) | `Inventory.js` | DB-P0-07 — **Phase 1** |
| **FE-P0-15** | Refresh on navigation, `pageshow`, manual button, `visibilitychange` focus (no polling required) | `supply-requests.js`, page scripts | **Phase 1** |
| **FE-P0-12** | Decision PATCH with `rowVersion`; handle 409 | `supply-requests.js` | DB doc §6.5 |
| **FE-P0-13** | Direct URL guards: student cannot open `user-management.html`; unauthenticated → `login.html` | all HTML + auth helper | Server 403 backup |

### P1 — dashboard, inventory depth, UX

| ID | Task | Target files | DB / API deps |
|----|------|--------------|---------------|
| **FE-P1-01** | Dashboard space + location selectors; per-space/area cards include **empty** areas | `dashboard.html`, `dashboard.js` | `GET /api/dashboard/summary` |
| **FE-P1-02** | Deep links: dashboard card → Inventory with same `spaceId`/`areaId` query | `dashboard.js`, `Inventory.js` | |
| **FE-P1-03** | Coupled filters: changing space resets invalid location/group; show explanation notice | `Inventory.js` | `GET /api/area-categories` |
| **FE-P1-05** | Item record count vs sum of quantities — separate labels on dashboard | `dashboard.js` | §6.2 SQL semantics |
| **FE-P1-06** | Recent changes from `InventoryLogs` via API | `dashboard.js` | new log endpoint or bootstrap |
| **FE-P1-07** | Profile: rename local state (`profileUser`) to avoid `currentUser` collision; load `GET /api/profile`, save `PUT /api/profile` | `profile.js` | API-P0-06 (Database doc §8.2) |
| **FE-P1-08** | Date/time display helper: **`dd/mm/yyyy HH:mm`** + timezone label (**ET**) from UTC ISO (`America/New_York`) | **new** `js/datetime-display.js` | **Phase 1** — supply table + dashboard timestamps |
| **FE-P1-09** | Optional 60s polling on Supply Requests for reviewers | `supply-requests.js` | No WebSocket assumed |
| **FE-P1-10** | Inventory qty ± via `POST /api/items/:id/quantity` with audit notes | `Inventory.js` L223–227 | DB doc §6.6 |

### P2 — optional later (not MVP sprint)

| ID | Task | Notes |
|----|------|-------|
| **FE-P2-01** | Usage / lending tracker UI | Private has `/api/usage` — optional phase 2 |
| **FE-P2-02** | Charts for usage rankings | Private `usageTracker` — not required MVP |
| **FE-P2-03** | Email/password reset flow | `REQS_V2` — 503 until configured like private L233 |

---

## 3. Role views and navigation

### 3.1 Page access

| Page | Student | Full-time | Admin |
|------|---------|-----------|-------|
| `dashboard.html` | Yes | Yes | Yes |
| `Inventory.html` / `inventory.html` | Browse, ± qty | + CRUD sections | + CRUD |
| `supply-requests.html` | Own + create | All + review UI | All + review |
| `locations.html` | View (per matrix) | CRUD if API allows staff | CRUD |
| `user-management.html` | **Deny** | **Deny** | Yes |
| `profile.html` | Yes | Yes | Yes |

### 3.2 Implementation pattern

1. **FE-P0-02** exposes `getCurrentUser()`, `hasRole(...)`, `requireAuth()`, `guardPage(allowedRoles)`.
2. Run `guardPage` at top of each page script after auth promise resolves.
3. Keep `data-roles` attribute hiding (`current-user.js` L31–36) but only as secondary UX.
4. On 403 from API, show notice and redirect where appropriate.

### 3.3 Integrated vs mock mode

```text
USE_MOCK_API = true  → mock-api.js serves in-memory data shaped like API §8
USE_MOCK_API = false → api-client.js; NO fake TEST_ROLE fallback; 401 → login
```

Document flag in `README` when integration lands — out of scope for this doc file’s creation.

---

## 4. Supply requests — detailed behavior

### 4.1 Create form

| Rule | UI enforcement |
|------|----------------|
| Existing XOR new | Toggling radio/tab clears opposite field; server validates XOR |
| `ItemNameSnapshot` | Display-only from server response after create |
| `targetAreaId` | Required; existing item: read-only derived from item’s area (API); new item: user selects area |
| Quantity | Integer ≥ 1; **no max** from on-hand |
| Reason | Required non-empty trim |
| Success | Close modal, refresh list, show canonical `createdAt` / `requestedBy` from server |
| Failure | Keep modal open, show field errors, re-enable submit |

### 4.2 Review

- Show **Pending** decision controls only when `status === 'Pending'` **and** `hasRole(Full-time, Admin)`.
- Notes optional on approve/reject; persist `decisionNotes`, `decidedBy`, `decidedAt` from response.
- On 409: message “Another reviewer already decided this request” + refresh row.

### 4.3 Table vs cards

- **Cards:** pending / approved / rejected counts for **visibility scope** (student own; staff all in optional space/area filter).
- **Table:** may filter by status search — counts on cards **do not** follow table status filter (FE-P0-11).

### 4.4 Cross-client refresh

When reviewer B approves, requester A should see update after: navigation, tab focus, manual Refresh (FE-P0-15), or optional polling (FE-P1-09). Never claim local arrays are source of truth.

---

## 5. Dashboard requirements

1. **Selectors:** `Space` (all Makerspace / Project Room), `Location` (areas in space + “All locations”).
2. **Cards per area** in selected space: item record count, total quantity, low-stock count, out-of-stock count, pending supply requests (scoped by `TargetAreaID`).
3. **Include areas with zero items** — matches SQL LEFT JOIN pattern in DB doc §6.2.
4. **Request summary** uses same space/area scope as inventory stats.
5. Replace `dashboard.js` placeholders (L4–9) with API-driven values; show loading skeleton and distinguish **error** vs **zero**.

---

## 6. Inventory requirements

### 6.1 Asset and DOM repair (FE-P0-05)

Add to `Inventory.html` (or align script):

- `#page-message` (role=status)
- `#item-empty` empty state copy
- `#delete-modal`, `#delete-message`, `#delete-confirm-btn`, cancel control
- `#item-form-title` if referenced in script
- Fix stylesheet/script hrefs to match deployed names (recommend all-lowercase `inventory.html` + `inventory.js` + `inventory.css` for Linux).

### 6.2 Filter coupling (FE-P1-03) — **Phase 1 dependency**

**Subgroup / group control (FE-P0-14):** Populate from `GET /api/categories` tree (not static mocks). Leaf and parent options both allowed; validity per area uses Database doc §1.4 (**any ancestor** mapped in `AreaCategories`). **Valid mappings may be empty** for a chosen subgroup — show explicit notice, not a silent blank table.

**Selection order A:** Space → Location → Group  
**Selection order B:** Group → Space → Location  

Both orders must:

1. When space changes, **reset** location and/or group values that conflict with the new space; show a short notice (e.g. “Location reset — not in this space”).
2. When location changes, **reset** group if no ancestor of that category is mapped to the location (same notice pattern).
3. When group is selected first, restrict space/location to those where the category is valid; **reset** previously selected space/location that conflict — do **not** retain an impossible combination “for display only”.
4. Resulting table rows must reflect **only** the remaining valid filter set after reset — assert rows match the remaining valid selections; **zero rows only when no items actually match** (not merely because a control was reset).
5. If mapping yields empty valid set, show: “No locations are mapped to this category” — not an empty table with no explanation.

**Low-stock display (inventory + dashboard):** Show warning text (e.g. “Low stock”) **and** red styling — never **color alone** (WCAG).

### 6.3 Display labels (no DB rename)

| DB `Areas.AreaName` | Display |
|---------------------|---------|
| Shelf + Makerspace | Makerspace — Shelf |
| Shelf + Project Room | Project Room — Shelf |
| Side Shelves | Side Shelves (Project Room) or per lead copy |

Use `Spaces.SpaceName` + `Areas.AreaName` in UI; IDs from API remain `AreaID` / `SpaceID` for deep links.

### 6.4 Mock data flag

Plywood in Laser Cutter Area in `Inventory.js` L39 — **inconsistent** with `Database/LabInventory.sql` taxonomy. Before integration, mark with comment `// LEAD_REVIEW: mock placement` and fix mock adapter after seed import — **do not auto-move** without lead approval.

### 6.5 Staff CRUD

Wire forms to REST (`POST/PUT/DELETE /api/items`, category endpoints). Students do not see `data-roles` forms (`Inventory.html` L27, L140).

---

## 7. Error and loading conventions (all pages)

| HTTP | User message pattern |
|------|---------------------|
| 401 | Session expired → redirect login |
| 403 | “You don’t have permission for this action.” |
| 409 | Concurrency / already decided / stale item version |
| 400 | Map `error` + field keys under inputs |

Shared `showNotice()` pattern exists on Inventory and Supply Requests — extract to `js/notices.js` when touching both files.

**Loading:** disable primary buttons, `aria-busy` on tables, distinguish empty (0 rows) vs not loaded.

---

## 8. Acceptance scenarios (manual QA)

Use **mock adapter** or staging API with seeded DB after **DB-P0-06**.

### 8.1 Fixture: shared QA dataset (Database doc §9.1)

Load via mock adapter or `LabInventory_Seed_QA_Data.sql` after taxonomy seed.

**Inventory:** Makerspace 3D Printer — `Makerspace PLA Black` qty **12** / reorder **4**, `Makerspace Resin Grey` qty **2** / reorder **3** (sum **14**). Project Room Shelf — `Cordless Drill` qty **0** / reorder **1**. Laser Cutter, Side Shelves, Wood Cutting Station — **no items** (empty cards). Side Shelves mapping exists after **DB-P0-06**.

**Users:** `student.a`, `student.b` (Student Worker), `worker.ft` (Full-time reviewer).

**Requests:** Pending (3D Printer, student.a), Approved (Makerspace Shelf, student.b), Rejected (Project Room Shelf, student.a). Student **a** card counts: pending **1**, approved **0**, rejected **1**. Reviewer **Makerspace** scope: pending **1**, approved **1**, rejected **0** (rejected request targets Project Room). Dashboard pending by area: 3D **1**, Laser **0**, Makerspace Shelf **0**.

| Actor | Action | Expected |
|-------|--------|----------|
| Student A | Dashboard Makerspace / All locations | **All three** Makerspace areas (3D Printer, Laser Cutter, Shelf); Laser + Shelf **0** item records; 3D shows **2** records, total qty **14**, low-stock **1** (Resin) with **text + red**; per-area pending **3D=1**, **Laser=0**, **Shelf=0** |
| Reviewer | Dashboard Makerspace / All locations | `requestStatusCounts`: pending **1**, approved **1**, rejected **0**; matches §8.1 JSON fixture (fake `areaId` values may differ from SQL seed — keep `areaName` + item `areaId` consistent in fixtures) |
| Student A | Supply Requests | Own rows only; cards match §9.1 scoped counts |
| Full-time B | Default filter | Pending visible; Approve enabled |
| Full-time B | Approve pending | **200**; on-hand qty **unchanged** |
| Student A | Reload / focus | Approved status visible |
| Admin | `user-management.html` direct URL | Page loads |
| Student | `user-management.html` direct URL | Redirect or inline denial |
| Any | Tamper `sessionStorage` role Admin | API **403** on review |
| Any | Item − qty below 0 | Client blocks; server rejects if bypassed |
| Any | Full zero DB (no items) | Dashboard lists areas, all numeric **0**; distinct from loading skeleton |

### 8.2 Filter invalid mapping

1. Select subgroup **HDMI** (under Cables); then select **Project Room → Wood Cutting Station** (Cables not mapped there).  
2. Expect: **notice** and **reset** of the conflicting control (location or group per §6.2); table shows **only rows matching** the remaining valid filters — not stale mock rows from an impossible combo (row count may be **> 0** if valid items still match).  
3. Select Makerspace → Shelf → HDMI: rows must match API. **Qty-zero items remain visible** unless the stock filter excludes them (`out` / `low`). **Empty** table means **no records** for the filter — not “all items have qty 0”.

### 8.3 Failed saves and duplicate submit

- Disconnect network on submit → form preserved, error banner.
- **Rapid double-click / duplicate submit:** UI must allow **at most one in-flight** POST per form (disable button + guard flag). **Ambiguous network retries** (timeout then retry) may create duplicates — **no** guarantee of single row unless client sends an **idempotency key** and server stores it (**not** MVP). Do **not** document optional server idempotency as guaranteeing deduplication.

### 8.4 Accessibility / smoke

- Tab through Supply Request modal; Enter submits; Esc closes if spec’d.
- Chrome + Firefox console: no uncaught errors on Inventory load after DOM repair.

---

## 9. Phased delivery plan

**Backend note:** Group repo has **no** API yet — Phase 1 assumes **API-P0-*** (Database doc §3) on a separate service. **`USE_MOCK_API`** supports UI prototyping only; **integration is not complete** until the real API is wired (`USE_MOCK_API = false`).

```text
Phase 1 (MVP sprint): FE-P0-* + DB-P0-* + API-P0-*
                      + FE-P1-01 scoped dashboard (empty areas)
                      + FE-P1-03 filter coupling
                      + FE-P0-14 hierarchical category / subgroup (DB §1.4)
                      + FE-P0-15 refresh on navigation / manual / visibility (essential)
                      + FE-P1-08 datetime dd/mm/yyyy HH:mm + ET label
                      + FE-P1-10 qty ± via POST .../quantity (§6.6)
Phase 2: FE-P1-02 deep links, FE-P1-05 labels, FE-P1-06 logs, FE-P1-07 profile polish, FE-P1-09 optional polling
Phase 3 (optional): FE-P2-* usage tracker, charts, password reset
```

Phase 1 **done** when: **real API** endpoints drive all P0 flows (mock-only = **prototype milestone**, not final integration), plus login/logout, inventory browse with **coupled filters** and category tree, staff CRUD, student **audited** qty ±, supply create/review with API `summary` cards, **space/location-scoped dashboard** including empty areas, canonical API JSON, and **no** `TEST_ROLE` fallback in integrated mode.

---

## 10. API field mapping (front-end ↔ database)

| JSON (proposed) | SQL column |
|-----------------|------------|
| `itemId` | `Items.ItemID` |
| `areaId` / `locationId` | `Areas.AreaID` |
| `spaceId` | `Spaces.SpaceID` |
| `categoryId` / `groupId` | `Categories.CategoryID` |
| `targetAreaId` | `SupplyRequests.TargetAreaID` |
| `rowVersion` | `SupplyRequests.RowVersion` (required, 8-byte base64); `Items.RowVersion` optional until DB-P1-01 |
| `qty` / `requestedQuantity` | context-specific |
| `createdAt`, `decidedAt` | UTC ISO strings; display via FE-P1-08 |
| Profile | `GET /api/profile`, `PUT /api/profile` — same `user` fields as `me` |

Use one naming convention in `api-client.js` and map in one place — UI label “Group” maps to JSON `categoryId` only.

---

## 11. File cross-reference index

| File | Relevance |
|------|-----------|
| `js/current-user.js` | ROLES, TEST_ROLE, hasRole |
| `js/Inventory.js` | Filters, mock gaps, missing DOM ids |
| `Inventory.html` | Casing, hrefs, missing elements |
| `js/supply-requests.js` | Requests UX, counts, dates |
| `supply-requests.html` | components.css |
| `js/dashboard.js` | Placeholder metrics |
| `js/login.js` | Integration point |
| `js/profile.js` | currentUser name collision |
| `REQS_V2.md` | Product source |
| `Database/REQS_NEXT_STEPS.md` | Schema, SQL examples, API |

---

## 12. Label JSON fixtures (optional dev aid)

Proposed only — create when implementing FE-P0-07. **Must** match Database doc **§8.1** canonical shapes exactly (field names, default **0** counts, `items` / `requests` arrays — may be empty).

- `fixtures/auth-me-student.json` — `GET /api/auth/me` shape
- `fixtures/dashboard-makerspace.json` — `GET /api/dashboard/summary`: all **three** Makerspace areas (3D, Laser, Shelf); reviewer counts pending **1** / approved **1** / rejected **0**; per-area pending 3D=**1**, Laser=**0**, Shelf=**0** (IDs may differ from SQL seed — document base seed in file header)
- `fixtures/requests-mixed-status.json` — `requests` + embedded `summary` per §8.1 (not a separate count call)
- `fixtures/items-makerspace-3d.json` — PLA qty 12 reorder 4, Resin qty 2 reorder 3
- `fixtures/error-validation-400.json` — error envelope with `fields`

Not required on disk until FE-P0-07; mock adapter rejects duplicate alias keys (`groupId` vs `categoryId` in same object).

---

*End of front-end next-steps document.*