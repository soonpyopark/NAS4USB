#!/usr/bin/env node
/**
 * Build a per-user Windows MSI for NAS4USB (Electron), modeled after the
 * Neo Desktop Calendar WiX-based build:msi flow.
 * Requires WiX CLI 7+ (winget install WiXToolset.WiXCLI) and: wix eula accept wix7
 *
 * Flow:
 * 1) stamp APP_BUILD_STAMP (same YYMMDD_HHMMSS as MSI filename) unless NAS4USB_SKIP_STAMP
 * 2) build renderer + package Electron as unpacked dir (unless NAS4USB_SKIP_PUBLISH)
 * 3) stage → msi/NAS4USB/ then wix build → msi/NAS4USB v{version}_{stamp}.msi
 *
 * Env (used by build:release):
 *   NAS4USB_BUILD_STAMP=YYMMDD_HHMMSS
 *   NAS4USB_SKIP_STAMP=1
 *   NAS4USB_SKIP_PUBLISH=1  — reuse .dist-build/release unpack
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { APP_NAME, APP_VERSION, APP_BLOG_URL } from '../shared/constants.js';
import {
  RELEASE_STAGING_DIR,
  buildRenderer,
  findUnpackedDir,
  packagePlatform,
  pathExists,
  projectRoot,
  resolveSharedBuildStamp,
  seedPortableData,
  shouldSkipPublish,
  shouldSkipStamp,
  syncBuildStamp,
} from './build-dist-common.mjs';

const STAGING_DIR = path.join(projectRoot, '.dist-build', 'win-msi');
const MSI_DIR = path.join(projectRoot, 'msi');
const STAGE_DIR = path.join(MSI_DIR, APP_NAME);
const PRODUCT_WXS = path.join(MSI_DIR, 'Product.wxs');
let wixCmd = 'wix';
/** @type {string} */
let buildStamp = '';

function log(msg) {
  console.log(`[msi] ${msg}`);
}

function run(cmd, options = {}) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot, shell: true, ...options });
}

function readVersion() {
  const constants = fs.readFileSync(path.join(projectRoot, 'shared', 'constants.js'), 'utf8');
  const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? APP_VERSION;
}

