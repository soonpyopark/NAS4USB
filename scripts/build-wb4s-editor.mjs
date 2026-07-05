import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getWb4sVendorRoot } from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const vendorRoot = getWb4sVendorRoot(root);
const publicOut = path.join(root, 'public', 'wb4s-editor');

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

async function publishDist() {
  const distDir = path.join(vendorRoot, 'dist');
  await fs.rm(publicOut, { recursive: true, force: true });
  await fs.cp(distDir, publicOut, { recursive: true });
  console.log(`[wb4s-editor] published → ${publicOut}`);
}

async function main() {
  console.log('[wb4s-editor] npm install …');
  await run(vendorRoot, 'npm', ['install'], { shell: process.platform === 'win32' });

  console.log('[wb4s-editor] vite build …');
  await run(vendorRoot, 'npm', ['run', 'build'], { shell: process.platform === 'win32' });

  await publishDist();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
