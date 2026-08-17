import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
/** @type {{ cmd: (args: string[]) => Promise<string>, unpack: (src: string, dest?: string) => Promise<string>, config: (cfg: { binaryPath: string }) => void }} */
const sevenZipMin = require('7zip-min');
const { path7za } = require('7zip-bin');

const BINARY_NAME = process.platform === 'win32' ? '7za.exe' : '7za';

/**
 * Electron can `existsSync` files inside app.asar, but spawn() cannot run them.
 * @param {string} filePath
 */
function isInsideAsarArchive(filePath) {
  const raw = String(filePath ?? '').replace(/\\/g, '/');
  return raw.includes('/app.asar/') && !raw.includes('/app.asar.unpacked/');
}

/**
 * @param {string} filePath
 */
function toUnpackedAsarPath(filePath) {
  const raw = String(filePath ?? '');
  if (!raw.includes('app.asar') || raw.includes('app.asar.unpacked')) return raw;
  return raw.replace(/app\.asar(?!\.unpacked)/g, 'app.asar.unpacked');
}

/**
 * @param {string} filePath
 */
function isOnDiskExecutable(filePath) {
  if (!filePath || isInsideAsarArchive(filePath)) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Copy 7za out of the asar (readable) onto a real disk path (spawnable).
 * @param {string} source
 */
function extractSevenZipBinary(source) {
  const dest = path.join(os.tmpdir(), 'nas4usb-7za', BINARY_NAME);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  return dest;
}

function resolveSevenZipBinary() {
  const extras = [];
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    extras.push(path.join(process.resourcesPath, 'bin', BINARY_NAME));
  }
  extras.push(toUnpackedAsarPath(path7za));

  for (const candidate of extras) {
    if (isOnDiskExecutable(candidate)) return candidate;
  }

  if (path7za && fs.existsSync(path7za)) {
    const extracted = extractSevenZipBinary(path7za);
    if (isOnDiskExecutable(extracted)) return extracted;
  }

  throw new Error(
    '7-Zip 실행 파일(7za)을 찾을 수 없습니다. 앱을 다시 설치하거나 개발 폴더에서 npm install 후 실행해 주세요.',
  );
}

const binaryPath = resolveSevenZipBinary();
sevenZipMin.config({ binaryPath });
console.log('[7zip] binary', binaryPath);

export { sevenZipMin };
