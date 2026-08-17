import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { joinRelativePath } from '../fsPaths.js';
import { createEmptyTiptapDoc, isTiptapDoc } from './document.js';
import { normalizeTiptapTextMarks } from './textMarks.js';
import { getLegacySecTiptapAssetSidecarPath } from '../../../shared/tiptapAssetPaths.js';
import {
  getTiptapAssetsDir,
  normalizeAssetPath,
  normalizeTiptapAssetUrls,
  toPackageAssetUrl,
} from './assetUrls.js';
import { collectReferencedAssetPaths } from './assetCleanup.js';

export const TIPTAP_PACKAGE_FORMAT = 'tiptap-package';
export const TIPTAP_PACKAGE_VERSION = 1;

const MANIFEST_PATH = 'manifest.json';
const DOCUMENT_PATH = 'document.json';
const ASSETS_PREFIX = 'assets/';

/** @param {Uint8Array} bytes */
export function isZipBytes(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * @param {string} title
 * @param {string} [exportedAt]
 */
function createManifest(title, exportedAt) {
  return {
    format: TIPTAP_PACKAGE_FORMAT,
    version: TIPTAP_PACKAGE_VERSION,
    title,
    exportedAt: exportedAt ?? new Date().toISOString(),
  };
}

/**
 * @param {import('@tiptap/core').JSONContent} content
 */
function createDocumentJson(content) {
  return JSON.stringify({ content }, null, 2);
}

/**
 * @param {Uint8Array} bytes
 */
async function unpackTiptapPackage(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file(MANIFEST_PATH);
  const documentFile = zip.file(DOCUMENT_PATH);

  if (!manifestFile || !documentFile) {
    throw new Error('Invalid .tiptap package: missing manifest or document');
  }

  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest?.format !== TIPTAP_PACKAGE_FORMAT) {
    throw new Error('Invalid .tiptap package format');
  }

  const document = JSON.parse(await documentFile.async('string'));
  const content = normalizeTiptapTextMarks(
    isTiptapDoc(document?.content) ? document.content : createEmptyTiptapDoc(),
  );

  /** @type {{ path: string, base64: string }[]} */
  const embeddedAssets = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (!path.startsWith(ASSETS_PREFIX)) continue;
    const fileName = path.slice(ASSETS_PREFIX.length);
    if (!fileName || fileName.includes('/')) continue;
    const assetBytes = await file.async('uint8array');
    embeddedAssets.push({
      path: toPackageAssetUrl(fileName),
      base64: bytesToBase64(assetBytes),
    });
  }

  return {
    title: typeof manifest.title === 'string' ? manifest.title : 'NoName',
    exportedAt: typeof manifest.exportedAt === 'string' ? manifest.exportedAt : new Date().toISOString(),
    content,
    embeddedAssets,
  };
}

/**
 * @param {{
 *   title: string,
 *   exportedAt?: string,
 *   content: import('@tiptap/core').JSONContent,
 *   assets: { fileName: string, base64: string }[],
 * }} input
 */
async function packTiptapPackage(input) {
  const zip = new JSZip();
  const exportedAt = input.exportedAt ?? new Date().toISOString();

  zip.file(MANIFEST_PATH, JSON.stringify(createManifest(input.title, exportedAt), null, 2));
  zip.file(DOCUMENT_PATH, createDocumentJson(normalizeTiptapTextMarks(input.content)));

  for (const asset of input.assets) {
    zip.file(`${ASSETS_PREFIX}${asset.fileName}`, base64ToBytes(asset.base64), { binary: true });
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * @param {string} base64
 * @returns {Promise<{
 *   title: string,
 *   exportedAt: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets: { path: string, base64: string }[],
 * }>}
 */
export async function parseTiptapFileBase64(base64) {
  const bytes = base64 ? base64ToBytes(base64) : new Uint8Array();

  if (bytes.length === 0) {
    return {
      title: 'NoName',
      exportedAt: new Date().toISOString(),
      content: createEmptyTiptapDoc(),
      embeddedAssets: [],
    };
  }

  if (isZipBytes(bytes)) {
    return unpackTiptapPackage(bytes);
  }

  throw new Error('Invalid .tiptap file (expected ZIP package)');
}

/**
 * @param {string} title
 * @returns {Promise<string>}
 */
export async function createEmptyTiptapPackageBase64(title = 'NoName') {
  const bytes = await packTiptapPackage({
    title,
    content: createEmptyTiptapDoc(),
    assets: [],
  });
  return bytesToBase64(bytes);
}

/**
 * Pack TipTap JSON + embedded assets into a `.tiptap` ZIP (base64).
 *
 * @param {{
 *   title: string,
 *   content: import('@tiptap/core').JSONContent,
 *   assets?: { fileName: string, base64: string }[],
 *   exportedAt?: string,
 * }} input
 */
export async function packTiptapContentBase64(input) {
  const bytes = await packTiptapPackage({
    title: input.title,
    exportedAt: input.exportedAt,
    content: input.content,
    assets: Array.isArray(input.assets) ? input.assets : [],
  });
  return bytesToBase64(bytes);
}

/**
 * @param {string} tiptapRelativePath
 * @param {{ path: string, base64: string }[]} embeddedAssets
 */
/**
 * @param {string} pathOrName
 */
function embeddedAssetFileName(pathOrName) {
  const raw = String(pathOrName ?? '');
  const fileName = raw.startsWith(ASSETS_PREFIX) ? raw.slice(ASSETS_PREFIX.length) : raw.split('/').pop();
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return '';
  }
  return fileName;
}

async function pathExists(relativePath) {
  try {
    return Boolean(await window.nas4usb.fs.exists(relativePath));
  } catch {
    return false;
  }
}

/**
 * Move `{doc}.tiptap.sec.assets` → `{doc}.tiptap.assets` when the old folder is left behind.
 * @param {string} tiptapRelativePath
 */
async function migrateLegacySecAssetsDir(tiptapRelativePath) {
  const legacy = getLegacySecTiptapAssetSidecarPath(tiptapRelativePath);
  if (!legacy || !(await pathExists(legacy))) return;
  const canonical = getTiptapAssetsDir(tiptapRelativePath);
  if (await pathExists(canonical)) {
    try {
      const entries = await window.nas4usb.fs.readDir(legacy);
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const dest = joinRelativePath(canonical, entry.name);
        if (await pathExists(dest)) continue;
        await window.nas4usb.fs.copy(joinRelativePath(legacy, entry.name), dest);
      }
      await window.nas4usb.fs.delete(legacy);
    } catch {
      // keep both rather than lose files
    }
    return;
  }
  try {
    await window.nas4usb.fs.rename(legacy, canonical);
  } catch {
    // leave the legacy folder; reads still check it via asset URLs
  }
}

