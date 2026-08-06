import { createRhwpStudioClient } from './rhwpStudioClient.js';

const RHWP_VERSION = '0.8.2';
const SYNC_POLL_MS = 1200;
const SYNC_DEBOUNCE_MS = 400;

/**
 * @returns {string}
 */
function getStudioUrl() {
  const url = new URL('rhwp-studio/index.html', window.location.href);
  url.searchParams.set('embed', '1');
  // autosave 복구 대화상자만 건너뛰고, URL fetch(loadFromUrlParam)는 실행하지 않음
  url.searchParams.set('url', '');
  return url.href;
}

/**
 * @param {Uint8Array} bytes
 */
function assertHwpxBytes(bytes, fileName) {
  const zipSignatures = [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ];
  const hasZipSignature = zipSignatures.some(
    (signature) =>
      bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value),
  );
  if (hasZipSignature) return;

  const prefix = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 256)))
    .trimStart()
    .toLowerCase();

  if (prefix.startsWith('<!doctype') || prefix.startsWith('<html')) {
    throw new Error(
      `${fileName} 내용이 HWPX가 아닙니다. 파일이 비어 있거나 HTML/오류 페이지 데이터입니다.`,
    );
  }

  throw new Error(`${fileName}의 HWPX 시그니처를 확인할 수 없습니다.`);
}

/**
 * @param {string} base64
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 */
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @typedef {Object} RhwpMountOptions
 * @property {string} [fileName]
 * @property {string} [relativePath]
 * @property {string} [hwpxBase64]
 * @property {(error: Error) => void} [onLoadError]
 * @property {(text: string) => void} [onStudioStatus]
 */

/**
 * @param {HTMLElement} container
 * @param {RhwpMountOptions} [options]
 */
export async function mountRhwp(container, options = {}) {
  const {
    fileName = 'document.hwpx',
    relativePath = '',
    hwpxBase64 = '',
    onLoadError,
    onStudioStatus,
  } = options;

  container.innerHTML = '';
  container.className = 'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100';

  const header = document.createElement('div');
  header.className =
    'flex shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 py-1.5 text-xs text-slate-600';
  header.innerHTML = `
    <span class="font-semibold text-slate-800">rhwp ${RHWP_VERSION} · rhwp-studio</span>
    <span class="truncate text-slate-500">${fileName}${relativePath ? ` · ${relativePath}` : ''}</span>
  `;

  const editorHost = document.createElement('div');
  editorHost.className = 'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white';
  container.append(header, editorHost);

  /** @type {import('./rhwpStudioClient.js').RhwpStudioClient | null} */
  let studio = null;
  /** @type {Set<(value: string, origin?: string) => void>} */
  const listeners = new Set();
  let pollTimer = null;
  let syncPushEnabled = false;
  let lastSnapshot = hwpxBase64;
  let applyingRemote = false;
  let exporting = false;
  let syncDebounceTimer = null;

  const pausePolling = () => {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  };

  const resumePolling = () => {
    if (!syncPushEnabled || pollTimer) return;
    pollTimer = window.setInterval(() => {
      void emitChange('local');
    }, SYNC_POLL_MS);
  };

  try {
    if (!hwpxBase64) {
      throw new Error('HWPX 데이터가 비어 있습니다.');
    }

    studio = await createRhwpStudioClient(editorHost, getStudioUrl(), { onStatus: onStudioStatus });
    studio.onDocumentChanged(() => {
      scheduleSyncPush();
    });
    const bytes = base64ToBytes(hwpxBase64);
    assertHwpxBytes(bytes, fileName);
    const result = await studio.loadFile(bytes, fileName);
    if (result?.pageCount === 0) {
      throw new Error(`${fileName}에 표시할 페이지가 없습니다.`);
    }
    lastSnapshot = hwpxBase64;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onLoadError?.(error);
    studio?.destroy?.();
    throw error;
  }

  const exportSnapshot = async () => {
    if (!studio || exporting) return lastSnapshot;
    exporting = true;
    try {
      const bytes = await studio.exportHwpx();
      lastSnapshot = bytesToBase64(bytes);
      return lastSnapshot;
    } finally {
      exporting = false;
    }
  };

  const emitChange = async (origin = 'local') => {
    if (applyingRemote || !studio) return;
    try {
      const previous = lastSnapshot;
      const next = await exportSnapshot();
      if (next === previous) return;
      listeners.forEach((listener) => listener(next, origin));
    } catch (error) {
      console.warn('[rhwp] sync export failed', error);
    }
  };

  const scheduleSyncPush = () => {
    if (applyingRemote || !syncPushEnabled) return;
    if (syncDebounceTimer) window.clearTimeout(syncDebounceTimer);
    syncDebounceTimer = window.setTimeout(() => {
      syncDebounceTimer = null;
      void emitChange('local');
    }, SYNC_DEBOUNCE_MS);
  };

  const startPolling = () => {
    syncPushEnabled = true;
    resumePolling();
  };

  const stopPolling = () => {
    syncPushEnabled = false;
    pausePolling();
    if (syncDebounceTimer) {
      window.clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
  };

  return {
    getText: () => '',
    getHtml: () => '',
    getHwpxBase64: () => lastSnapshot,
    exportHwpxBase64: exportSnapshot,
    setText: () => {},
    setHtml: () => {},
    setHwpxBase64: async (base64, origin) => {
      if (!studio || !base64 || base64 === lastSnapshot) return;
      applyingRemote = true;
      pausePolling();
      try {
        await studio.loadFile(base64ToBytes(base64), fileName);
        lastSnapshot = base64;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.warn('[rhwp] remote load failed', error);
        throw error;
      } finally {
        applyingRemote = false;
        resumePolling();
      }
      if (origin !== 'yjs') {
        listeners.forEach((listener) => listener(base64, origin ?? 'local'));
      }
    },
    onChange: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getEditableElement: () => studio?.element ?? editorHost,
    setEditable: (enabled) => {
      if (enabled) startPolling();
      else stopPolling();
    },
    destroy: () => {
      stopPolling();
      listeners.clear();
      studio?.destroy?.();
      studio = null;
      container.innerHTML = '';
    },
    loadPromise: Promise.resolve(),
  };
}

export default mountRhwp;
