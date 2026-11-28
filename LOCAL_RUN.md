# Lab Inventory — local run (SQL Server + API + UI)

Each teammate uses an **independent local database** on their own Windows PC. Data does **not** sync. Use **SQL Server 2025 Express** and `start-local.ps1` — **no Docker**.

---

## New teammate: install and run (follow in order)

### 1. Install prerequisites

**Node.js 20+** — https://nodejs.org/ (LTS is fine).

**SQL Server 2025 Express** — https://www.microsoft.com/en-us/sql-server/sql-server-downloads  

During setup:

- Choose **Express** and a **named instance** (e.g. **`SQLEXPRESS`**).
- Select **Mixed Mode** authentication and set a strong **`sa` password** (remember it for `.env` — never commit it).
- When offered **Add Current User as SQL Server administrator**, accept it (helps local admin tasks).
- **SQL Server Management Studio (SSMS)** is optional but useful — install from the same download page if you want a GUI.
- If you picked a **Windows-only** authentication option by mistake, fix it in SSMS or reinstall with **Mixed Mode** before continuing.

**TCP/IP — loopback only (required)**  

Use **SQL Server Configuration Manager**:

1. **SQL Server Network Configuration** → **Protocols for `SQLEXPRESS`** (your instance) → enable **TCP/IP**.
2. Open **TCP/IP** properties → **Protocol** tab: set **Listen All** = **No**.
3. **IP Addresses** tab: find the row whose **IP Address** is `127.0.0.1`. Set **Enabled** = **Yes**, **TCP Dynamic Ports** = *(blank)*, **TCP Port** = **14333**. (**Active** is read-only — ignore it.)
4. For every other **IP*n*** row, set **Enabled** = **No**.
5. If you do not see a `127.0.0.1` row, stop and consult SQL Server Configuration Manager help — do **not** use **IPAll** (it applies to all interfaces and is unsafe for loopback-only dev).
6. Restart the **SQL Server (`SQLEXPRESS`)** Windows service and confirm the instance listens on **`127.0.0.1:14333`** only (not all interfaces).

The server must accept connections on **`127.0.0.1:14333`** only — not on all interfaces (`0.0.0.0`). Prefer firewall rules scoped to **loopback** / local dev if you open SQL at all.

### 2. Configure `.env`

From the **repo root** in **PowerShell**:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set at least:

- **`LAB_DB_PASSWORD`** — your SQL **`sa`** password from Mixed Mode setup (API connects as `sa`). This is **not** what you type on the web login page.
- **`LAB_CLASS_PASSWORD='Panther$'`** — use **single quotes** in `.env` so `$` is not expanded (needed later for optional class reset; harmless if unset for bootstrap-only setup).

Defaults in `.env.example` already point at `127.0.0.1`, port **14333**, database `LabInventory`, and HTTP on `127.0.0.1:3000`. Do not commit `.env`.

### 3. First-time start (schema + admin + server)

Still in PowerShell at the repo root:

```powershell
.\start-local.ps1 -FirstSetup -BootstrapAdmin
```

- Runs `npm install` if needed, creates the database schema, prompts for the **admin account password** (masked input — use **`Panther$`** for this class).
- Starts the API and static UI. Leave this window running while you work.
- Open http://127.0.0.1:3000/login.html  
- Sign in: **`admin@lab.example`** / **`Panther$`** (application password).

**Press Ctrl+C** in that PowerShell window to stop the server.

Run **`-FirstSetup` only once** on a new empty database. It does not drop existing data, but you do not need to run it on every login.

### 4. Daily start

```powershell
.\start-local.ps1
```

Verifies Node and SQL TCP, loads `.env`, starts the app. It does **not** run migrations, seed, or reset. Stop with **Ctrl+C**.

---

## Already have a database?

If you previously completed setup (or restored a backup) and **`LabInventory` already has users**:

```powershell
.\start-local.ps1
```

Use your existing application password. **Do not** rerun `-FirstSetup` on a working database — it is non-destructive but unnecessary once setup is complete. **Do not** run `db:seed-qa` or `class:reset-accounts` unless you intend to modify dev data (seed) or delete fixture accounts and rotate application passwords (reset); back up first.

---

## Optional QA seed and class reset

**Not required** for the default path above (single bootstrap admin).

| Goal | When |
|------|------|
| Sample items + multiple test users | One-time: `cd server` → `npm run db:seed-qa` on **your local dev DB only** |
| Align all **active** users to one shared app password | Instructor/lead: back up DB, set `LAB_CLASS_PASSWORD='Panther$'` in `.env`, then `cd server` → `npm run class:reset-accounts` (preview: `npm run class:reset-accounts -- --dry-run`) |

After seed + reset, typical **active** logins use application password **`Panther$`**: `student.a@lab.example`, `student.b@lab.example`, `worker.ft@lab.example`, `admin@lab.example`. The account **`lab-review@local.test`** is for local review/fixture workflows and is **not** part of the default `-BootstrapAdmin` flow.

---

## Manual setup (reference, all platforms)

```powershell
cd server
npm install
npm run db:init
npm run db:migrate
```

Create admin without the launcher:

```powershell
$env:LAB_ADMIN_EMAIL = 'admin@lab.example'
npm run bootstrap-admin
```

(Password via masked prompt or `LAB_ADMIN_PASSWORD` in `.env` only — never on the command line.)

Start app only: `npm start`.

## Database notes

Bootstrap uses `Database/LabInventory_Init.sql`. Do **not** run `Database/LabInventory.sql` directly. See `docs/DATA_MIGRATIONS.md` for optional manual fixes.

## Tests

From `server/`:

**Unit tests (no database):**

```powershell
npm test
```

**Integration tests (loopback SQL; reads repo `.env`):**

```powershell
$env:LAB_RUN_INTEGRATION = '1'
npm run test:integration
```

**Browser smoke (app must be running):**

```powershell
# Terminal 1: npm start
$env:LAB_RUN_SMOKE = '1'
npm run test:smoke
```

Optional: `LAB_SMOKE_BASE_URL`, `LAB_SMOKE_BROWSER`.

## Verified vs manual

| Area | Status |
|------|--------|
| Login, session, CSRF | Integration tests |
| Inventory list / qty / PUT rowVersion | Integration tests |
| Dashboard totals vs inventory list mapping | Integration tests |
| Supply requests, admin guards, profile | Integration tests |
| Front-end asset path casing (Linux-safe) | Unit test `frontend-assets.test.js` |
| Class reset selection / dry-run report | Unit test `class-reset-accounts.test.js` |
| `start-local.ps1 -CheckOnly` | Unit test `launcher/start-local.check.test.js` (Windows) |
| `start-local.ps1` npm fail-closed | Unit test `launcher/start-local.fail-closed.test.js` (Windows) |
| `start-local.ps1 -FirstSetup` on alt port | Unit test `launcher/start-local.first-setup.test.js` (Windows + loopback SQL) |
| Full browser click-through | `test:smoke` with `LAB_RUN_SMOKE=1` |

See `docs/BUGS_AND_GAPS.md` for remaining front-end gaps.

**Quick check without starting the app:** `.\start-local.ps1 -CheckOnly` (Node + SQL TCP only).