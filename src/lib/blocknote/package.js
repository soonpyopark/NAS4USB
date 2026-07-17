import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { joinRelativePath } from '../fsPaths.js';
import { parseBlockDocument } from './document.js';
import {
  getBlockAssetsDir,
  normalizeBlockAssetUrls,
  normalizeAssetPath,
  toPackageAssetUrl,
} from './assetUrls.js';
import { collectReferencedAssetPaths } from './assetCleanup.js';

export const BLOCK_PACKAGE_FORMAT = 'blocknote-package';
export const BLOCK_PACKAGE_VERSION = 1;

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
    format: BLOCK_PACKAGE_FORMAT,
    version: BLOCK_PACKAGE_VERSION,
    title,
    exportedAt: exportedAt ?? new Date().toISOString(),
  };
}

/**
 * @param {import('@blocknote/core').PartialBlock[]} content
 */
function createDocumentJson(content) {
  return JSON.stringify({ content }, null, 2);
}

/**
 * @param {Uint8Array} bytes
 */
async function unpackBlockPackage(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file(MANIFEST_PATH);
  const documentFile = zip.file(DOCUMENT_PATH);

  if (!manifestFile || !documentFile) {
    throw new Error('Invalid .block package: missing manifest or document');
  }

  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest?.format !== BLOCK_PACKAGE_FORMAT) {
    throw new Error('Invalid .block package format');
  }

  const document = JSON.parse(await documentFile.async('string'));
  const content = Array.isArray(document?.content) ? document.content : [];

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
 *   content: import('@blocknote/core').PartialBlock[],
 *   assets: { fileName: string, base64: string }[],
 * }} input
 */
async function packBlockPackage(input) {
  const zip = new JSZip();
  const exportedAt = input.exportedAt ?? new Date().toISOString();

  zip.file(MANIFEST_PATH, JSON.stringify(createManifest(input.title, exportedAt), null, 2));
  zip.file(DOCUMENT_PATH, createDocumentJson(input.content));

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
 *   content: import('@blocknote/core').PartialBlock[],
 *   embeddedAssets: { path: string, base64: string }[],
 * }>}
 */
export async function parseBlockFileBase64(base64) {
  const bytes = base64 ? base64ToBytes(base64) : new Uint8Array();

  if (bytes.length === 0) {
    return {
      title: 'NoName',
      exportedAt: new Date().toISOString(),
      content: [],
      embeddedAssets: [],
    };
  }

  if (isZipBytes(bytes)) {
    try {
      return await unpackBlockPackage(bytes);
    } catch {
      // Not our package — fall through to legacy JSON attempt
    }
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  const parsed = parseBlockDocument(text);
  return {
    title: parsed.title,
    exportedAt: parsed.exportedAt,
    content: parsed.content,
    embeddedAssets: [],
  };
}

/**
 * @param {string} title
 * @returns {Promise<string>}
 */
export async function createEmptyBlockPackageBase64(title = 'NoName') {
  const bytes = await packBlockPackage({
    title,
    content: [],
    assets: [],
  });
  return bytesToBase64(bytes);
}

/**
 * Write embedded package assets into the edit-time sidecar folder.
 * @param {string} blockRelativePath
 * @param {{ path: string, base64: string }[]} embeddedAssets
 */
export async function syncEmbeddedAssetsToSidecar(blockRelativePath, embeddedAssets) {
  if (!embeddedAssets.length) return;

  const assetsDir = getBlockAssetsDir(blockRelativePath);
  await window.nas4usb.fs.mkdir(assetsDir);

  for (const asset of embeddedAssets) {
    const fileName = asset.path.startsWith(ASSETS_PREFIX)
      ? asset.path.slice(ASSETS_PREFIX.length)
      : asset.path;
    if (!fileName) continue;
    await window.nas4usb.fs.writeFile(joinRelativePath(assetsDir, fileName), asset.base64);
  }
}

/**
 * @param {string} blockRelativePath
 * @returns {Promise<{ fileName: string, base64: string }[]>}
 */
export async function readSidecarAssets(blockRelativePath) {
  const assetsDir = getBlockAssetsDir(blockRelativePath);
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

/** @param {string} blockRelativePath */
export async function removeBlockAssetsSidecar(blockRelativePath) {
  const assetsDir = getBlockAssetsDir(blockRelativePath);
  try {
    await window.nas4usb.fs.delete(assetsDir);
  } catch {
    // already removed
  }
}

/**
 * @param {string} blockRelativePath
 * @param {string} assetsDir
 * @param {Set<string>} referenced
 */
async function readReferencedSidecarAssets(blockRelativePath, assetsDir, referenced) {
  const allAssets = await readSidecarAssets(blockRelativePath);
  return allAssets.filter((asset) =>
    referenced.has(normalizeAssetPath(joinRelativePath(assetsDir, asset.fileName))),
  );
}

/**
 * @param {{
 *   title: string,
 *   exportedAt?: string,
 *   content: import('@blocknote/core').PartialBlock[],
 *   blockRelativePath: string,
 * }} input
 * @returns {Promise<string>}
 */
export async function packBlockFileFromSidecar(input) {
  const normalizedContent = normalizeBlockAssetUrls(input.content, input.blockRelativePath);
  const assetsDir = getBlockAssetsDir(input.blockRelativePath);
  const referenced = collectReferencedAssetPaths(normalizedContent, input.blockRelativePath);

  let assets = await readReferencedSidecarAssets(input.blockRelativePath, assetsDir, referenced);

  // Guard against a rare race where the sidecar directory listing doesn't yet reflect an
  // asset that was just written moments earlier (e.g. an image upload whose fs.writeFile
  // resolved just before this save) — retry a couple of times rather than silently packing a
  // document whose image blocks point at nothing (permanently "losing" the picture).
  for (let attempt = 0; attempt < 2 && assets.length < referenced.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assets = await readReferencedSidecarAssets(input.blockRelativePath, assetsDir, referenced);
  }

  const bytes = await packBlockPackage({
    title: input.title,
    exportedAt: input.exportedAt,
    content: normalizedContent,
    assets,
  });
  return bytesToBase64(bytes);
}
