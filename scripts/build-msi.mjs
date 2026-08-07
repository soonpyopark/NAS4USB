#!/usr/bin/env node
/**
 * Build a per-user Windows MSI for NAS4USB (Electron), modeled after the
 * "My Desktop Calendar" project's WiX-based build:msi flow.
 * Requires WiX CLI 7+ (winget install WiXToolset.WiXCLI) and: wix eula accept wix7
 *
 * Flow:
 * 1) build renderer + package Electron as an unpacked Windows "dir" build
 * 2) stage the unpacked build → msi/NAS4USB/ (app data/settings excluded — see stageForMsi)
 * 3) wix build Product.wxs → msi/NAS4USB v{version}_YYMMDD_HHMMSS.msi
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { APP_NAME, APP_VERSION, APP_BLOG_URL } from '../shared/constants.js';
import {
  buildRenderer,
  findUnpackedDir,
  packagePlatform,
  pathExists,
  projectRoot,
  seedPortableData,
} from './build-dist-common.mjs';

const STAGING_DIR = path.join(projectRoot, '.dist-build', 'win-msi');
const MSI_DIR = path.join(projectRoot, 'msi');
const STAGE_DIR = path.join(MSI_DIR, APP_NAME);
const PRODUCT_WXS = path.join(MSI_DIR, 'Product.wxs');
let wixCmd = 'wix';

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

function toMsiVersion(version, buildStamp = new Date()) {
  const parts = String(version).split('.').map((p) => Number.parseInt(p, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  // 4th part must change every MSI build so Windows Installer treats it as an upgrade
  // even when APP_VERSION (x.y.z) is unchanged. Each MSI version field max is 65535.
  const revision = Math.floor(buildStamp.getTime() / 60_000) % 65535;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${revision || 1}`;
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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

  for (const name of ['allow-firewall-inbound.bat', 'stop_server.bat', '.env.example', 'LICENSE']) {
    const src = path.join(projectRoot, name);
    if (await pathExists(src)) {
      await fsp.copyFile(src, path.join(STAGE_DIR, name));
    }
  }

  // Drop mutable runtime state; then seed sample documents into data/.
  // Windows Installer can lock harvested files it doesn't own, so never stage .env / cache / history.
  for (const name of ['data', '.cache', '.nas4usb', '.env']) {
    await fsp.rm(path.join(STAGE_DIR, name), { recursive: true, force: true });
  }
  await seedPortableData(STAGE_DIR);

  log(`staged: ${STAGE_DIR}`);
  return mainExe;
}

function buildMsi() {
  const version = readVersion();
  const productVersion = toMsiVersion(version);
  // New ProductCode every build + MajorUpgrade AllowSameVersionUpgrades removes prior ARP entries.
  const productCode = randomUUID().toUpperCase();
  const timestamp = formatTimestamp();
  const outputName = `${APP_NAME} v${version}_${timestamp}.msi`;
  const outputPath = path.join(MSI_DIR, outputName);

  fs.mkdirSync(MSI_DIR, { recursive: true });
  fs.rmSync(outputPath, { force: true });

  run(
    `${wixCmd} build "${PRODUCT_WXS}" -d ProductVersion=${productVersion} -d ProductCode=${productCode} -bindpath "${MSI_DIR}" -ext WixToolset.UI.wixext -o "${outputPath}"`,
  );

  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
  log(`output: ${outputPath} (${sizeMb} MB)`);
  log(`ProductVersion=${productVersion} ProductCode={${productCode}}`);
  log(`site: ${APP_BLOG_URL}`);
}

function cleanupStage() {
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  log('removed staging folders');
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('MSI build must run on Windows.');
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
