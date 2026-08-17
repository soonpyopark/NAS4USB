import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
/** @type {{ cmd: (args: string[]) => Promise<string>, unpack: (src: string, dest?: string) => Promise<string>, config: (cfg: { binaryPath: string }) => void }} */
const sevenZipMin = require('7zip-min');
const { path7za } = require('7zip-bin');

/**
 * electron-builder unpacks 7za.exe to app.asar.unpacked, but 7zip-min only
 * rewrites the path when `process.argv[1]` contains `app.asar` — that is not
 * true for the packaged NAS4USB.exe, so spawn() looks inside the asar.
 * @param {string} filePath
 */
function toUnpackedAsarPath(filePath) {
  const raw = String(filePath ?? '');
  if (!raw.includes('app.asar') || raw.includes('app.asar.unpacked')) return raw;
  return raw.replace(/app\.asar(?!\.unpacked)/g, 'app.asar.unpacked');
}

function resolveSevenZipBinary() {
  const remapped = toUnpackedAsarPath(path7za);
  for (const candidate of [remapped, path7za]) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      // try next
    }
  }
  return remapped;
}

sevenZipMin.config({ binaryPath: resolveSevenZipBinary() });

export { sevenZipMin };
