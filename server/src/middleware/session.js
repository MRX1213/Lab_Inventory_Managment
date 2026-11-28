import crypto from 'node:crypto';
import { query, sql } from '../db/pool.js';
import { config } from '../config.js';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.LAB_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  };
}

export async function createSession(userId) {
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
  await query(
    `INSERT INTO dbo.UserSessions (SessionID, UserID, CsrfToken, ExpiresAt)
     VALUES (@sid, @uid, @csrf, @exp)`,
  {
    sid: sessionId,
    uid: userId,
    csrf: csrfToken,
    exp: expires,
  },
  );
  return { sessionId, csrfToken, expires };
}

export async function destroySession(sessionId) {
  if (!sessionId) return;
  await query('DELETE FROM dbo.UserSessions WHERE SessionID = @sid', { sid: sessionId });
}

export async function loadSession(sessionId) {
  if (!sessionId) return null;
  const r = await query(
    `SELECT s.SessionID, s.CsrfToken, s.ExpiresAt, u.*, ro.RoleName
     FROM dbo.UserSessions s
     INNER JOIN dbo.Users u ON u.UserID = s.UserID
     INNER JOIN dbo.Roles ro ON ro.RoleID = u.RoleID
     WHERE s.SessionID = @sid AND s.ExpiresAt > SYSUTCDATETIME() AND u.IsActive = 1`,
    { sid: sessionId },
  );
  const row = r.recordset[0];
  if (!row) return null;
  return { session: row, user: row, csrfToken: row.CsrfToken };
}

export function requireSession() {
  return async (req, res, next) => {
    const sid = req.cookies?.[config.cookieName];
    const loaded = await loadSession(sid);
    if (!loaded) {
      return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });
    }
    req.session = loaded.session;
    req.user = loaded.user;
    req.csrfToken = loaded.csrfToken;
    next();
  };
}

export function requireCsrf() {
  return (req, res, next) => {
    const token = req.get('X-CSRF-Token') || req.body?._csrf;
    if (!token || token !== req.csrfToken) {
      return res.status(403).json({ error: 'CSRF validation failed', code: 'CSRF' });
    }
    next();
  };
}