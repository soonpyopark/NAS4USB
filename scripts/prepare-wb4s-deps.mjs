import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getWb4sVendorRoot } from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const vendorRoot = getWb4sVendorRoot(root);

function run(cwd, command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pkgPath = path.join(vendorRoot, 'package.json');
  if (!(await pathExists(pkgPath))) {
    throw new Error(
      `WhiteBoard4Share vendor tree missing at ${vendorRoot}. See vendor/whiteboard4share/UPSTREAM.md`,
    );
  }

  const nodeModules = path.join(vendorRoot, 'node_modules');
  const lockPath = path.join(vendorRoot, 'package-lock.json');

  if (!(await pathExists(nodeModules))) {
    console.log('[wb4s] npm install in vendor/whiteboard4share …');
    await run(vendorRoot, 'npm', ['install'], { shell: process.platform === 'win32' });
    return;
  }

  const [pkgStat, lockStat, nodeStat] = await Promise.all([
    fs.stat(pkgPath),
    pathExists(lockPath).then((ok) => (ok ? fs.stat(lockPath) : null)),
    fs.stat(nodeModules),
  ]);

  const pkgNewer = pkgStat.mtimeMs > nodeStat.mtimeMs;
  const lockNewer = lockStat && lockStat.mtimeMs > nodeStat.mtimeMs;
  if (pkgNewer || lockNewer) {
    console.log('[wb4s] npm install (package changed) …');
    await run(vendorRoot, 'npm', ['install'], { shell: process.platform === 'win32' });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