export async function syncEmbeddedAssetsToSidecar(tiptapRelativePath, embeddedAssets) {
  await migrateLegacySecAssetsDir(tiptapRelativePath);
  if (!embeddedAssets.length) return;

  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
  await window.nas4usb.fs.mkdir(assetsDir);

  for (const asset of embeddedAssets) {
    const fileName = embeddedAssetFileName(asset.path);
    if (!fileName) continue;
    await window.nas4usb.fs.writeFile(joinRelativePath(assetsDir, fileName), asset.base64);
  }
}

/**
 * Decrypt-ready `.tiptap` ZIP bytes → `{name}.tiptap.assets` (image/video/audio/file).
 * @param {string} tiptapRelativePath
 * @param {string} packageBase64
 */
export async function extractTiptapPackageAssetsToSidecar(tiptapRelativePath, packageBase64) {
  const parsed = await parseTiptapFileBase64(packageBase64);
  await syncEmbeddedAssetsToSidecar(tiptapRelativePath, parsed.embeddedAssets);
  return parsed;
}

/**
 * @param {string} tiptapRelativePath
 * @returns {Promise<{ fileName: string, base64: string }[]>}
 */
export async function readSidecarAssets(tiptapRelativePath) {
  await migrateLegacySecAssetsDir(tiptapRelativePath);
  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
  let entries = [];
  try {
    entries = await window.nas4usb.fs.readDir(assetsDir);
  } catch {
    return [];
  }

  const assets = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const base64 = await window.nas4usb.fs.readFile(joinRelativePath(assetsDir, entry.name));
    assets.push({ fileName: entry.name, base64 });
  }
  return assets;
}

/** @param {string} tiptapRelativePath */
export async function removeTiptapAssetsSidecar(tiptapRelativePath) {
  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
  try {
    await window.nas4usb.fs.delete(assetsDir);
  } catch {
    // already removed
  }
  const legacy = getLegacySecTiptapAssetSidecarPath(tiptapRelativePath);
  if (!legacy) return;
  try {
    await window.nas4usb.fs.delete(legacy);
  } catch {
    // already removed
  }
}

/**
 * @param {string} tiptapRelativePath
 * @param {string} assetsDir
 * @param {Set<string>} referenced
 */
async function readReferencedSidecarAssets(tiptapRelativePath, assetsDir, referenced) {
  const allAssets = await readSidecarAssets(tiptapRelativePath);
  return allAssets.filter((asset) =>
    referenced.has(normalizeAssetPath(joinRelativePath(assetsDir, asset.fileName))),
  );
}

/**
 * @param {{
 *   title: string,
 *   exportedAt?: string,
 *   content: import('@tiptap/core').JSONContent,
 *   tiptapRelativePath: string,
 *   embeddedAssets?: { path: string, base64: string }[],
 *   includeAllAssets?: boolean,
 * }} input
 * @returns {Promise<string>}
 */
export async function packTiptapFileFromSidecar(input) {
  const normalizedContent = normalizeTiptapAssetUrls(input.content, input.tiptapRelativePath);
  const assetsDir = getTiptapAssetsDir(input.tiptapRelativePath);
  const referenced = collectReferencedAssetPaths(normalizedContent, input.tiptapRelativePath);

  let assets = input.includeAllAssets
    ? await readSidecarAssets(input.tiptapRelativePath)
    : await readReferencedSidecarAssets(input.tiptapRelativePath, assetsDir, referenced);

  for (let attempt = 0; attempt < 2 && !input.includeAllAssets && assets.length < referenced.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assets = await readReferencedSidecarAssets(input.tiptapRelativePath, assetsDir, referenced);
  }

  if (Array.isArray(input.embeddedAssets) && input.embeddedAssets.length) {
    const have = new Set(assets.map((asset) => asset.fileName));
    for (const embedded of input.embeddedAssets) {
      const fileName = embeddedAssetFileName(embedded.path);
      if (!fileName || have.has(fileName)) continue;
      assets.push({ fileName, base64: embedded.base64 });
      have.add(fileName);
    }
  }

  const bytes = await packTiptapPackage({
    title: input.title,
    exportedAt: input.exportedAt,
    content: normalizedContent,
    assets,
  });
  return bytesToBase64(bytes);
}
