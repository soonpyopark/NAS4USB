import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const publicDir = path.join(projectRoot, 'public');
const electronDir = path.join(projectRoot, 'electron');
const sourceCandidates = [
  path.join(buildDir, 'icon-source.png'),
  path.join(buildDir, 'icon-source.jpg'),
  path.join(buildDir, 'icon-source.jpeg'),
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!source) {
  console.warn('[icons] build/icon-source.(png|jpg|jpeg) not found — skipping icon generation.');
  if (fs.existsSync(path.join(publicDir, 'icon.png'))) {
    fs.mkdirSync(electronDir, { recursive: true });
    fs.copyFileSync(path.join(publicDir, 'icon.png'), path.join(electronDir, 'splash-icon.png'));
    console.log('[icons] splash-icon.png ← public/icon.png');
  }
  process.exit(0);
}

const sizes = [
  { size: 16, out: 'icon-16.png' },
  { size: 32, out: 'icon-32.png' },
  { size: 48, out: 'icon-48.png' },
  { size: 64, out: 'icon-64.png' },
  { size: 128, out: 'icon-128.png' },
  { size: 256, out: 'icon-256.png' },
  { size: 512, out: 'icon-512.png' },
];

for (const { size, out } of sizes) {
  run('npx', ['--yes', 'sharp-cli', '-i', source, '-o', path.join(buildDir, out), 'resize', String(size), String(size)]);
}

fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(buildDir, 'icon.png'));
fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(publicDir, 'icon.png'));
fs.copyFileSync(path.join(buildDir, 'icon-512.png'), path.join(publicDir, 'icon-512.png'));
fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(publicDir, 'apple-touch-icon.png'));
fs.copyFileSync(path.join(buildDir, 'icon-32.png'), path.join(publicDir, 'favicon-32.png'));
fs.copyFileSync(path.join(buildDir, 'icon-16.png'), path.join(publicDir, 'favicon-16.png'));

const icoInputs = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-64.png', 'icon-128.png', 'icon-256.png']
  .map((fileName) => `"${path.join(buildDir, fileName)}"`)
  .join(' ');

const icoBuffer = execSync(`npx --yes png-to-ico ${icoInputs}`, {
  encoding: 'buffer',
  shell: true,
});
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
fs.copyFileSync(path.join(buildDir, 'icon.ico'), path.join(publicDir, 'favicon.ico'));
fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(publicDir, 'wb4s-editor', 'icon.png'));
fs.mkdirSync(electronDir, { recursive: true });
fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(electronDir, 'splash-icon.png'));

console.log('[icons] NAS4USB icons ready → build/ + public/ + electron/splash-icon.png');
