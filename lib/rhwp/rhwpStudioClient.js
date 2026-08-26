const DEFAULT_TIMEOUT_MS = 60000;

/** @type {Record<string, number>} */
const METHOD_TIMEOUT_MS = {
  ready: 20000,
  loadFile: 180000,
  exportHwpx: 120000,
  exportHwp: 120000,
  pasteHtml: 120000,
  pageCount: 20000,
  getPageSvg: 30000,
  getPageInfo: 20000,
};

let requestId = 0;

/**
 * @param {string | URL} studioUrl
 * @param {HTMLElement} container
 * @param {{ width?: string, height?: string, onStatus?: (text: string) => void }} [options]
 */
export async function createRhwpStudioClient(container, studioUrl, options = {}) {
  const iframe = document.createElement('iframe');
  iframe.src = String(studioUrl);
  iframe.style.width = options.width ?? '100%';
  iframe.style.height = options.height ?? '100%';
  iframe.style.flex = '1';
  iframe.style.minHeight = '0';
  iframe.style.border = 'none';
  iframe.allow = 'clipboard-read; clipboard-write';
  container.appendChild(iframe);

  await new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve(undefined);
    };
    const onError = () => {
      cleanup();
      reject(new Error('rhwp-studio iframe 로드에 실패했습니다.'));
    };
    const cleanup = () => {
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
    };
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', onError, { once: true });
  });

  const client = new RhwpStudioClient(iframe, options);
  await client.waitReady();
  return client;
}

class RhwpStudioClient {
  /**
   * @param {HTMLIFrameElement} iframe
   * @param {{ onStatus?: (text: string) => void }} [options]
   */
  constructor(iframe, options = {}) {
    this._iframe = iframe;
    this._onStatus = options.onStatus;
    /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: number }>} */
    this._pending = new Map();

    this._onMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'rhwp-document-changed') {
        if (event.source !== this._iframe.contentWindow) return;
        this._onDocumentChanged?.();
        return;
      }

      if (data.type === 'rhwp-embed-status' && typeof data.text === 'string') {
        if (event.source !== this._iframe.contentWindow) return;
        this._onStatus?.(data.text);
        return;
      }

      if (data.type !== 'rhwp-response' || data.id == null) return;

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

    /** @type {(() => void) | null} */
    this._onDocumentChanged = null;

    window.addEventListener('message', this._onMessage);
  }

  /** @param {() => void} callback */
  onDocumentChanged(callback) {
    this._onDocumentChanged = callback;
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

      this._iframe.contentWindow?.postMessage({ type: 'rhwp-request', id, method, params }, '*');
    });
  }

  async waitReady() {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try {
        const ready = await this._request('ready', {}, 8_000);
        if (ready) return;
      } catch {
        // WASM·CanvasKit 초기화 대기
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    throw new Error('rhwp-studio WASM 초기화 시간이 초과되었습니다. 페이지를 새로고침해 주세요.');
  }

  /**
   * @param {Uint8Array | ArrayBuffer} data
   * @param {string} [fileName]
   */
  async loadFile(data, fileName = 'document.hwpx') {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const result = await this._request(
      'loadFile',
      {
        data: bytes,
        fileName,
        skipUnsavedGuard: true,
      },
      METHOD_TIMEOUT_MS.loadFile,
    );
    this.refreshView();
    return result;
  }

  async pageCount() {
    return this._request('pageCount', {}, METHOD_TIMEOUT_MS.pageCount);
  }

  /**
   * 0-based page SVG from the live rhwp document.
   * @param {number} [page]
   * @returns {Promise<string>}
   */
  async getPageSvg(page = 0) {
    const result = await this._request('getPageSvg', { page }, METHOD_TIMEOUT_MS.getPageSvg);
    return String(result ?? '');
  }

  /**
   * Page metrics (CSS px @ 96dpi: `{ width, height, ... }`).
   * @param {number} [page]
   */
  async getPageInfo(page = 0) {
    return this._request('getPageInfo', { page }, METHOD_TIMEOUT_MS.getPageInfo ?? 20000);
  }

  refreshView() {
    this._iframe.contentWindow?.postMessage({ type: 'rhwp-embed-refresh' }, '*');
  }

  async exportHwpx() {
    const result = await this._request('exportHwpx', {}, METHOD_TIMEOUT_MS.exportHwpx);
    if (result instanceof Uint8Array) return result;
    if (Array.isArray(result)) return new Uint8Array(result);
    return new Uint8Array(result || []);
  }

  /**
   * Paste an HTML fragment into the loaded document body.
   * @param {string} html
   * @param {{ sectionIdx?: number, paraIdx?: number, charOffset?: number }} [position]
   */
  async pasteHtml(html, position = {}) {
    return this._request(
      'pasteHtml',
      {
        html: String(html ?? ''),
        sectionIdx: position.sectionIdx ?? 0,
        paraIdx: position.paraIdx ?? 0,
        charOffset: position.charOffset ?? 0,
      },
      METHOD_TIMEOUT_MS.pasteHtml,
    );
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
