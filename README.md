# Lab Inventory Management

Lab inventory web app (static front-end + Node API) backed by **SQL Server on loopback** (`127.0.0.1`). Each teammate runs a **local database on their own PC** — no Docker, and data does not sync between machines.

## Quick start (Windows)

Follow **[LOCAL_RUN.md](LOCAL_RUN.md)** for the full guide. Summary of the **one-time** path for a new teammate:

1. Install **Node.js 20+** and **SQL Server 2025 Express** (named instance `SQLEXPRESS`, Mixed Mode, loopback-only TCP on port **14333**).
2. Copy `.env.example` to `.env`, set your SQL `sa` password and (optionally) `LAB_CLASS_PASSWORD='Panther$'`.
3. Run once: `.\start-local.ps1 -FirstSetup -BootstrapAdmin` — use **`Panther$`** at the admin password prompt for this class.
4. Open http://127.0.0.1:3000/login.html and sign in as **`admin@lab.example`** / **`Panther$`** (web password, not SQL `sa`).
5. Every day after that: `.\start-local.ps1` only. Press **Ctrl+C** to stop the server. Do **not** run `-FirstSetup` again — one-time setup only (`-FirstSetup` does not drop existing data).

**Already set up?** If your `LabInventory` database already has users, start with `.\start-local.ps1` and your existing login — do not run first setup, seed, or class reset on that database.

**Two passwords:** `LAB_DB_PASSWORD` in `.env` is SQL Server **`sa`** (from install). The login page uses the **application** password (`Panther$` for class admin/bootstrap).

### Optional class QA accounts (not required to run)

Instructors or teammates who want **seeded sample users** (not the default first-login path) can load QA data and run a one-time class password reset — see [LOCAL_RUN.md — Optional QA seed and class reset](LOCAL_RUN.md#optional-qa-seed-and-class-reset). After reset, active seeded accounts share the application password **`Panther$`**. Typical seeded emails include `student.a@lab.example`, `student.b@lab.example`, `worker.ft@lab.example`, and `admin@lab.example`. A separate local review account (`lab-review@local.test`) exists only for certain dev/review workflows — it is **not** created by the default bootstrap path.

## Repository layout

- `Front-end/` — HTML/CSS/JS UI
- `server/` — API, scripts, tests
- `Database/` — `LabInventory_Init.sql`, migrations, optional QA seed