import { Fragment, Slice } from '@tiptap/pm/model';
import { base64ToBytes } from '../bytes.js';
import { joinRelativePath, resolveUniqueName } from '../fsPaths.js';
import { buildMediaStreamUrl } from '../media/streamUrl.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';
import { TIPTAP_ASSET_SIDECAR_SUFFIX } from '../../../shared/tiptapAssetPaths.js';
import {
  getTiptapAssetsDir,
  joinTiptapAssetPath,
  linkHrefToAssetFileName,
  normalizeAssetPath,
  packageAssetUrlToFileName,
  toPackageAssetUrl,
} from './assetUrls.js';

const ASSET_HTML_HINT =
  /(?:assets\/|asset\/|\/api\/fs\/stream|\.tiptap\.assets\/|data-nas-asset-path)/i;

const MEDIA_SRC_SELECTOR = 'img[src], video[src], audio[src], source[src]';

/**
 * Clipboard HTML that still points at a TipTap sidecar (relative `assets/` or a stream URL).
 * @param {string} html
 */
export function clipboardHtmlHasTiptapAssets(html) {
  return ASSET_HTML_HINT.test(String(html || ''));
}

/**
 * @param {DataTransfer | null | undefined} clipboard
 */
export function clipboardHasTiptapAssets(clipboard) {
  if (!clipboard) return false;
  return clipboardHtmlHasTiptapAssets(clipboard.getData?.('text/html') || '');
}

/**
 * Workspace-relative path of a sidecar file, if `url` points at one.
 * @param {string} url
 * @returns {string | null}
 */
