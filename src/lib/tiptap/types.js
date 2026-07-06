/** @typedef {Object} TipTapEditorHandle
 * @property {() => string} getHtml
 * @property {(html: string, origin?: string) => void} setHtml
 * @property {(callback: (html: string, origin?: string) => void) => () => void} onChange
 * @property {(enabled: boolean) => void} setEditable
 * @property {() => HTMLElement | null} [getEditableElement]
 * @property {() => void} [destroy]
 */

export {};
