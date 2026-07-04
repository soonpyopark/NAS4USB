import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const rhwpSrc = path.join(root, '.cache', 'rhwp-src');
const rhwpStudio = path.join(rhwpSrc, 'rhwp-studio');
const rhwpPkg = path.join(rhwpSrc, 'pkg');
const rhwpCore = path.join(root, 'node_modules', '@rhwp', 'core');
const publicOut = path.join(root, 'public', 'rhwp-studio');

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

async function ensureRhwpSource() {
  try {
    await fs.access(path.join(rhwpStudio, 'package.json'));
  } catch {
    console.log('[rhwp-studio] cloning edwardkim/rhwp …');
    await fs.mkdir(path.dirname(rhwpSrc), { recursive: true });
    await run(root, 'git', ['clone', '--depth', '1', 'https://github.com/edwardkim/rhwp.git', rhwpSrc]);
  }
}

async function syncWasmPkg() {
  await fs.mkdir(rhwpPkg, { recursive: true });
  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpCore, name), path.join(rhwpPkg, name));
  }
}

async function buildWasmFromSource() {
  const hasCargo = await commandExists('cargo');
  const hasWasmPack = hasCargo && (await commandExists('wasm-pack'));

  if (hasWasmPack) {
    console.log('[rhwp-studio] wasm-pack build …');
    await run(rhwpSrc, 'wasm-pack', ['build', '--target', 'web', '--out-dir', 'pkg']);
  } else {
    console.log('[rhwp-studio] building WASM via Docker …');
    await run(root, 'docker', [
      'run',
      '--rm',
      '-v',
      `${rhwpSrc}:/app`,
      '-w',
      '/app',
      'rust:latest',
      'sh',
      '-c',
      'export PATH=/usr/local/cargo/bin:$PATH && rustup target add wasm32-unknown-unknown && cargo install wasm-pack --version 0.15.0 --locked && wasm-pack build --target web --out-dir pkg',
    ]);
  }

  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpPkg, name), path.join(rhwpCore, name));
  }
  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpPkg, name), path.join(rhwpStudio, 'public', name));
  }
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      shell: true,
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function buildStudio() {
  console.log('[rhwp-studio] npm install …');
  await run(rhwpStudio, 'npm', ['install'], { shell: process.platform === 'win32' });
  console.log('[rhwp-studio] vite build (offline bundle) …');
  await run(rhwpStudio, 'npx', ['vite', 'build', '--base=./'], { shell: process.platform === 'win32' });
}

async function stripEmbedBlockers(outDir) {
  const indexPath = path.join(outDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf8');
  html = html
    .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
    .replace(/<link rel="manifest" href="[^"]*">/g, '')
    .replace(
      '<script src="./theme-init.js"></script>',
      '<script src="./theme-init.js"></script>\n  <script src="./embed-init.js"></script>',
    );
  await fs.writeFile(indexPath, html, 'utf8');
  await fs.copyFile(path.join(root, 'scripts', 'rhwp-embed-init.js'), path.join(outDir, 'embed-init.js'));
  for (const name of ['registerSW.js', 'sw.js', 'workbox-dcde9eb3.js', 'manifest.webmanifest']) {
    await fs.rm(path.join(outDir, name), { force: true });
  }
}

async function publishDist() {
  const distDir = path.join(rhwpStudio, 'dist');
  await fs.rm(publicOut, { recursive: true, force: true });
  await fs.cp(distDir, publicOut, { recursive: true });
  await stripEmbedBlockers(publicOut);
  console.log(`[rhwp-studio] published → ${publicOut}`);
}

await ensureRhwpSource();
await buildWasmFromSource();
await buildStudio();
await publishDist();
