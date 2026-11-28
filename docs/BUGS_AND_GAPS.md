# Bugs and integration gaps

## Fixed in this integration

| Issue | Location | Fix |
|-------|----------|-----|
| Destructive `DROP DATABASE` bootstrap | `Database/LabInventory.sql` | Use `Database/LabInventory_Init.sql` instead |
| `ALTER Phone` before column exists | `LabInventory.sql` | Init script defines `Phone` in `CREATE TABLE` |
| `usp_AdjustItemQuantity` before `InventoryLogs` | `LabInventory.sql` | Init correct table order |
| Duplicate `Areas` unique constraint add/drop | `LabInventory.sql` | Single `UQ_Areas_Space_AreaName` in Init |
| SupplyRequests schema drift vs API | Migrate + Init | `ItemNameSnapshot`, `RowVersion`, XOR check |
| Item PUT overwrote `quantityOnHand`; optional `rowVersion` | `api.js`, `Inventory.js` | Qty changes only via `POST /items/:id/quantity`; PUT requires `rowVersion` |
| Bootstrap admin echoed password / silent overwrite | `bootstrap-admin.js` | Masked TTY prompt; `LAB_ADMIN_RECOVERY=1` for overwrite |
| API listened on all interfaces | `index.js`, `config.js` | Default `LAB_HTTP_BIND=127.0.0.1` |
| Front-end mock auth / `TEST_ROLE` bypass | `current-user.js`, `login.js` | Session cookie + `GET /api/auth/me` |
| False success on profile / password reset mocks | `profile.js` | Real API; reset UI disabled honestly |
| `inventory.html` → wrong script case | `Inventory.html` | `js/Inventory.js` |

## Remaining / lead review

| ID | Severity | Note |
|----|----------|------|
| B-01 | Low | Dashboard has no space selector; defaults to Makerspace |
| B-02 | Medium | Inventory UI cannot map new categories to areas (staff must use API `PUT /area-categories`) |
| B-03 | Low | `locations` "Created" column shows placeholder — `Areas` has no `CreatedAt` in schema |
| B-04 | Info | `LabInventory.sql` UTF-16 file still broken if executed raw — documented in LOCAL_RUN |
| B-05 | Info | QA supply-request fixtures not fully seeded in SQL (optional `LabInventory_Seed_QA_Data.sql` partial) |
| B-06 | Low | Student role per original REQS_V2 allows item CRUD; MVP follows matrix (staff-only CRUD) per `REQS_NEXT_STEPS.md` |