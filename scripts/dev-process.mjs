import { execSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SYNC_PORT } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const command = process.argv[2] ?? 'restart';
const port = Number(process.env.PORT ?? DEFAULT_SYNC_PORT);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getListeningPids(targetPort) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${targetPort}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts.at(-1));
        if (pid > 0) pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -ti tcp:${targetPort} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => pid > 0);
  } catch {
    return [];
  }
}

function killPidTree(pid) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    return;
  }
  process.kill(pid, 'SIGTERM');
}

async function isPortFree(targetPort) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(targetPort, '127.0.0.1');
  });
}

async function waitForPortFree(targetPort, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pids = getListeningPids(targetPort);
    if (pids.length === 0 && (await isPortFree(targetPort))) {
      return true;
    }
    await sleep(400);
  }
  return false;
}

async function stopDevServer() {
  const pids = getListeningPids(port);
  if (pids.length === 0) {
    console.log(`[dev] No process is listening on port ${port}.`);
    return;
  }

  console.log(`[dev] Stopping process(es) on port ${port}: ${pids.join(', ')}`);
  for (const pid of pids) {
    try {
      killPidTree(pid);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[dev] Failed to stop PID ${pid}: ${message}`);
    }
  }

  const released = await waitForPortFree(port);
  if (!released) {
    console.error(`[dev] Port ${port} is still in use. Close the remaining process manually and retry.`);
    process.exit(1);
  }

  console.log(`[dev] Port ${port} is free.`);
}

async function restartDevServer() {
  await stopDevServer();
  console.log('[dev] Starting npm run dev…');
  const child = spawn('npm run dev', {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (command === 'stop') {
  await stopDevServer();
} else if (command === 'restart') {
  await restartDevServer();
} else {
  console.error('Usage: node scripts/dev-process.mjs [stop|restart]');
  process.exit(1);
}
