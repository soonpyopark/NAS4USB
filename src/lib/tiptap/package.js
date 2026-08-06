import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { joinRelativePath } from '../fsPaths.js';
import { createEmptyTiptapDoc, isTiptapDoc } from './document.js';
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
  const content = isTiptapDoc(document?.content) ? document.content : createEmptyTiptapDoc();

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
 * @param {string} tiptapRelativePath
 * @param {{ path: string, base64: string }[]} embeddedAssets
 */
export async function syncEmbeddedAssetsToSidecar(tiptapRelativePath, embeddedAssets) {
  if (!embeddedAssets.length) return;

  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
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
 * @param {string} tiptapRelativePath
 * @returns {Promise<{ fileName: string, base64: string }[]>}
 */
export async function readSidecarAssets(tiptapRelativePath) {
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
 * }} input
 * @returns {Promise<string>}
 */
export async function packTiptapFileFromSidecar(input) {
  const normalizedContent = normalizeTiptapAssetUrls(input.content, input.tiptapRelativePath);
  const assetsDir = getTiptapAssetsDir(input.tiptapRelativePath);
  const referenced = collectReferencedAssetPaths(normalizedContent, input.tiptapRelativePath);

  let assets = await readReferencedSidecarAssets(input.tiptapRelativePath, assetsDir, referenced);

  for (let attempt = 0; attempt < 2 && assets.length < referenced.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assets = await readReferencedSidecarAssets(input.tiptapRelativePath, assetsDir, referenced);
  }

  const bytes = await packTiptapPackage({
    title: input.title,
    exportedAt: input.exportedAt,
    content: normalizedContent,
    assets,
  });
  return bytesToBase64(bytes);
}
