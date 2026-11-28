import '../load-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptPath = path.join(repoRoot, 'start-local.ps1');

const isWindows = process.platform === 'win32';

function sqlEndpoint() {
  const server = process.env.LAB_DB_SERVER || '127.0.0.1';
  const port = Number(process.env.LAB_DB_PORT || 14333);
  return { server, port };
}

function canReachSql() {
  const { server, port } = sqlEndpoint();
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

function runPowerShellCheckOnly(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-CheckOnly'],
      {
        cwd: repoRoot,
        env: { ...process.env, ...extraEnv },
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
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test(
  'start-local.ps1 -CheckOnly succeeds when Node and SQL are reachable',
  { skip: !isWindows },
  async (t) => {
    const reachable = await canReachSql();
    if (!reachable) {
      t.skip('loopback SQL not reachable (set LAB_DB_* in .env and start SQL)');
      return;
    }
    const { code, stdout, stderr } = await runPowerShellCheckOnly();
    assert.equal(code, 0, `stderr: ${stderr}`);
    assert.match(stdout, /Prerequisites OK/);
    assert.doesNotMatch(stdout, /LAB_DB_PASSWORD|password/i);
  },
);

test(
  'start-local.ps1 -CheckOnly refuses when SQL port is closed',
  { skip: !isWindows },
  async () => {
    const { code } = await runPowerShellCheckOnly({ LAB_DB_PORT: '59999' });
    assert.equal(code, 3);
  },
);