export function workspacePathFromAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const fromQuery = pathParamFromUrl(raw);
  if (fromQuery && isSidecarAssetPath(fromQuery)) return fromQuery;

  const normalized = normalizeAssetPath(raw.split(/[?#]/)[0]).replace(/^\.\//, '');
  if (isSidecarAssetPath(normalized)) return normalized;
  return null;
}

/**
 * @param {string} url
 * @param {string} destTiptapPath
 * @returns {{
 *   fileName: string,
 *   sourcePath: string,
 *   sameSidecar: boolean,
 *   destGuess: boolean,
 * } | null}
 */
export function parseTiptapAssetRef(url, destTiptapPath) {
  const raw = String(url || '').trim();
  if (!raw || isNonAssetHref(raw)) return null;

  const destDir = normalizeAssetPath(getTiptapAssetsDir(destTiptapPath));
  const workspacePath = workspacePathFromAssetUrl(raw);
  if (workspacePath) {
    const fileName = workspacePath.split('/').pop() || '';
    if (!fileName || fileName.includes('..')) return null;
    const sourceDir = workspacePath.slice(0, workspacePath.lastIndexOf('/'));
    return {
      fileName,
      sourcePath: workspacePath,
      sameSidecar: normalizeAssetPath(sourceDir) === destDir,
      destGuess: false,
    };
  }

  const fileName = packageAssetUrlToFileName(raw) || linkHrefToAssetFileName(raw);
  if (!fileName) return null;
  return {
    fileName,
    sourcePath: joinRelativePath(destDir, fileName),
    sameSidecar: false,
    destGuess: true,
  };
}

/**
 * Rewrite package `assets/` URLs in a copied slice to fetchable stream URLs
 * that still name the source sidecar. Does not mutate the live document.
 *
 * @param {import('@tiptap/pm/model').Slice} slice
 * @param {string} sourceTiptapPath
 */
export function rewriteCopiedSliceForClipboard(slice, sourceTiptapPath) {
  if (!slice || !sourceTiptapPath) return slice;
  const content = rewriteCopiedFragment(slice.content, sourceTiptapPath);
  if (content === slice.content) return slice;
  return new Slice(content, slice.openStart, slice.openEnd);
}

/**
 * Embed workspace sidecar paths so HTML-mode copy/paste can rematerialize files.
 * @param {string} html
 * @param {string} tiptapRelativePath
 */
export function annotateHtmlWithAssetPaths(html, tiptapRelativePath) {
  const raw = String(html || '');
  if (!raw.trim() || !tiptapRelativePath || typeof document === 'undefined') return raw;

  const template = document.createElement('template');
  template.innerHTML = raw;
  let changed = false;

  const annotate = (el, attr) => {
    const value = el.getAttribute(attr);
    if (!value || el.getAttribute('data-nas-asset-path')) return;
    const fileName =
      packageAssetUrlToFileName(value) || linkHrefToAssetFileName(value, tiptapRelativePath);
    if (!fileName) return;
    el.setAttribute('data-nas-asset-path', joinTiptapAssetPath(tiptapRelativePath, fileName));
    changed = true;
  };

  for (const el of template.content.querySelectorAll(MEDIA_SRC_SELECTOR)) {
    annotate(el, 'src');
  }
  for (const el of template.content.querySelectorAll('a[href], a[data-asset-src]')) {
    annotate(el, el.hasAttribute('href') ? 'href' : 'data-asset-src');
    if (el.hasAttribute('data-asset-src')) annotate(el, 'data-asset-src');
  }

  return changed ? template.innerHTML : raw;
}

/**
 * True when a ProseMirror slice still points at sidecar `assets/` or stream URLs.
 * @param {import('@tiptap/pm/model').Slice | null | undefined} slice
 */
export function sliceHasTiptapAssetUrls(slice) {
  if (!slice?.content) return false;
  let found = false;
  const visit = (node) => {
    if (found) return;
    for (const key of ['src', 'href']) {
      if (typeof node.attrs?.[key] === 'string' && looksLikeTiptapAssetUrl(node.attrs[key])) {
        found = true;
        return;
      }
    }
    for (const mark of node.marks) {
      if (typeof mark.attrs?.href === 'string' && looksLikeTiptapAssetUrl(mark.attrs.href)) {
        found = true;
        return;
      }
    }
    node.content.forEach(visit);
  };
  slice.content.forEach(visit);
  return found;
}

/**
 * Copy sidecar files referenced by a pasted ProseMirror slice into the
 * destination document and rewrite src/href to `assets/<file>`.
 *
 * @param {import('@tiptap/pm/model').Slice} slice
 * @param {{
 *   destTiptapPath: string,
 *   uploadFile: (file: File) => Promise<string>,
 * }} options
 */
export async function rematerializeCopiedSlice(slice, { destTiptapPath, uploadFile }) {
  if (!slice || !destTiptapPath) return slice;
  /** @type {Map<string, string>} */
  const cache = new Map();
  const content = await rematerializeCopiedFragment(slice.content, destTiptapPath, uploadFile, cache);
  if (content === slice.content) return slice;
  return new Slice(content, slice.openStart, slice.openEnd);
}

/**
 * Copy sidecar files referenced by pasted HTML into the destination document
 * and rewrite src/href to package-relative `assets/<file>`.
 *
 * @param {string} html
 * @param {{
 *   destTiptapPath: string,
 *   uploadFile: (file: File) => Promise<string>,
 * }} options
 */
export async function rematerializePastedTiptapAssets(html, { destTiptapPath, uploadFile }) {
  const raw = String(html || '');
  if (!raw.trim() || !destTiptapPath || typeof document === 'undefined') return raw;
  if (!clipboardHtmlHasTiptapAssets(raw)) return raw;

  const template = document.createElement('template');
  template.innerHTML = raw;
  /** @type {Map<string, string>} */
  const cache = new Map();

  const rewriteAttr = async (el, attr) => {
    const current = el.getAttribute(attr);
    if (!current && !el.getAttribute('data-nas-asset-path')) return;
    const preferred = el.getAttribute('data-nas-asset-path') || current || '';
    const next = await rematerializeOneUrl(preferred, destTiptapPath, uploadFile, cache);
    if (next && next !== current) el.setAttribute(attr, next);
    el.removeAttribute('data-nas-asset-path');
  };

  for (const el of template.content.querySelectorAll(MEDIA_SRC_SELECTOR)) {
    await rewriteAttr(el, 'src');
  }
  for (const el of template.content.querySelectorAll('a[href]')) {
    await rewriteAttr(el, 'href');
    if (el.hasAttribute('data-asset-src')) await rewriteAttr(el, 'data-asset-src');
  }

  for (const media of template.content.querySelectorAll('video, audio')) {
    if (media.getAttribute('src')) continue;
    const source = media.querySelector('source[src]');
    const src = source?.getAttribute('src');
    if (src) media.setAttribute('src', src);
  }

  return template.innerHTML.trim();
}

/**
 * @param {string} url
 */
function looksLikeTiptapAssetUrl(url) {
  return ASSET_HTML_HINT.test(String(url || '')) || Boolean(workspacePathFromAssetUrl(url));
}

/**
 * @param {import('@tiptap/pm/model').Fragment} fragment
 * @param {string} destTiptapPath
 * @param {(file: File) => Promise<string>} uploadFile
 * @param {Map<string, string>} cache
 */
async function rematerializeCopiedFragment(fragment, destTiptapPath, uploadFile, cache) {
  /** @type {import('@tiptap/pm/model').Node[]} */
  const nodes = [];
  let changed = false;
  const children = [];
  fragment.forEach((child) => children.push(child));
  for (const child of children) {
    const next = await rematerializeCopiedNode(child, destTiptapPath, uploadFile, cache);
    if (next !== child) changed = true;
    nodes.push(next);
  }
  return changed ? Fragment.from(nodes) : fragment;
}

/**
 * @param {import('@tiptap/pm/model').Node} node
 * @param {string} destTiptapPath
 * @param {(file: File) => Promise<string>} uploadFile
 * @param {Map<string, string>} cache
 */
async function rematerializeCopiedNode(node, destTiptapPath, uploadFile, cache) {
  const nextAttrs = { ...node.attrs };
  let attrsChanged = false;
  for (const key of ['src', 'href']) {
    if (typeof nextAttrs[key] !== 'string') continue;
    const rewritten = await rematerializeOneUrl(nextAttrs[key], destTiptapPath, uploadFile, cache);
    if (rewritten === nextAttrs[key]) continue;
    nextAttrs[key] = rewritten;
    attrsChanged = true;
  }

  const nextMarks = [];
  let marksChanged = false;
  for (const mark of node.marks) {
    const href = mark.attrs?.href;
    if (typeof href !== 'string') {
      nextMarks.push(mark);
      continue;
    }
    const rewritten = await rematerializeOneUrl(href, destTiptapPath, uploadFile, cache);
    if (rewritten === href) {
      nextMarks.push(mark);
      continue;
    }
    marksChanged = true;
    nextMarks.push(mark.type.create({ ...mark.attrs, href: rewritten }));
  }

  let nextContent = node.content;
  let contentChanged = false;
  if (node.content.size > 0) {
    const rewritten = await rematerializeCopiedFragment(
      node.content,
      destTiptapPath,
      uploadFile,
      cache,
    );
    if (rewritten !== node.content) {
      nextContent = rewritten;
      contentChanged = true;
    }
  }

  if (!attrsChanged && !marksChanged && !contentChanged) return node;
  if (node.isText) return node.mark(marksChanged ? nextMarks : node.marks);
  return node.type.create(nextAttrs, nextContent, marksChanged ? nextMarks : node.marks);
}

/**
 * @param {string} url
 * @param {string} destTiptapPath
 * @param {(file: File) => Promise<string>} uploadFile
 * @param {Map<string, string>} cache
 */
async function rematerializeOneUrl(url, destTiptapPath, uploadFile, cache) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (cache.has(raw)) return cache.get(raw) || raw;

  const ref = parseTiptapAssetRef(raw, destTiptapPath);
  if (!ref) {
    cache.set(raw, raw);
    return raw;
  }

  if (ref.sameSidecar) {
    const next = toPackageAssetUrl(ref.fileName);
    cache.set(raw, next);
    return next;
  }

  if (ref.destGuess) {
    if (await workspacePathExists(ref.sourcePath)) {
      const next = toPackageAssetUrl(ref.fileName);
      cache.set(raw, next);
      return next;
    }
    cache.set(raw, raw);
    return raw;
  }

  try {
    const next = await copySidecarAsset(ref, destTiptapPath, uploadFile, raw);
    cache.set(raw, next);
    return next;
  } catch {
    cache.set(raw, raw);
    return raw;
  }
}

/**
 * @param {{ fileName: string, sourcePath: string }} ref
 * @param {string} destTiptapPath
 * @param {(file: File) => Promise<string>} uploadFile
 * @param {string} fetchUrl
 */
async function copySidecarAsset(ref, destTiptapPath, uploadFile, fetchUrl) {
  const destDir = getTiptapAssetsDir(destTiptapPath);
  await window.nas4usb.fs.mkdir(destDir);

  /** @type {string[]} */
  let existingNames = [];
  try {
    existingNames = (await window.nas4usb.fs.readDir(destDir)).map((entry) => entry.name);
  } catch {
    existingNames = [];
  }

  const uniqueName = resolveUniqueName(existingNames, ref.fileName);
  const destPath = joinRelativePath(destDir, uniqueName);

  try {
    await window.nas4usb.fs.copy(ref.sourcePath, destPath);
    return toPackageAssetUrl(uniqueName);
  } catch {
    const file =
      (await fileFromWorkspacePath(ref.sourcePath, ref.fileName)) ||
      (await fileFromFetchUrl(fetchUrl, ref.fileName));
    if (!file) throw new Error('asset copy failed');
    return uploadFile(file);
  }
}

/**
 * @param {string} url
 * @param {string} sourceTiptapPath
 */
function rewriteAssetUrlForClipboard(url, sourceTiptapPath) {
  const fileName =
    packageAssetUrlToFileName(url) || linkHrefToAssetFileName(url, sourceTiptapPath);
  if (!fileName) return url;
  return buildMediaStreamUrl(joinTiptapAssetPath(sourceTiptapPath, fileName));
}

/**
 * @param {import('@tiptap/pm/model').Fragment} fragment
 * @param {string} sourceTiptapPath
 */
function rewriteCopiedFragment(fragment, sourceTiptapPath) {
  /** @type {import('@tiptap/pm/model').Node[]} */
  const nodes = [];
  let changed = false;
  fragment.forEach((child) => {
    const next = rewriteCopiedNode(child, sourceTiptapPath);
    if (next !== child) changed = true;
    nodes.push(next);
  });
  return changed ? Fragment.from(nodes) : fragment;
}

/**
 * @param {import('@tiptap/pm/model').Node} node
 * @param {string} sourceTiptapPath
 */
function rewriteCopiedNode(node, sourceTiptapPath) {
  const nextAttrs = { ...node.attrs };
  let attrsChanged = false;
  for (const key of ['src', 'href']) {
    if (typeof nextAttrs[key] !== 'string') continue;
    const rewritten = rewriteAssetUrlForClipboard(nextAttrs[key], sourceTiptapPath);
    if (rewritten === nextAttrs[key]) continue;
    nextAttrs[key] = rewritten;
    attrsChanged = true;
  }

  const nextMarks = node.marks.map((mark) => {
    const href = mark.attrs?.href;
    if (typeof href !== 'string') return mark;
    const rewritten = rewriteAssetUrlForClipboard(href, sourceTiptapPath);
    if (rewritten === href) return mark;
    return mark.type.create({ ...mark.attrs, href: rewritten });
  });
  const marksChanged = nextMarks.some((mark, index) => mark !== node.marks[index]);

  let nextContent = node.content;
  let contentChanged = false;
  if (node.content.size > 0) {
    const rewritten = rewriteCopiedFragment(node.content, sourceTiptapPath);
    if (rewritten !== node.content) {
      nextContent = rewritten;
      contentChanged = true;
    }
  }

  if (!attrsChanged && !marksChanged && !contentChanged) return node;
  if (node.isText) return node.mark(marksChanged ? nextMarks : node.marks);
  return node.type.create(nextAttrs, nextContent, marksChanged ? nextMarks : node.marks);
}

/**
 * @param {string} url
 */
function isNonAssetHref(url) {
  if (/^(mailto:|tel:|#)/i.test(url)) return true;
  if (!/^https?:/i.test(url)) return false;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location?.origin : 'http://local.invalid');
    return !parsed.pathname.includes('/api/fs/stream') && !parsed.pathname.includes('/api/media/');
  } catch {
    return true;
  }
}

/**
 * @param {string} path
 */
function isSidecarAssetPath(path) {
  const normalized = normalizeAssetPath(path);
  if (!normalized || normalized.includes('..')) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  return normalized.includes(`${TIPTAP_ASSET_SIDECAR_SUFFIX}/`);
}

/**
 * @param {string} url
 * @returns {string | null}
 */
function pathParamFromUrl(url) {
  try {
    const parsed = new URL(url, 'http://local.invalid');
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) return normalizeAssetPath(pathParam);
  } catch {
    // ignore
  }
  const match = /[?&]path=([^&]+)/.exec(url);
  if (!match) return null;
  try {
    return normalizeAssetPath(decodeURIComponent(match[1]));
  } catch {
    return normalizeAssetPath(match[1]);
  }
}

/**
 * @param {string} relativePath
 */
async function workspacePathExists(relativePath) {
  try {
    return (await window.nas4usb.fs.exists(relativePath)) === true;
  } catch {
    return false;
  }
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 * @returns {Promise<File | null>}
 */
async function fileFromWorkspacePath(relativePath, fileName) {
  try {
    const raw = await window.nas4usb.fs.readFile(relativePath);
    const base64 = typeof raw === 'string' ? raw : raw?.base64;
    if (!base64) return null;
    const bytes = base64ToBytes(base64);
    return new File([bytes], fileName, { type: guessMimeFromFileName(fileName) });
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @param {string} fileName
 * @returns {Promise<File | null>}
 */
async function fileFromFetchUrl(url, fileName) {
  if (!url || /^(assets\/|asset\/)/i.test(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || guessMimeFromFileName(fileName) });
  } catch {
    return null;
  }
}
