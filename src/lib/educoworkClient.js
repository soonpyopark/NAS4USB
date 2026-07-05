const API_PREFIX = '/api';

/**
 * @param {string} route
 * @param {RequestInit} [init]
 */
async function apiFetch(route, init) {
  const response = await fetch(`${API_PREFIX}${route}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

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
export function createHttpEducoworkClient() {
  return {
    __source: 'http',

    getPaths: () => apiFetch('/app/paths'),
    getSyncInfo: () => apiFetch('/sync/info'),
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    },

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
      openPath: (relativePath) => {
        window.open(
          `${API_PREFIX}/fs/download?path=${encodeURIComponent(relativePath)}`,
          '_blank',
          'noopener,noreferrer',
        );
        return Promise.resolve(true);
      },
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
    },

    workspace: {
      open: (relativePath) =>
        apiFetch('/workspace/open', {
          method: 'POST',
          body: JSON.stringify({ relativePath }),
        }),
      read: (sessionId) =>
        apiFetch(`/workspace/read?sessionId=${encodeURIComponent(sessionId)}`),
      write: (sessionId, base64) =>
        apiFetch('/workspace/write', {
          method: 'POST',
          body: JSON.stringify({ sessionId, base64 }),
        }),
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
        }),
    },

    editors: {
      getStatus: () => apiFetch('/editors/status'),
      update: () => apiFetch('/editors/update', { method: 'POST', body: '{}' }),
    },

    auth: {
      login: ({ id, password }) =>
        apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ id, password }),
        }),
    },

    share: {
      getMap: () => apiFetch('/share/map'),
      create: ({ path }) =>
        apiFetch('/share/create', {
          method: 'POST',
          body: JSON.stringify({ path }),
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
      set: ({ path, visibility, viewRestricted }) =>
        apiFetch('/file-access/set', {
          method: 'POST',
          body: JSON.stringify({ path, visibility, viewRestricted }),
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
  };
}
