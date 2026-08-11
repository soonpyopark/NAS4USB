#!/usr/bin/env node
/**
 * Build Windows portable folder + zip for NAS4USB.
 *
 * Env (used by build:release):
 *   NAS4USB_BUILD_STAMP=YYMMDD_HHMMSS
 *   NAS4USB_SKIP_STAMP=1
 *   NAS4USB_SKIP_PUBLISH=1  — reuse .dist-build/release unpack
 *   NAS4USB_RELEASE_PORTABLE=1 — also write msi/NAS4USB v{ver}_{stamp}_portable.zip
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASE_STAGING_DIR,
  buildRenderer,
  createVersionedPortableDir,
  findUnpackedDir,
  moveFolder,
  packagePlatform,
  pathExists,
  projectRoot,
  resolveSharedBuildStamp,
  seedPortableData,
  shouldSkipPublish,
  shouldSkipStamp,
  syncBuildStamp,
} from './build-dist-common.mjs';

const stagingDir = path.join(projectRoot, '.dist-build', 'win');

/**
 * Prefer installed 7-Zip on this PC, then PATH.
 * @returns {Promise<string>}
 */
async function resolve7zPath() {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  const where = spawnSync('where.exe', ['7z'], { encoding: 'utf8', shell: false });
  const fromPath = String(where.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith('7z.exe'));
  if (fromPath && (await pathExists(fromPath))) return fromPath;

  throw new Error(
    '7-Zip(7z.exe)을 찾을 수 없습니다. https://www.7-zip.org/ 설치 후 다시 실행해 주세요.',
  );
}

/**
 * Zip portable folder as sibling `{folderName}.zip` via 7-Zip.
 * @param {string} portableDirPath
 * @param {string} [zipPath]
 */
async function zipPortableFolder(portableDirPath, zipPath) {
  const sevenZip = await resolve7zPath();
  const parentDir = path.dirname(portableDirPath);
  const folderName = path.basename(portableDirPath);
  const outZip = zipPath ?? path.join(parentDir, `${folderName}.zip`);

  await fs.mkdir(path.dirname(outZip), { recursive: true });
  await fs.rm(outZip, { force: true });

  const result = spawnSync(sevenZip, ['a', '-tzip', '-mx=5', outZip, folderName], {
    cwd: parentDir,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`7-Zip 압축 실패 (exit ${result.status ?? 1})`);
  }

  console.log(`[build:dist:exe] Zip ready → ${outZip}`);
  return outZip;
}

async function applyPortableExeIcon(portableDirPath) {
  const icoPath = path.join(projectRoot, 'build', 'icon.ico');
  if (!(await pathExists(icoPath))) {
    console.warn('[build:dist:exe] build/icon.ico not found — skipping exe icon');
    return;
  }

  const entries = await fs.readdir(portableDirPath);
  const exeName = entries.find(
    (name) => name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall'),
  );
  if (!exeName) {
    console.warn('[build:dist:exe] main exe not found — skipping exe icon');
    return;
  }

  const { rcedit } = await import('rcedit');
  const exePath = path.join(portableDirPath, exeName);
  await rcedit(exePath, { icon: icoPath });
  console.log(`[build:dist:exe] Applied NAS4USB icon → ${exeName}`);
}

/**
 * @param {string} portableDir
 * @param {{ stamp: string, version: string, productName: string }} meta
 */
async function finalizePortableFolder(portableDir, meta) {
  await seedPortableData(portableDir);
  // Marker must match electron/portablePaths.js PORTABLE_MARKER (no Electron import here).
  await fs.writeFile(path.join(portableDir, '.nas4usb-portable'), '1\n', 'utf8');

  await fs.copyFile(
    path.join(projectRoot, 'allow-firewall-inbound.bat'),
    path.join(portableDir, 'allow-firewall-inbound.bat'),
  );

  await fs.copyFile(
    path.join(projectRoot, 'stop_server.bat'),
    path.join(portableDir, 'stop_server.bat'),
  );

  await applyPortableExeIcon(portableDir);

  const readme = `NAS4USB USB Portable (Windows)
================================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. NAS4USB.exe 를 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.
4. Windows 방화벽 허용 (관리자, PowerShell 예):
     cd "이 폴더"
     Start-Process -FilePath ".\\allow-firewall-inbound.bat" -Verb RunAs
   또는 탐색기에서 allow-firewall-inbound.bat 우클릭 → 관리자 권한으로 실행
5. 서버 중지: stop_server.bat (개발/백그라운드 서버가 남았을 때)

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
예) DATA_ROOT=data  또는  DATA_ROOT=D:/USB/nas4usb-data

라이선스: LICENSE (MIT), 오픈소스 고지: THIRD_PARTY_NOTICES.md
빌드: v${meta.version} / ${meta.stamp}

exe 와 같은 폴더를 유지해 주세요.
`;

  await fs.writeFile(path.join(portableDir, 'README-USB.txt'), readme, 'utf8');
  console.log(`\n[build:dist:exe] Windows portable folder ready → ${portableDir}`);

  await zipPortableFolder(portableDir);

  // Release uploads use Neo-style asset names under msi/ (stamp parseable by update check).
  if (process.env.NAS4USB_RELEASE_PORTABLE === '1') {
    const releaseZip = path.join(
      projectRoot,
      'msi',
      `${meta.productName} v${meta.version}_${meta.stamp}_portable.zip`,
    );
    await zipPortableFolder(portableDir, releaseZip);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    console.warn('[build:dist:exe] Windows 빌드는 Windows에서 실행하는 것을 권장합니다.');
  }

  const stamp = resolveSharedBuildStamp();
  if (!shouldSkipStamp()) {
    console.log(`[build:dist:exe] stamping APP_BUILD_STAMP=${stamp}`);
    syncBuildStamp(stamp);
  } else {
    console.log(`[build:dist:exe] reusing APP_BUILD_STAMP=${stamp} (NAS4USB_SKIP_STAMP)`);
  }

  const { portableDir, version, productName } = await createVersionedPortableDir('exe', { stamp });

  let winUnpacked;
  if (shouldSkipPublish()) {
    console.log(`[build:dist:exe] reusing publish output → ${RELEASE_STAGING_DIR}`);
    winUnpacked = await findUnpackedDir(RELEASE_STAGING_DIR, /^win-/);
    await fs.rm(portableDir, { recursive: true, force: true });
    await fs.cp(winUnpacked, portableDir, { recursive: true });
  } else {
    buildRenderer();
    packagePlatform('--win', stagingDir);
    winUnpacked = await findUnpackedDir(stagingDir, /^win-/);
    await moveFolder(winUnpacked, portableDir);
  }

  await finalizePortableFolder(portableDir, { stamp, version, productName });
}

try {
  await main();
} catch (error) {
  console.error('[build:dist:exe] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
