import { appendShareTokenToUrl } from './shareAccess.js';
import { createFsChangeSubscription } from './fsChangeSubscription.js';
import {
  LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  readStorageWithLegacy,
} from '../../shared/legacyConfig.js';

const API_PREFIX = '/api';

const ADMIN_TOKEN_STORAGE_KEY = 'nas4usb.adminToken';

function readAdminToken() {
  try {
    const fromLocal = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore
  }
  return readStorageWithLegacy(sessionStorage, ADMIN_TOKEN_STORAGE_KEY, LEGACY_ADMIN_TOKEN_STORAGE_KEY);
}

/**
 * Exposed so plain resource URLs (e.g. `<img src>`, `<video src>`) can carry the admin
 * token as a query param — those elements issue browser-level GETs that can't attach the
 * `X-Admin-Token` header the way `apiFetch` does.
 */
export function getStoredAdminToken() {
  return readAdminToken() || '';
}

/**
 * @param {string} route
 */
function withShareAccessQuery(route) {
  return appendShareTokenToUrl(`${API_PREFIX}${route}`);
}

/**
 * @param {string} route
 */
function buildApiUrl(route) {
  const path = withShareAccessQuery(route);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * @param {string} route
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 */
async function apiFetch(route, init, timeoutMs = 60000) {
  const adminToken = readAdminToken();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(buildApiUrl(route), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('서버 응답 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
    }
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('서버에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message || 'API request failed');
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

/**
 * Electron preload와 동일한 API를 HTTP로 제공합니다.
 */
export function createHttpNas4usbClient() {
  return {
    __source: 'http',

    getPaths: () => apiFetch('/app/paths'),
    getSyncInfo: () => apiFetch('/sync/info'),
    checkForUpdates: () => apiFetch('/app/checkForUpdates'),
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    },

    dialog: {
      pickDirectory: async () => {
        if (typeof window.showDirectoryPicker !== 'function') {
          throw new Error('브라우저에서 시스템 폴더 선택을 지원하지 않습니다. Electron 앱을 사용해 주세요.');
        }
        return window.showDirectoryPicker({ mode: 'readwrite' });
      },
    },

    subscribeFsChanged: (callback) => createFsChangeSubscription(callback),

    fs: {
      readDir: (relativePath) =>
        apiFetch(`/fs/readDir?path=${encodeURIComponent(relativePath ?? '.')}`),
      mkdir: (relativePath) =>
        apiFetch('/fs/mkdir', { method: 'POST', body: JSON.stringify({ path: relativePath }) }),
      delete: (relativePath) =>
        apiFetch('/fs/delete', { method: 'POST', body: JSON.stringify({ path: relativePath }) }),
      rename: (fromRelative, toRelative) =>
        apiFetch('/fs/rename', {
          method: 'POST',
          body: JSON.stringify({ from: fromRelative, to: toRelative }),
        }),
      exists: (relativePath) =>
        apiFetch(`/fs/exists?path=${encodeURIComponent(relativePath)}`),
      readFile: (relativePath) =>
        apiFetch(`/fs/readFile?path=${encodeURIComponent(relativePath)}`),
      writeFile: (relativePath, base64) =>
        apiFetch('/fs/writeFile', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath, base64 }),
        }),
      copy: (fromRelative, toRelative) =>
        apiFetch('/fs/copy', {
          method: 'POST',
          body: JSON.stringify({ from: fromRelative, to: toRelative }),
        }),
      move: (fromRelative, toRelative) =>
        apiFetch('/fs/move', {
          method: 'POST',
          body: JSON.stringify({ from: fromRelative, to: toRelative }),
        }),
      stat: (relativePath) =>
        apiFetch(`/fs/stat?path=${encodeURIComponent(relativePath)}`),
      openPath: () =>
        Promise.reject(
          new Error('시스템으로 열기는 NAS4USB 앱에서만 사용할 수 있습니다. 브라우저에서는 다운로드를 이용해 주세요.'),
        ),
    },

    workspace: {
      open: (relativePath, shareToken) =>
        apiFetch('/workspace/open', {
          method: 'POST',
          body: JSON.stringify({ relativePath, shareToken }),
        }),
      read: (sessionId) =>
        apiFetch(`/workspace/read?sessionId=${encodeURIComponent(sessionId)}`),
      write: (sessionId, base64) =>
        apiFetch(
          '/workspace/write',
          {
            method: 'POST',
            body: JSON.stringify({ sessionId, base64 }),
          },
          180000,
        ),
      commit: (sessionId) =>
        apiFetch('/workspace/commit', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        }),
      rename: (sessionId, relativePath) =>
        apiFetch('/workspace/rename', {
          method: 'POST',
          body: JSON.stringify({ sessionId, relativePath }),
        }),
      close: (sessionId) =>
        apiFetch('/workspace/close', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
          keepalive: true,
        }),
    },

    editors: {
      getStatus: () => apiFetch('/editors/status'),
    },

    auth: {
      login: ({ id, password, rememberMe }) =>
        apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ id, password, rememberMe }),
        }),
      showDefaultAdminHint: async () => {
        const result = await apiFetch('/auth/showDefaultAdminHint');
        return Boolean(result?.show);
      },
      // No per-connection binding over HTTP; this only reports whether the token still resolves.
      bindToken: async (token) => {
        if (!token) return null;
        try {
          return await apiFetch('/auth/session', { headers: { 'X-Admin-Token': token } });
        } catch {
          return null;
        }
      },
      bindShareToken: (token) => Promise.resolve(true),
      logout: () =>
        apiFetch('/auth/logout', {
          method: 'POST',
          body: '{}',
        }),
    },

    share: {
      getMap: () => apiFetch('/share/map'),
      create: ({ path, mode }) =>
        apiFetch('/share/create', {
          method: 'POST',
          body: JSON.stringify({ path, mode }),
        }),
      setMode: ({ path, mode }) =>
        apiFetch('/share/set-mode', {
          method: 'POST',
          body: JSON.stringify({ path, mode }),
        }),
      revoke: ({ path }) =>
        apiFetch('/share/revoke', {
          method: 'POST',
          body: JSON.stringify({ path }),
        }),
      resolve: ({ token }) =>
        apiFetch(`/share/resolve?token=${encodeURIComponent(token ?? '')}`),
    },

    fileAccess: {
      getMap: () => apiFetch('/file-access/map'),
      canEdit: (relativePath) =>
        apiFetch(`/file-access/can-edit?path=${encodeURIComponent(relativePath ?? '')}`),
      set: ({ path, visibility, viewRestricted }) =>
        apiFetch('/file-access/set', {
          method: 'POST',
          body: JSON.stringify({ path, visibility, viewRestricted }),
        }),
    },

    favorites: {
      getMap: () => apiFetch('/favorites/map'),
      listEntries: () => apiFetch('/favorites/listEntries'),
      set: ({ path, favorited }) =>
        apiFetch('/favorites/set', {
          method: 'POST',
          body: JSON.stringify({ path, favorited }),
        }),
    },

    trash: {
      getMap: () => apiFetch('/trash/map'),
      move: (relativePath) =>
        apiFetch('/trash/move', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath }),
        }),
      restore: (relativePath) =>
        apiFetch('/trash/restore', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath }),
        }),
      empty: () => apiFetch('/trash/empty', { method: 'POST', body: '{}' }),
      deletePermanent: (relativePath) =>
        apiFetch('/trash/deletePermanent', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath }),
        }),
    },

    // The share token is already appended to every request URL by `buildApiUrl`, so it
    // doesn't need to be forwarded explicitly here — the `shareToken` param only exists
    // to keep the call signature identical to the Electron preload API.
    history: {
      list: (relativePath) =>
        apiFetch(`/history/list?path=${encodeURIComponent(relativePath ?? '')}`),
      read: (relativePath, entryId) =>
        apiFetch(
          `/history/read?path=${encodeURIComponent(relativePath ?? '')}&entryId=${encodeURIComponent(entryId ?? '')}`,
        ),
      readSidecar: (relativePath, entryId) =>
        apiFetch(
          `/history/readSidecar?path=${encodeURIComponent(relativePath ?? '')}&entryId=${encodeURIComponent(entryId ?? '')}`,
        ),
      deleteEntry: (relativePath, entryId) =>
        apiFetch('/history/delete', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath, entryId }),
        }),
      restore: (relativePath, entryId) =>
        apiFetch('/history/restore', {
          method: 'POST',
          body: JSON.stringify({ path: relativePath, entryId }),
        }),
    },

    settings: {
      get: () => apiFetch('/settings'),
      getGuestPermissions: () => apiFetch('/settings/guest-permissions'),
      getTheme: () => apiFetch('/settings/theme'),
      update: (patch) =>
        apiFetch('/settings', {
          method: 'PUT',
          body: JSON.stringify(patch ?? {}),
        }),
      applyDataRoot: async () => {
        throw new Error('data 루트 변경은 서버 PC의 NAS4USB 앱에서만 할 수 있습니다.');
      },
    },

    members: {
      list: () => apiFetch('/members'),
      export: () => apiFetch('/members/export'),
      save: (payload) =>
        apiFetch('/members', {
          method: 'PUT',
          body: JSON.stringify(payload ?? {}),
        }),
    },
  };
}
