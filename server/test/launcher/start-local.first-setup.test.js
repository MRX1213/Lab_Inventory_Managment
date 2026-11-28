import '../load-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killProcessTree } from './process-tree.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptPath = path.join(repoRoot, 'start-local.ps1');
const isWindows = process.platform === 'win32';

function canReachSql() {
  const server = process.env.LAB_DB_SERVER || '127.0.0.1';
  const port = Number(process.env.LAB_DB_PORT || 14333);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: server, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(2000);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function pickEphemeralPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

function waitForHttp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      if (Date.now() > deadline) {
        reject(new Error(`timeout waiting for http://127.0.0.1:${port}`));
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/login.html`, { redirect: 'manual' });
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      setTimeout(tryOnce, 500);
    };
    tryOnce();
  });
}

test(
  'start-local.ps1 -FirstSetup serves on alternate LAB_HTTP_PORT (not 3000)',
  { skip: !isWindows, timeout: 240_000 },
  async (t) => {
    const reachable = await canReachSql();
    if (!reachable) {
      t.skip('loopback SQL not reachable');
      return;
    }
    if (!process.env.LAB_DB_PASSWORD) {
      t.skip('LAB_DB_PASSWORD required in .env for -FirstSetup integration');
      return;
    }

    const altPort = await pickEphemeralPort();
    assert.notEqual(altPort, 3000);

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-FirstSetup'],
      {
        cwd: repoRoot,
        env: { ...process.env, LAB_HTTP_PORT: String(altPort) },
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    let exitedEarly = null;
    child.on('close', (code) => {
      exitedEarly = code;
    });

    try {
      await waitForHttp(altPort, 180_000);
      assert.equal(exitedEarly, null, `process exited early (${exitedEarly}); stderr: ${stderr}`);
    } catch (err) {
      assert.fail(`${err.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    } finally {
      killProcessTree(child);
    }
  },
);