import { createSession, destroySession } from '../../src/middleware/session.js';
import { config } from '../../src/config.js';

const activeSessionIds = new Set();

export function sessionCookiePlaywright(sessionId) {
  return {
    name: config.cookieName,
    value: sessionId,
    url: `http://127.0.0.1:${config.port}`,
    httpOnly: true,
    sameSite: 'Lax',
  };
}

export async function issueSessionForUser(userId) {
  const { sessionId, csrfToken } = await createSession(userId);
  activeSessionIds.add(sessionId);
  return {
    sessionId,
    csrfToken,
    cookieHeader: `${config.cookieName}=${sessionId}`,
    playwrightCookie: sessionCookiePlaywright(sessionId),
  };
}

export async function destroyFixtureSessions() {
  const ids = [...activeSessionIds];
  activeSessionIds.clear();
  await Promise.all(ids.map((sid) => destroySession(sid)));
}