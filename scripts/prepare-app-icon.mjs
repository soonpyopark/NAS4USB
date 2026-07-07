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

function tryRun(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

/**
 * @param {string} iconPngPath
 */
function syncIconPngToTargets(iconPngPath) {
  const targets = [
    path.join(buildDir, 'icon.png'),
    path.join(publicDir, 'icon.png'),
    path.join(electronDir, 'icon.png'),
    path.join(publicDir, 'wb4s-editor', 'icon.png'),
    path.join(projectRoot, 'src', 'wb4s', 'icon.png'),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(iconPngPath, target);
  }

  console.log('[icons] icon.png → build/, public/, electron/, wb4s-editor/, src/wb4s/');
}

/**
 * @param {string} icon256Path
 */
function syncDerivedPublicAssets(icon256Path, icon512Path, icon32Path, icon16Path) {
  fs.copyFileSync(icon512Path, path.join(publicDir, 'icon-512.png'));
  fs.copyFileSync(icon256Path, path.join(publicDir, 'apple-touch-icon.png'));
  fs.copyFileSync(icon32Path, path.join(publicDir, 'favicon-32.png'));
  fs.copyFileSync(icon16Path, path.join(publicDir, 'favicon-16.png'));

  for (const size of [16, 32, 48, 64, 128, 256]) {
    const from = path.join(buildDir, `icon-${size}.png`);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(publicDir, `icon-${size}.png`));
    }
  }
}

/**
 * @param {string} icon512Path
 */
function generatePlatformIcons(icon512Path) {
  const icoInputs = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-64.png', 'icon-128.png', 'icon-256.png']
    .map((fileName) => `"${path.join(buildDir, fileName)}"`)
    .join(' ');

  const icoBuffer = execSync(`npx --yes png-to-ico ${icoInputs}`, {
    encoding: 'buffer',
    shell: true,
  });
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  fs.copyFileSync(path.join(buildDir, 'icon.ico'), path.join(publicDir, 'favicon.ico'));
  console.log('[icons] icon.ico → build/ + public/favicon.ico');

  const icnsBase = path.join(buildDir, 'icon');
  const icnsOk = tryRun('npx', [
    '--yes',
    'png2icons',
    icon512Path,
    icnsBase,
    '-icns',
  ]);
  const icnsPath = `${icnsBase}.icns`;
  if (icnsOk && fs.existsSync(icnsPath)) {
    console.log('[icons] icon.icns → build/ (macOS)');
  } else {
    console.warn('[icons] icon.icns generation skipped — mac build will use build/icon.png');
  }
}

const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!source) {
  console.warn('[icons] build/icon-source.(png|jpg|jpeg) not found — syncing existing public/icon.png only.');
  const existing = path.join(publicDir, 'icon.png');
  if (fs.existsSync(existing)) {
    syncIconPngToTargets(existing);
  } else if (fs.existsSync(path.join(buildDir, 'icon.png'))) {
    syncIconPngToTargets(path.join(buildDir, 'icon.png'));
  } else {
    console.warn('[icons] No icon.png found — run prepare:icons after adding build/icon-source.*');
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

const icon256Path = path.join(buildDir, 'icon-256.png');
const icon512Path = path.join(buildDir, 'icon-512.png');
const icon32Path = path.join(buildDir, 'icon-32.png');
const icon16Path = path.join(buildDir, 'icon-16.png');

syncIconPngToTargets(icon256Path);
syncDerivedPublicAssets(icon256Path, icon512Path, icon32Path, icon16Path);
generatePlatformIcons(icon512Path);

console.log('[icons] NAS4USB icons ready');
