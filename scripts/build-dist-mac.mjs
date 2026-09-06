#!/usr/bin/env node
/**
 * Build macOS portable folder, then (full build only) release artifacts:
 *   msi/NAS4USB v{version}_{stamp}_macOS.dmg
 *   msi/NAS4USB v{version}_{stamp}_portable_macOS.zip
 *
 * --update: replace NAS4USB.app inside mac/ and skip dmg/zip.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRenderer,
  findUnpackedDir,
  moveFolder,
  pathExists,
  projectRoot,
  readPackageMeta,
  rescueMacAppBundleState,
  resolveSharedBuildStamp,
  run,
  seedPortableData,
  shouldSkipStamp,
  syncBuildStamp,
} from './build-dist-common.mjs';

const stagingDir = path.join(projectRoot, '.dist-build', 'mac');
const portableDir = path.join(projectRoot, 'mac');
const artifactDir = path.join(projectRoot, 'msi');
const isUpdate = process.argv.includes('--update');
const MACOS_SUFFIX = '_macOS';

const MAC_README = `NAS4USB USB Portable (macOS)
==============================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. NAS4USB.app 을 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.
   macOS 기본 포트는 3011 입니다 (Windows/개발은 3009).

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
예) DATA_ROOT=data

환경설정·회원·문서는 NAS4USB.app 과 같은 폴더에 저장됩니다.
앱만 교체하면 Windows처럼 설정이 유지됩니다.

.app 과 같은 폴더를 유지해 주세요.
`;

function runTool(command, args, errorLabel) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${errorLabel} (exit ${result.status ?? 1})`);
  }
}

async function writeMacEnvFiles(targetDir) {
  const exampleSrc = await fs.readFile(path.join(projectRoot, '.env.example'), 'utf8');
  const example = exampleSrc.replace(/^PORT=\d+/m, 'PORT=3011');
  await fs.writeFile(path.join(targetDir, '.env.example'), example, 'utf8');
  const envPath = path.join(targetDir, '.env');
  if (!(await pathExists(envPath))) {
    await fs.writeFile(envPath, 'PORT=3011\n', 'utf8');
  }
}

async function writePortableDocs(targetDir, meta = null) {
  await fs.copyFile(path.join(projectRoot, 'LICENSE'), path.join(targetDir, 'LICENSE'));
  await fs.copyFile(
    path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'),
    path.join(targetDir, 'THIRD_PARTY_NOTICES.md'),
  );
  await writeMacEnvFiles(targetDir);
  await fs.writeFile(path.join(targetDir, '.nas4usb-portable'), '1\n', 'utf8');
  const readme = meta
    ? `${MAC_README}\n라이선스: LICENSE (AGPL-3.0-only), 오픈소스 고지: THIRD_PARTY_NOTICES.md\n빌드: v${meta.version} / ${meta.stamp}\n`
    : MAC_README;
  await fs.writeFile(path.join(targetDir, 'README-USB.txt'), readme, 'utf8');
}

async function replaceFolder(from, to) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rm(to, { recursive: true, force: true });
      // ditto keeps framework relative symlinks. fs.cp rewrites them to the
      // staging path, then the app breaks after that folder is deleted.
      runTool('ditto', [from, to], 'ditto failed');
      return;
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'ENOTEMPTY') throw err;
      if (attempt === 4) {
        throw new Error('NAS4USB.app 을 교체할 수 없습니다. 앱을 종료한 뒤 다시 실행해 주세요.');
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * @param {string} sourceDir
 * @param {string} zipPath
 * @param {string} folderName root folder inside the zip
 */
async function zipPortableFolder(sourceDir, zipPath, folderName) {
  const tmpParent = path.join(projectRoot, '.dist-build', 'mac-zip');
  const staged = path.join(tmpParent, folderName);
  await fs.rm(tmpParent, { recursive: true, force: true });
  await fs.mkdir(tmpParent, { recursive: true });
  runTool('ditto', [sourceDir, staged], 'portable zip staging failed');
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.rm(zipPath, { force: true });
  runTool(
    'ditto',
    ['-c', '-k', '--keepParent', '--norsrc', staged, zipPath],
    'portable zip failed',
  );
  await fs.rm(tmpParent, { recursive: true, force: true });
  console.log(`[build:dist:mac] Zip ready → ${zipPath}`);
}

/**
 * Installer-style DMG: NAS4USB.app + Applications shortcut.
 * @param {string} appPath
 * @param {string} dmgPath
 * @param {string} volumeName
 */
async function createDmg(appPath, dmgPath, volumeName) {
  const staging = path.join(projectRoot, '.dist-build', 'mac-dmg');
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  runTool('ditto', [appPath, path.join(staging, 'NAS4USB.app')], 'dmg staging failed');
  try {
    await fs.symlink('/Applications', path.join(staging, 'Applications'));
  } catch {
    // optional convenience link
  }
  await fs.mkdir(path.dirname(dmgPath), { recursive: true });
  await fs.rm(dmgPath, { force: true });
  runTool(
    'hdiutil',
    ['create', '-volname', volumeName, '-srcfolder', staging, '-ov', '-format', 'UDZO', dmgPath],
    'dmg create failed',
  );
  await fs.rm(staging, { recursive: true, force: true });
  console.log(`[build:dist:mac] DMG ready → ${dmgPath}`);
}

