import nasScrollbarCss from '../../styles/scrollbar.css?raw';

export const NAS_SCROLLBAR_STYLE_MARK = 'data-nas-scrollbar';

/**
 * @returns {string}
 */
export function nasScrollbarStyleTag() {
  return `<style ${NAS_SCROLLBAR_STYLE_MARK}>${nasScrollbarCss}</style>`;
}

/**
 * Apply the app scrollbar to an iframe / srcDoc document.
 * @param {Document | null | undefined} doc
 */
export function injectNasScrollbarStyle(doc) {
  if (!doc?.documentElement) return;
  if (doc.querySelector(`style[${NAS_SCROLLBAR_STYLE_MARK}]`)) return;
  const el = doc.createElement('style');
  el.setAttribute(NAS_SCROLLBAR_STYLE_MARK, '');
  el.textContent = nasScrollbarCss;
  (doc.head || doc.documentElement).appendChild(el);
}