function toMsiVersion(version, stampDate = new Date()) {
  const parts = String(version).split('.').map((p) => Number.parseInt(p, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  // 4th part must change every MSI build so Windows Installer treats it as an upgrade
  // even when APP_VERSION (x.y.z) is unchanged. Each MSI version field max is 65535.
  const revision = Math.floor(stampDate.getTime() / 60_000) % 65535;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${revision || 1}`;
}

function resolveWixCmd() {
  try {
    execSync('wix --version', { stdio: 'pipe' });
    return 'wix';
  } catch {
    /* look under Program Files */
  }

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const candidates = [
    path.join(programFiles, 'WiX Toolset v7.0', 'bin', 'wix.exe'),
    path.join(programFiles, 'WiX Toolset v6.0', 'bin', 'wix.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return `"${candidate}"`;
    }
  }

  throw new Error(
    'WiX CLI not found. Install: winget install WiXToolset.WiXCLI\nThen run: wix eula accept wix7',
  );
}

function ensureWix() {
  wixCmd = resolveWixCmd();
  execSync(`${wixCmd} --version`, { stdio: 'pipe', shell: true });
}

async function findMainExe(dir) {
  const entries = await fsp.readdir(dir);
  const preferred = entries.find((name) => name === `${APP_NAME}.exe`);
  if (preferred) return preferred;
  const fallback = entries.find(
    (name) => name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall'),
  );
  if (!fallback) {
    throw new Error(`Main executable not found in ${dir}`);
  }
  return fallback;
}

async function packageUnpackedBuild() {
  if (shouldSkipPublish()) {
    log(`reusing publish output → ${RELEASE_STAGING_DIR}`);
    return findUnpackedDir(RELEASE_STAGING_DIR, /^win-/);
  }

  await fsp.rm(STAGING_DIR, { recursive: true, force: true });
  buildRenderer();
  packagePlatform('--win', STAGING_DIR);
  return findUnpackedDir(STAGING_DIR, /^win-/);
}

async function stageForMsi(winUnpackedDir) {
  await fsp.rm(STAGE_DIR, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(STAGE_DIR), { recursive: true });
  await fsp.cp(winUnpackedDir, STAGE_DIR, { recursive: true });

  const mainExe = await findMainExe(STAGE_DIR);
  log(`main executable: ${mainExe}`);

  const icoPath = path.join(projectRoot, 'build', 'icon.ico');
  if (await pathExists(icoPath)) {
    await fsp.copyFile(icoPath, path.join(STAGE_DIR, 'app-icon.ico'));
  } else {
    throw new Error('build/icon.ico not found — run npm run prepare:icons first');
  }

  for (const name of [
    'allow-firewall-inbound.bat',
    'stop_server.bat',
    '.env.example',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ]) {
    const src = path.join(projectRoot, name);
    if (await pathExists(src)) {
      await fsp.copyFile(src, path.join(STAGE_DIR, name));
    }
  }

  // Drop mutable runtime state. Do NOT stage sample data or settings JSON —
  // WiX mangles Hangul names, and harvesting settings would wipe them on upgrade.
  // Samples live in app.asar; settings/data are created at runtime beside the exe.
  for (const name of [
    'data',
    '공유폴더',
    '개인폴더',
    '.cache',
    '.nas4usb',
    '.env',
    '.nas4usb-settings.json',
    '.nas4usb-members.json',
    '.nas4usb-sessions.json',
    '.nas4usb-portable',
  ]) {
    await fsp.rm(path.join(STAGE_DIR, name), { recursive: true, force: true });
  }
  // Legacy unpacks may still carry a WiX-corrupt resources/seed — never ship it.
  await fsp.rm(path.join(STAGE_DIR, 'resources', 'seed'), { recursive: true, force: true });
  await seedPortableData(STAGE_DIR, { includeSampleData: false, writeSettings: false });

  log(`staged: ${STAGE_DIR}`);
  return mainExe;
}

function buildMsi() {
  const version = readVersion();
  const productVersion = toMsiVersion(version);
  // New ProductCode every build + MajorUpgrade AllowSameVersionUpgrades removes prior ARP entries.
  const productCode = randomUUID().toUpperCase();
  const outputName = `${APP_NAME} v${version}_${buildStamp}.msi`;
  const outputPath = path.join(MSI_DIR, outputName);

  fs.mkdirSync(MSI_DIR, { recursive: true });
  fs.rmSync(outputPath, { force: true });

  run(
    `${wixCmd} build "${PRODUCT_WXS}" -d ProductVersion=${productVersion} -d ProductCode=${productCode} -bindpath "${MSI_DIR}" -ext WixToolset.UI.wixext -o "${outputPath}"`,
  );

  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
  log(`output: ${outputPath} (${sizeMb} MB)`);
  log(`ProductVersion=${productVersion} ProductCode={${productCode}}`);
  log(`build stamp: ${buildStamp}`);
  log(`site: ${APP_BLOG_URL}`);
  return outputPath;
}

function cleanupStage() {
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  if (!shouldSkipPublish()) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  log('removed staging folders');
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('MSI build must run on Windows.');
  }

  buildStamp = resolveSharedBuildStamp();
  if (!shouldSkipStamp()) {
    log(`stamping APP_BUILD_STAMP=${buildStamp}`);
    syncBuildStamp(buildStamp);
  } else {
    log(`reusing APP_BUILD_STAMP=${buildStamp} (NAS4USB_SKIP_STAMP)`);
  }

  ensureWix();
  const winUnpackedDir = await packageUnpackedBuild();
  await stageForMsi(winUnpackedDir);

  try {
    buildMsi();
  } finally {
    cleanupStage();
  }

  log('설치: msi 폴더의 .msi 파일을 더블 클릭하세요 (관리자 권한 불필요).');
  log('done');
}

try {
  await main();
} catch (error) {
  console.error('[msi] failed:', error.message ?? error);
  process.exit(1);
}
