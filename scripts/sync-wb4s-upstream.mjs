/**
 * Helper for manually merging a new WhiteBoard4Share release.
 *
 * Usage:
 *   node scripts/sync-wb4s-upstream.mjs           # clone upstream to scratch + print steps
 *   node scripts/sync-wb4s-upstream.mjs --diff    # git diff scratch vs .cache/wb4s-src (needs git)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WB4S_REPO,
  WB4S_UPSTREAM_VERSION,
  getWb4sCacheSrc,
  getWb4sLocalUpdatePackage,
  getWb4sMergeScratch,
  getWb4sOverlayDir,
} from './wb4s-upstream.mjs';
import { pathExists, runCommand } from './wb4s-engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const engineRoot = getWb4sCacheSrc(root);
const scratch = getWb4sMergeScratch(root);
const overlayDir = getWb4sOverlayDir(root);
const localUpdateDir = getWb4sLocalUpdatePackage(root);
const showDiff = process.argv.includes('--diff');

async function cloneUpstream() {
  console.log(`[wb4s-merge] cloning ${WB4S_REPO} → ${scratch} …`);
  const fs = await import('node:fs/promises');
  await fs.mkdir(path.dirname(scratch), { recursive: true });
  await fs.rm(scratch, { recursive: true, force: true });
  await runCommand(root, 'git', ['clone', '--depth', '1', WB4S_REPO, scratch]);
}

async function printMergeGuide() {
  console.log(`
=== WhiteBoard4Share upstream merge (manual) ===

Current engine cache   : ${engineRoot}
Upstream scratch       : ${scratch}
Offline update package : ${localUpdateDir}
Bundled version        : v${WB4S_UPSTREAM_VERSION}
NAS4USB patches      : ${overlayDir}

Steps:
  1. Compare upstream scratch with current engine cache
       git diff --no-index ${engineRoot} ${scratch}
     Or use your IDE "Compare Folders".

  2. Merge changes into overlay patches if needed (see PATCHES.md)

  3. Refresh offline package for USB:
       npm run prepare:wb4s-src
       copy .cache/wb4s-src → lib/updates/wb4s (exclude node_modules, dist)

  4. Bump WB4S_UPSTREAM_VERSION in scripts/wb4s-upstream.mjs when releasing new upstream

  5. Test: npm run dev — open .wb4s, collab, close

Optional: node scripts/sync-wb4s-upstream.mjs --diff
`);
}

async function main() {
  if (showDiff) {
    if (!(await pathExists(engineRoot))) {
      console.warn(`[wb4s-merge] engine cache missing: ${engineRoot} — run npm run prepare:wb4s-src first`);
      return;
    }
    try {
      await runCommand(root, 'git', ['diff', '--no-index', '--stat', engineRoot, scratch]);
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
