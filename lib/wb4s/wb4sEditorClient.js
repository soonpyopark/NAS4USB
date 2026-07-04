const DEFAULT_TIMEOUT_MS = 60000;
const BOOT_TIMEOUT_MS = 45000;
const POLL_INTERVAL_MS = 100;

/** @type {Record<string, number>} */
const METHOD_TIMEOUT_MS = {
  ready: 3000,
  init: 60000,
  exportDocument: 120000,
};

let requestId = 0;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * @param {HTMLIFrameElement} iframe
 */
function waitForIframeLoad(iframe) {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve(undefined);
    };
    const onError = () => {
      cleanup();
      reject(new Error('wb4s-editor iframe 로드에 실패했습니다.'));
    };
    const cleanup = () => {
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
    };
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', onError, { once: true });
  });
}

/**
 * @param {string | URL} editorUrl
 * @param {HTMLElement} container
 */
export async function createWb4sEditorClient(container, editorUrl) {
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.flex = '1';
  iframe.style.minHeight = '0';
  iframe.style.border = 'none';
  iframe.allow = 'clipboard-read; clipboard-write';

  const client = new Wb4sEditorClient(iframe);
  const readyPromise = client.waitReady();

  container.appendChild(iframe);
  iframe.src = String(editorUrl);

  await readyPromise;
  return client;
}

class Wb4sEditorClient {
  /** @param {HTMLIFrameElement} iframe */
  constructor(iframe) {
    this._iframe = iframe;
    /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: number }>} */
    this._pending = new Map();
    /** @type {((status: Record<string, unknown>) => void) | null} */
    this._onCollabStatus = null;
    this._hostReady = false;

    this._onMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (event.source !== this._iframe.contentWindow) return;

      if (data.type === 'wb4s-host-ready') {
        this._hostReady = true;
        return;
      }

      if (data.type === 'wb4s-collab-status') {
        this._onCollabStatus?.({
          remotePeerCount: Number(data.remotePeerCount) || 0,
          isWsConnected: Boolean(data.isWsConnected),
          isSynced: Boolean(data.isSynced),
          isReady: Boolean(data.isReady),
        });
        return;
      }

      if (data.type !== 'wb4s-response' || data.id == null) return;

      const pending = this._pending.get(data.id);
      if (!pending) return;

      window.clearTimeout(pending.timer);
      this._pending.delete(data.id);

      if (data.error) {
        pending.reject(new Error(String(data.error)));
        return;
      }

      pending.resolve(data.result);
    };

    window.addEventListener('message', this._onMessage);
  }

  /** @param {(status: Record<string, unknown>) => void} callback */
  onCollabStatus(callback) {
    this._onCollabStatus = callback;
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   * @param {number} [timeoutMs]
   */
  _request(method, params = {}, timeoutMs = METHOD_TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = window.setTimeout(() => {
        if (!this._pending.has(id)) return;
        this._pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, timer });
      this._iframe.contentWindow?.postMessage({ type: 'wb4s-request', id, method, params }, '*');
    });
  }

  async waitReady() {
    let loaded = false;
    const loadPromise = waitForIframeLoad(this._iframe)
      .then(() => {
        loaded = true;
      })
      .catch((error) => {
        throw error instanceof Error ? error : new Error('wb4s-editor iframe 로드에 실패했습니다.');
      });

    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (this._hostReady) break;

      if (!loaded) {
        await Promise.race([loadPromise, delay(POLL_INTERVAL_MS)]);
      }

      if (this._hostReady) break;

      if (loaded && this._iframe.contentWindow) {
        try {
          const ready = await this._request('ready', {}, METHOD_TIMEOUT_MS.ready);
          if (ready) {
            this._hostReady = true;
            break;
          }
        } catch {
          // Embed React is still booting.
        }
      }

      await delay(POLL_INTERVAL_MS);
    }

    if (!this._hostReady) {
      throw new Error('wb4s-editor boot timeout');
    }

    const ready = await this._request('ready', {}, METHOD_TIMEOUT_MS.ready);
    if (!ready) {
      throw new Error('wb4s-editor 초기화 시간이 초과되었습니다.');
    }
  }

  /**
   * @param {{
   *   documentJson: string,
   *   roomId: string,
   *   syncServerUrl: string,
   *   userName: string,
   * }} options
   */
  async init(options) {
    return this._request('init', options, METHOD_TIMEOUT_MS.init);
  }

  async exportDocument() {
    const result = await this._request('exportDocument', {}, METHOD_TIMEOUT_MS.exportDocument);
    return String(result ?? '');
  }

  get element() {
    return this._iframe;
  }

  destroy() {
    window.removeEventListener('message', this._onMessage);
    for (const pending of this._pending.values()) {
      window.clearTimeout(pending.timer);
    }
    this._pending.clear();
    this._iframe.remove();
  }
}
