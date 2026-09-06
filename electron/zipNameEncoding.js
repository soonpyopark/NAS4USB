import fs from 'node:fs/promises';
import path from 'node:path';

/** Hangul syllables + compatibility jamo. */
const HANGUL_RE = /[\uAC00-\uD7A3\u3131-\u318E]/;

/**
 * Windows ZIP tools often store Korean names as CP949 without the UTF-8 flag.
 * 7-Zip on macOS then writes those bytes as Latin-1, and APFS stores them as NFD.
 * NFC + Latin-1 → CP949 recovers the original Hangul.
 *
 * @param {string} name
 */
export function repairZipEntryName(name) {
  const raw = String(name ?? '');
  if (!raw) return raw;
  const nfc = raw.normalize('NFC');
  if (HANGUL_RE.test(nfc)) return nfc;

  let bytes;
  try {
    bytes = Buffer.from(nfc, 'latin1');
  } catch {
    return nfc;
  }
  if (bytes.every((byte) => byte < 0x80)) return nfc;

  let decoded = nfc;
  try {
    decoded = new TextDecoder('euc-kr').decode(bytes);
  } catch {
    return nfc;
  }
  const next = decoded.normalize('NFC');
  if (!HANGUL_RE.test(next) || next.includes('\uFFFD')) return nfc;
  return next;
}

/**
 * @param {string} target
 */
async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} from
 * @param {string} to
 */
async function mergeDirectoryInto(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (await pathExists(dest)) {
      if (entry.isDirectory()) await mergeDirectoryInto(src, dest);
      continue;
    }
    await fs.rename(src, dest);
  }
  await fs.rm(from, { recursive: true, force: true }).catch(() => {});
}

/**
 * Rename garbled CP949 names under `root` (deepest first).
 *
 * @param {string} root
 * @returns {Promise<number>}
 */
export async function repairExtractedNameTree(root) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  let renamed = 0;
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const from = path.join(root, entry.name);
    if (entry.isDirectory()) {
      renamed += await repairExtractedNameTree(from);
    }

    const fixed = repairZipEntryName(entry.name);
    if (fixed === entry.name) continue;
    const to = path.join(root, fixed);
    if (path.resolve(from) === path.resolve(to)) continue;

    if (await pathExists(to)) {
      if (entry.isDirectory()) {
        await mergeDirectoryInto(from, to);
        renamed += 1;
      }
      continue;
    }
    await fs.rename(from, to);
    renamed += 1;
  }
  return renamed;
}
