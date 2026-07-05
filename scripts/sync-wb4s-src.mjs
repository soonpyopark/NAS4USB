import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WB4S_SYNC_EXCLUDE_DIRS,
  WB4S_UPSTREAM_VERSION,
  getWb4sCacheSrc,
  getWb4sSiblingSrc,
} from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wb4sSrc = getWb4sCacheSrc(root);
const siblingSrc = getWb4sSiblingSrc(root);

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, 'package.json'), 'utf8');
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
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
    throw new Error(
      `Sibling WhiteBoard4Share v${WB4S_UPSTREAM_VERSION} not found at ${siblingSrc}`,
    );
  }

  const siblingVersion = await readPackageVersion(siblingSrc);
  if (siblingVersion !== WB4S_UPSTREAM_VERSION) {
    throw new Error(
      `Sibling version is ${siblingVersion ?? 'unknown'}, expected ${WB4S_UPSTREAM_VERSION}`,
    );
  }

  console.log(`[sync-wb4s-src] copying ${siblingSrc} → ${wb4sSrc}`);
  await fs.rm(wb4sSrc, { recursive: true, force: true });
  await copyDir(siblingSrc, wb4sSrc, { excludeDirs: [...WB4S_SYNC_EXCLUDE_DIRS] });
  console.log('[sync-wb4s-src] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
