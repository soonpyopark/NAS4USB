import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DEPARTMENT_CODE } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(__dirname, '..');

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function copyFileIfMissing(from, to) {
  if (await pathExists(to)) return;
  await fs.copyFile(from, to);
}

export async function moveFolder(from, to) {
  await fs.rm(to, { recursive: true, force: true });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  await fs.cp(from, to, { recursive: true });
  await fs.rm(from, { recursive: true, force: true });
}

/**
 * @param {string} outputDir
 * @param {RegExp} pattern
 */
export async function findUnpackedDir(outputDir, pattern) {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const matches = entries.filter((entry) => entry.isDirectory() && pattern.test(entry.name));

  if (matches.length !== 1) {
    throw new Error(
      `빌드 출력 폴더를 찾을 수 없습니다 (${outputDir}). 발견: ${matches.map((entry) => entry.name).join(', ') || '없음'}`,
    );
  }

  return path.join(outputDir, matches[0].name);
}

export async function seedPortableData(portableDir) {
  await fs.mkdir(path.join(portableDir, 'data', DEFAULT_DEPARTMENT_CODE), { recursive: true });
  await copyFileIfMissing(path.join(projectRoot, '.env.example'), path.join(portableDir, '.env.example'));
}

/**
 * @param {Date} [date]
 */
export function formatBuildTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yy}${mm}${dd}_${hh}${min}${ss}`;
}

export async function readPackageMeta() {
  const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw);
  return {
    productName: pkg.build?.productName ?? pkg.name ?? 'app',
    version: pkg.version ?? '0.0.0',
  };
}

/**
 * @param {string} name
 */
export function sanitizeDirName(name) {
  const sanitized = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return sanitized || 'app';
}

/**
 * @param {string} [baseDirName]
 */
export async function createVersionedPortableDir(baseDirName = 'exe') {
  const { productName, version } = await readPackageMeta();
  const folderName = `${sanitizeDirName(productName)}_${version}_${formatBuildTimestamp()}`;
  const baseDir = path.join(projectRoot, baseDirName);
  const portableDir = path.join(baseDir, folderName);
  await fs.mkdir(baseDir, { recursive: true });
  console.log(`[build:dist] Output folder: ${baseDirName}/${folderName}`);
  return portableDir;
}

export function buildRenderer() {
  console.log('[build:dist] Building renderer…');
  run('npm', ['run', 'build']);
}

/**
 * @param {'--win' | '--mac'} platformFlag
 * @param {string} outputDir relative to project root
 */
export function packagePlatform(platformFlag, outputDir) {
  const relativeOutput = path.relative(projectRoot, outputDir).split(path.sep).join('/');
  console.log(`[build:dist] Packaging Electron (${platformFlag.replace('--', '')}, dir)…`);
  run('npx', ['electron-builder', platformFlag, 'dir', `-c.directories.output=${relativeOutput}`]);
}
