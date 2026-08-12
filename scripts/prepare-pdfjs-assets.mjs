import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pdfjsRoot = path.join(root, 'node_modules', 'pdfjs-dist');
const outRoot = path.join(root, 'public', 'pdfjs');

/**
 * @param {string} src
 * @param {string} dest
 */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  await fs.access(pdfjsRoot);

  // Fresh copy so renamed/removed upstream files do not linger.
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outRoot, { recursive: true });

  await copyDir(path.join(pdfjsRoot, 'wasm'), path.join(outRoot, 'wasm'));
  await copyDir(path.join(pdfjsRoot, 'cmaps'), path.join(outRoot, 'cmaps'));
  await copyDir(path.join(pdfjsRoot, 'standard_fonts'), path.join(outRoot, 'standard_fonts'));

  console.log(`[prepare:pdfjs] synced → ${path.relative(root, outRoot)}`);
}

main().catch((error) => {
  console.error('[prepare:pdfjs] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
