/**
 * Helper for manually merging a new WhiteBoard4Share release.
 *
 * Usage:
 *   node scripts/sync-wb4s-upstream.mjs           # clone upstream to scratch + print steps
 *   node scripts/sync-wb4s-upstream.mjs --diff    # git diff scratch vs vendor (needs git)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  WB4S_REPO,
  WB4S_SYNC_EXCLUDE_DIRS,
  WB4S_UPSTREAM_VERSION,
  getWb4sMergeScratch,
  getWb4sVendorRoot,
} from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const vendorRoot = getWb4sVendorRoot(root);
const scratch = getWb4sMergeScratch(root);
const overlayDir = path.join(root, 'vendor', 'wb4s-educowork-overlay');
const showDiff = process.argv.includes('--diff');

function run(cwd, command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
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

async function cloneUpstream() {
  console.log(`[wb4s-merge] cloning ${WB4S_REPO} → ${scratch} …`);
  await fs.mkdir(path.dirname(scratch), { recursive: true });
  await fs.rm(scratch, { recursive: true, force: true });
  await run(root, 'git', ['clone', '--depth', '1', WB4S_REPO, scratch]);
}

async function printMergeGuide() {
  console.log(`
=== WhiteBoard4Share upstream merge (manual) ===

Current vendored copy : ${vendorRoot}
Upstream scratch      : ${scratch}
Bundled version       : v${WB4S_UPSTREAM_VERSION}
EduCowork patches     : ${overlayDir}

Steps:
  1. Compare upstream scratch with vendor/whiteboard4share
       git diff --no-index vendor/whiteboard4share ${scratch}
     Or use your IDE "Compare Folders".

  2. Copy changed upstream files into vendor/whiteboard4share
     (exclude: node_modules, dist, exe, electron, electron-dist)

  3. Re-apply EduCowork patches (copy overlay onto vendor):
       vendor/wb4s-educowork-overlay/src/components/EditorView.tsx
       vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx
     See vendor/wb4s-educowork-overlay/PATCHES.md

  4. Update vendor/whiteboard4share/UPSTREAM.json version field

  5. Run: npm run prepare:wb4s-deps
     Then test .wb4s open / collab / close.

Optional: node scripts/sync-wb4s-upstream.mjs --diff
`);
}

async function main() {
  if (showDiff) {
    try {
      await run(root, 'git', [
        'diff',
        '--no-index',
        '--stat',
        vendorRoot,
        scratch,
      ]);
    } catch {
      console.warn('[wb4s-merge] git diff failed — run compare manually.');
    }
    return;
  }

  await cloneUpstream();
  await printMergeGuide();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
