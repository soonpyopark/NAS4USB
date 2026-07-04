/**
 * @typedef {Object} Wb4sEditorHandle
 * @property {() => HTMLElement | null} [getEditableElement]
 * @property {() => Promise<string>} [exportDocumentJson]
 * @property {() => void} [destroy]
 */

/** @type {Promise<{ mount: (container: HTMLElement, options?: object) => Promise<Wb4sEditorHandle> }> | null} */
let modulePromise = null;

/**
 * Load wb4s adapter backed by WhiteBoard4Share embed bundle.
 *
 * @returns {Promise<{ mount: (container: HTMLElement, options?: object) => Promise<Wb4sEditorHandle> }>}
 */
export function loadWb4sModule() {
  if (!modulePromise) {
    modulePromise = import('@educowork/wb4s').then((mod) => {
      const mount = mod.mountWb4s ?? mod.mount ?? mod.default?.mount ?? mod.default ?? null;
      if (typeof mount !== 'function') {
        throw new Error('wb4s mount function not found');
      }
      return { mount };
    });
  }
  return modulePromise;
}
