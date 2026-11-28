import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { getPool } from '../../src/db/pool.js';
import { config } from '../../src/config.js';
import {
  FIXTURE_TAG,
  createFixtureUser,
  removeFixtureUsers,
} from '../integration/helpers.js';
import { destroyFixtureSessions, issueSessionForUser } from './session-fixture.js';
import { resolveChromiumExecutable } from './browser-path.js';
import { attachPageDiagnostics } from './page-tracker.js';

const runSmoke = process.env.LAB_RUN_SMOKE === '1';
const baseUrl =
  process.env.LAB_SMOKE_BASE_URL || `http://127.0.0.1:${config.port}`;

async function assertServerReachable() {
  const res = await fetch(`${baseUrl}/login.html`, { redirect: 'manual' });
  assert.ok(res.ok, `Expected running app at ${baseUrl}, got HTTP ${res.status}`);
}

async function newAuthedPage(browser, playwrightCookie) {
  const context = await browser.newContext();
  await context.addCookies([playwrightCookie]);
  const page = await context.newPage();
  const diag = attachPageDiagnostics(page);
  return { context, page, diag };
}

async function waitDashboardLoaded(page) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('total-items');
      const t = el?.textContent?.trim() ?? '';
      return t && t !== '…' && t !== '!' && t !== '--';
    },
    { timeout: 20_000 },
  );
}

async function waitAuthSidebar(page, roleSubstring) {
  await page.waitForSelector('.sidebar-user', { timeout: 15_000 });
  const text = await page.locator('.sidebar-user').innerText();
  assert.match(text, new RegExp(roleSubstring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test(
  'smoke: authenticated pages render with session cookie, no JS errors, role guard',
  { skip: !runSmoke, timeout: 120_000 },
  async (t) => {
    await getPool();
    await assertServerReachable();

    const admin = await createFixtureUser({
      roleName: 'Admin',
      email: `smoke-admin-${FIXTURE_TAG}@example.com`,
    });
    const staff = await createFixtureUser({
      roleName: 'Full-time Lab Worker',
      email: `smoke-staff-${FIXTURE_TAG}@example.com`,
    });
    const student = await createFixtureUser({
      roleName: 'Student Worker',
      email: `smoke-student-${FIXTURE_TAG}@example.com`,
    });

    const adminSession = await issueSessionForUser(admin.userId);
    const staffSession = await issueSessionForUser(staff.userId);
    const studentSession = await issueSessionForUser(student.userId);

    t.after(async () => {
      await destroyFixtureSessions();
      await removeFixtureUsers();
    });

    const executablePath = resolveChromiumExecutable();
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });
    t.after(async () => {
      await browser.close();
    });

    // --- Staff: core workflow pages ---
    {
      const { context, page, diag } = await newAuthedPage(browser, staffSession.playwrightCookie);
      try {
        await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await waitAuthSidebar(page, 'Full-time Lab Worker');
        await waitDashboardLoaded(page);
        const totalItems = await page.locator('#total-items').innerText();
        assert.match(totalItems, /^\d+$/);
        const pending = await page.locator('#pending-count').innerText();
        assert.match(pending, /^\d+$/);
        diag.assertClean();

        await page.goto(`${baseUrl}/inventory.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#item-table-body', { timeout: 15_000 });
        const rowCount = await page.locator('#item-table-body tr').count();
        const emptyVisible = await page.locator('#item-empty').isVisible();
        assert.ok(rowCount > 0 || emptyVisible, 'inventory should show rows or empty state');
        diag.assertClean();

        await page.goto(`${baseUrl}/supply-requests.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => {
            const updated = document.getElementById('last-updated')?.textContent ?? '';
            const pending = document.getElementById('pending-count')?.textContent?.trim() ?? '';
            return updated.startsWith('Updated') && /^\d+$/.test(pending);
          },
          { timeout: 15_000 },
        );
        await page.waitForSelector('#request-table-body', { state: 'attached', timeout: 15_000 });
        diag.assertClean();

        await page.goto(`${baseUrl}/locations.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#locationTableBody', { timeout: 15_000 });
        const locRows = await page.locator('#locationTableBody tr').count();
        assert.ok(locRows > 0, 'locations table should list at least one area');
        diag.assertClean();

        await page.goto(`${baseUrl}/profile.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#email', { timeout: 15_000 });
        const emailVal = await page.locator('#email').inputValue();
        assert.equal(emailVal, staff.email);
        diag.assertClean();
      } finally {
        await context.close();
      }
    }

    // --- Staff: direct URL to admin-only page redirects ---
    {
      const { context, page } = await newAuthedPage(browser, staffSession.playwrightCookie);
      try {
        await page.goto(`${baseUrl}/user-management.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/dashboard\.html/i, { timeout: 15_000 });
        assert.match(page.url(), /dashboard\.html/i);
      } finally {
        await context.close();
      }
    }

    // --- Student: same guard ---
    {
      const { context, page } = await newAuthedPage(browser, studentSession.playwrightCookie);
      try {
        await page.goto(`${baseUrl}/user-management.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/dashboard\.html/i, { timeout: 15_000 });
      } finally {
        await context.close();
      }
    }

    // --- Admin: user management renders ---
    {
      const { context, page, diag } = await newAuthedPage(browser, adminSession.playwrightCookie);
      try {
        await page.goto(`${baseUrl}/user-management.html`, { waitUntil: 'domcontentloaded' });
        await waitAuthSidebar(page, 'Admin');
        await page.waitForSelector('#userTableBody tr', { timeout: 15_000 });
        const usersListed = await page.locator('#userTableBody tr').count();
        assert.ok(usersListed >= 1, 'user management should list users');
        assert.match(page.url(), /user-management\.html/i);
        diag.assertClean();
      } finally {
        await context.close();
      }
    }
  },
);