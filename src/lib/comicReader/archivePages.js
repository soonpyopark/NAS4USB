import JSZip from 'jszip';
import { unwrapWorkspaceBase64 } from '../filePassword/io.js';
import { getImageMimeType, isImageExtension } from '../media/mediaTypes.js';
import { getShareTokenFromUrl } from '../shareAccess.js';
import { getStoredAdminToken } from '../nas4usbClient.js';

const IMAGE_NAME_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|apng)$/i;

/**
 * @param {string} a
 * @param {string} b
 */
export function naturalCompareNames(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * @param {string} relativePath
 * @returns {Promise<ArrayBuffer>}
 */
export async function readRelativePathArrayBuffer(relativePath) {
  if (typeof window !== 'undefined' && window.nas4usb?.fs?.readFile) {
    const raw = await window.nas4usb.fs.readFile(relativePath);
    const base64 = await unwrapWorkspaceBase64(relativePath, raw);
    const binary = atob(String(base64 ?? ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const params = new URLSearchParams({ path: relativePath });
  const shareToken = getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  const adminToken = getStoredAdminToken();
  if (adminToken) params.set('token', adminToken);
  const response = await fetch(`/api/fs/download?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('파일을 읽지 못했습니다.');
  }
  return response.arrayBuffer();
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ pages: Array<{ id: string, name: string, url: string }>, revoke: () => void }>}
 */
export async function pagesFromZipBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  /** @type {Array<{ name: string, entry: import('jszip').JSZipObject }>} */
  const imageEntries = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith('__MACOSX/')) return;
    if (!IMAGE_NAME_RE.test(relativePath)) return;
    imageEntries.push({ name: relativePath.replace(/\\/g, '/'), entry });
  });
  imageEntries.sort((a, b) => naturalCompareNames(a.name, b.name));

  /** @type {string[]} */
  const urls = [];
  const pages = [];
  for (let i = 0; i < imageEntries.length; i += 1) {
    const { name, entry } = imageEntries[i];
    const blob = await entry.async('blob');
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const typed =
      isImageExtension(ext) && blob.type === ''
        ? new Blob([blob], { type: getImageMimeType(ext) })
        : blob;
    const url = URL.createObjectURL(typed);
    urls.push(url);
    pages.push({ id: `zip-${i}`, name, url });
  }

  return {
    pages,
    revoke: () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}

/**
 * @param {string} relativePath
 * @param {{ token?: string, share?: string }} [auth]
 */
export function buildArchiveSessionUrl(relativePath, auth = {}) {
  const params = new URLSearchParams({ path: relativePath });
  const shareToken = auth.share ?? getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  const adminToken = auth.token ?? getStoredAdminToken();
  if (adminToken) params.set('token', adminToken);
  return `/api/comic/openArchive?${params.toString()}`;
}

/**
 * @param {string} sessionId
 * @param {number} index
 */
export function buildArchivePageUrl(sessionId, index) {
  const params = new URLSearchParams({
    sessionId,
    index: String(index),
  });
  const shareToken = getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  const adminToken = getStoredAdminToken();
  if (adminToken) params.set('token', adminToken);
  return `/api/comic/archivePage?${params.toString()}`;
}

/**
 * Open rar/cbr/7z via server extract (also works for zip as fallback).
 * @param {string} relativePath
 */
export async function openServerArchivePages(relativePath) {
  if (typeof window !== 'undefined' && window.nas4usb?.comic?.openArchive) {
    const result = await window.nas4usb.comic.openArchive(relativePath);
    const sessionId = result.sessionId;
    const pages = (result.pages ?? []).map((page) => ({
      id: `arc-${page.index}`,
      name: page.name,
      url: buildArchivePageUrl(sessionId, page.index),
    }));
    return {
      kind: /** @type {const} */ ('archive'),
      sessionId,
      pages,
      revoke: async () => {
        try {
          await window.nas4usb.comic.closeArchive(sessionId);
        } catch {
          // ignore
        }
      },
    };
  }

  const response = await fetch(buildArchiveSessionUrl(relativePath), { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || '압축 파일을 열지 못했습니다.');
  }
  const result = await response.json();
  const sessionId = result.sessionId;
  const pages = (result.pages ?? []).map((/** @type {{ index: number, name: string }} */ page) => ({
    id: `arc-${page.index}`,
    name: page.name,
    url: buildArchivePageUrl(sessionId, page.index),
  }));

  return {
    kind: /** @type {const} */ ('archive'),
    sessionId,
    pages,
    revoke: async () => {
      try {
        await fetch('/api/comic/closeArchive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // ignore
      }
    },
  };
}
