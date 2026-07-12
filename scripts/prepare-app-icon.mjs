import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

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

// 둥근 모서리 반경 비율 (아이콘 한 변 대비). iOS 스퀘어클 대비 살짝 보수적으로 18%.
const CORNER_RADIUS_RATIO = 0.18;
// 밝은 체커 배경(흰색/연회색)으로 간주할 임계값. 이보다 밝으면 배경으로 취급.
const LIGHT_BG_THRESHOLD = 185;

/**
 * 소스 이미지에서 실제 아트워크 영역을 검출해 정사각형으로 크롭하고,
 * 둥근 모서리(투명)를 적용한 마스터 PNG를 생성한다.
 * @param {string} sourcePath
 * @param {string} outPath
 * @param {number} masterSize
 * @returns {Promise<string>} 생성된 마스터 PNG 경로
 */
async function buildRoundedMaster(sourcePath, outPath, masterSize = 1024) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels >= 4 ? data[idx + 3] : 255;
      const isLightBg =
        a < 8 || (r > LIGHT_BG_THRESHOLD && g > LIGHT_BG_THRESHOLD && b > LIGHT_BG_THRESHOLD);
      if (isLightBg) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const squared = await sharp(sourcePath)
    .ensureAlpha()
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize(masterSize, masterSize, { fit: 'fill' })
    .png()
    .toBuffer();

  const radius = Math.round(masterSize * CORNER_RADIUS_RATIO);
  const maskSvg = Buffer.from(
    `<svg width="${masterSize}" height="${masterSize}"><rect x="0" y="0" width="${masterSize}" height="${masterSize}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );

  const rounded = await sharp(squared)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  fs.writeFileSync(outPath, rounded);
  console.log(
    `[icons] rounded master (crop ${cropW}x${cropH} → ${masterSize}px, corner ${Math.round(
      CORNER_RADIUS_RATIO * 100,
    )}%) → ${path.relative(projectRoot, outPath)}`,
  );
  return outPath;
}

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

  console.log('[icons] icon.png (512px) → build/, public/, electron/, wb4s-editor/, src/wb4s/');
}

/**
 * @param {string} icon256Path
 */
function syncDerivedPublicAssets(icon256Path, icon512Path, icon32Path, icon16Path) {
  fs.copyFileSync(icon512Path, path.join(publicDir, 'icon-512.png'));
  fs.copyFileSync(icon256Path, path.join(publicDir, 'apple-touch-icon.png'));
  fs.copyFileSync(icon32Path, path.join(publicDir, 'favicon-32.png'));
  fs.copyFileSync(icon16Path, path.join(publicDir, 'favicon-16.png'));

  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    const from = path.join(buildDir, `icon-${size}.png`);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(publicDir, `icon-${size}.png`));
    }
  }
}

/**
 * @param {string} icon512Path
 */
async function generatePlatformIcons(icon512Path) {
  const icoFiles = [
    'icon-16.png',
    'icon-32.png',
    'icon-48.png',
    'icon-64.png',
    'icon-128.png',
    'icon-256.png',
    'icon-512.png',
    'icon-1024.png',
  ].filter((fileName) => fs.existsSync(path.join(buildDir, fileName)));

  const icoBuffer = await pngToIco(icoFiles.map((fileName) => path.join(buildDir, fileName)));
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  fs.copyFileSync(icoPath, path.join(publicDir, 'favicon.ico'));
  fs.copyFileSync(icoPath, path.join(electronDir, 'icon.ico'));
  console.log(`[icons] icon.ico (${icoFiles.length} sizes, up to 1024px) → build/, public/favicon.ico, electron/`);

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
  { size: 1024, out: 'icon-1024.png' },
];

const roundedMaster = await buildRoundedMaster(
  source,
  path.join(buildDir, 'icon-rounded-master.png'),
  1024,
);

for (const { size, out } of sizes) {
  run('npx', [
    '--yes',
    'sharp-cli',
    '-i',
    roundedMaster,
    '-o',
    path.join(buildDir, out),
    'resize',
    String(size),
    String(size),
  ]);
}

const icon512Path = path.join(buildDir, 'icon-512.png');
const icon32Path = path.join(buildDir, 'icon-32.png');
const icon16Path = path.join(buildDir, 'icon-16.png');

syncIconPngToTargets(icon512Path);
syncDerivedPublicAssets(icon512Path, icon512Path, icon32Path, icon16Path);
await generatePlatformIcons(icon512Path);

console.log('[icons] NAS4USB icons ready');
