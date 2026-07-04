import { createWb4sEditorClient } from './wb4sEditorClient.js';

const WB4S_VERSION = '1.0.2';

/**
 * @returns {string}
 */
function getEditorUrl() {
  const url = new URL('wb4s-editor/embed.html', window.location.href);
  url.searchParams.set('embed', '1');
  return url.href;
}

/**
 * @typedef {Object} Wb4sMountOptions
 * @property {string} [fileName]
 * @property {string} [relativePath]
 * @property {string} documentJson
 * @property {string} roomId
 * @property {string} syncServerUrl
 * @property {string} userName
 * @property {(error: Error) => void} [onLoadError]
 * @property {(status: { remotePeerCount: number, isWsConnected: boolean, isSynced: boolean, isReady: boolean }) => void} [onCollabStatus]
 */

/**
 * @param {HTMLElement} container
 * @param {Wb4sMountOptions} options
 */
export async function mountWb4s(container, options) {
  const {
    fileName = 'whiteboard.wb4s',
    relativePath = '',
    documentJson,
    roomId,
    syncServerUrl,
    userName,
    onLoadError,
    onCollabStatus,
  } = options;

  container.innerHTML = '';
  container.className = 'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100';

  const header = document.createElement('div');
  header.className =
    'flex shrink-0 items-center justify-between border-b border-slate-300 bg-white px-4 py-1.5 text-xs text-slate-600';
  header.innerHTML = `
    <span class="font-semibold text-slate-800">WhiteBoard4Share ${WB4S_VERSION}</span>
    <span class="truncate text-slate-500">${fileName}${relativePath ? ` · ${relativePath}` : ''}</span>
  `;

  const editorHost = document.createElement('div');
  editorHost.className = 'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white';
  container.append(header, editorHost);

  /** @type {import('./wb4sEditorClient.js').createWb4sEditorClient extends (...args: any) => Promise<infer T> ? T : never} */
  let client = null;

  try {
    client = await createWb4sEditorClient(editorHost, getEditorUrl());
    if (onCollabStatus) {
      client.onCollabStatus(onCollabStatus);
    }
    await client.init({
      documentJson,
      roomId,
      syncServerUrl,
      userName,
    });
  } catch (err) {
    client?.destroy?.();
    const error = err instanceof Error ? err : new Error('wb4s-editor mount failed');
    onLoadError?.(error);
    throw error;
  }

  return {
    getEditableElement: () => client.element,
    async exportDocumentJson() {
      return client.exportDocument();
    },
    destroy() {
      client?.destroy();
      client = null;
    },
  };
}