/**
 * @param {{ stamp: string, version: string, productName: string }} meta
 */
async function publishMacArtifacts(meta) {
  const base = `${meta.productName} v${meta.version}_${meta.stamp}`;
  const zipFolderName = `${base}_portable${MACOS_SUFFIX}`;
  const zipPath = path.join(artifactDir, `${zipFolderName}.zip`);
  const dmgPath = path.join(artifactDir, `${base}${MACOS_SUFFIX}.dmg`);
  const appPath = path.join(portableDir, 'NAS4USB.app');
  if (!(await pathExists(appPath))) {
    throw new Error(`NAS4USB.app 을 찾을 수 없습니다 (${appPath}).`);
  }

  const cleanDir = path.join(projectRoot, '.dist-build', 'mac-portable-clean');
  await fs.rm(cleanDir, { recursive: true, force: true });
  await fs.mkdir(cleanDir, { recursive: true });
  runTool('ditto', [appPath, path.join(cleanDir, 'NAS4USB.app')], 'clean portable staging failed');
  await seedPortableData(cleanDir);
  await writePortableDocs(cleanDir, meta);
  await zipPortableFolder(cleanDir, zipPath, zipFolderName);
  await fs.rm(cleanDir, { recursive: true, force: true }).catch(() => {});

  await createDmg(appPath, dmgPath, meta.productName);
  console.log(`\n[build:dist:mac] artifacts:\n  ${dmgPath}\n  ${zipPath}`);
}

async function replaceAppKeepingState(macUnpacked) {
  const newApp = path.join(macUnpacked, 'NAS4USB.app');
  const destApp = path.join(portableDir, 'NAS4USB.app');
  if (!(await pathExists(newApp))) {
    throw new Error(`패키징된 NAS4USB.app 을 찾을 수 없습니다 (${newApp}).`);
  }
  if (await pathExists(destApp)) {
    await rescueMacAppBundleState(destApp, portableDir);
  }
  await replaceFolder(newApp, destApp);
  await fs.rm(macUnpacked, { recursive: true, force: true }).catch(() => {});
}

async function finalizePortableFolder(meta) {
  const macUnpacked = await findUnpackedDir(stagingDir, /^mac/);

  if (await pathExists(portableDir)) {
    await replaceAppKeepingState(macUnpacked);
    await seedPortableData(portableDir, {
      writeSettings: false,
      includeSampleData: false,
      stripSessions: false,
    });
    await writePortableDocs(portableDir, meta);
    console.log(`\n[build:dist:mac] replaced NAS4USB.app, kept existing settings → ${portableDir}`);
    return;
  }

  await moveFolder(macUnpacked, portableDir);
  await seedPortableData(portableDir);
  await writePortableDocs(portableDir, meta);
  console.log(`\n[build:dist:mac] macOS portable folder ready → ${portableDir}`);
}

async function updatePortableFolder() {
  if (!(await pathExists(portableDir))) {
    throw new Error('mac 폴더가 없습니다. 먼저 npm run build:dist:mac 을 실행해 주세요.');
  }

  const macUnpacked = await findUnpackedDir(stagingDir, /^mac/);
  await replaceAppKeepingState(macUnpacked);
  await writePortableDocs(portableDir);
  console.log(`\n[build:dist:mac] updated NAS4USB.app in place → ${portableDir}`);
}

async function main() {
  if (process.platform !== 'darwin') {
    console.error('[build:dist:mac] macOS 빌드는 macOS에서 실행해야 합니다.');
    process.exit(1);
  }

  const stamp = resolveSharedBuildStamp();
  if (!shouldSkipStamp()) {
    console.log(`[build:dist:mac] stamping APP_BUILD_STAMP=${stamp}`);
    syncBuildStamp(stamp);
  } else {
    console.log(`[build:dist:mac] reusing APP_BUILD_STAMP=${stamp} (NAS4USB_SKIP_STAMP)`);
  }
  const { productName, version } = await readPackageMeta();
  const meta = { stamp, version, productName };

  buildRenderer();

  const macArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const relativeOutput = path.relative(projectRoot, stagingDir).split(path.sep).join('/');
  console.log(`[build:dist:mac] Packaging Electron (mac ${macArch}, dir)…`);
  run('npx', [
    'electron-builder',
    '--mac',
    'dir',
    `--${macArch}`,
    `-c.directories.output=${relativeOutput}`,
  ]);

  if (isUpdate) {
    await updatePortableFolder();
    return;
  }

  await finalizePortableFolder(meta);
  await publishMacArtifacts(meta);
}

try {
  await main();
} catch (error) {
  console.error('[build:dist:mac] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
