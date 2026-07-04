import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wb4sSrc = path.join(root, '.cache', 'wb4s-src');
const siblingSrc = path.resolve(root, '..', 'WhiteBoard4Share v1.0.2');

/** @type {readonly string[]} */
const SYNC_EXCLUDE_DIRS = ['node_modules', 'dist', 'exe', '.git', 'electron-dist', 'electron'];

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest, { excludeDirs = [] } = {}) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, { excludeDirs });
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  if (!(await pathExists(path.join(siblingSrc, 'package.json')))) {
    throw new Error(`Sibling WhiteBoard4Share not found at ${siblingSrc}`);
  }

  console.log(`[sync-wb4s-src] copying ${siblingSrc} → ${wb4sSrc}`);
  await fs.rm(wb4sSrc, { recursive: true, force: true });
  await copyDir(siblingSrc, wb4sSrc, { excludeDirs: [...SYNC_EXCLUDE_DIRS] });
  console.log('[sync-wb4s-src] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
