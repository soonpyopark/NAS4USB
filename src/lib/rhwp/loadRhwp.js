/**
 * @typedef {Object} RhwpEditorHandle
 * @property {() => string} [getText]
 * @property {() => string} [getHtml]
 * @property {() => string} [getHwpxBase64]
 * @property {() => Promise<string>} [exportHwpxBase64]
 * @property {(text: string, origin?: string) => void} [setText]
 * @property {(html: string, origin?: string) => void} [setHtml]
 * @property {(base64: string, origin?: string) => void | Promise<void>} [setHwpxBase64]
 * @property {(callback: (content: string, origin?: string) => void) => () => void} [onChange]
 * @property {() => HTMLElement | null} [getEditableElement]
 * @property {(enabled: boolean) => void} [setEditable]
 * @property {() => void} [destroy]
 */

/**
 * Load rhwp adapter backed by @rhwp/editor (github.com/edwardkim/rhwp).
 *
 * @returns {Promise<{ mount: (container: HTMLElement, options?: object) => Promise<RhwpEditorHandle> } | null>}
 */
export async function loadRhwpModule() {
  try {
    const mod = await import('@nas4usb/rhwp');
    const mount = mod.mountRhwp ?? mod.default?.mount ?? mod.default ?? null;
    if (typeof mount === 'function') {
      return { mount };
    }
    return null;
  } catch {
    return null;
  }
}
