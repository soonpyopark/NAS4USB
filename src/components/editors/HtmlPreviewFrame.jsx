import { useEffect, useMemo, useRef } from 'react';
import { isExternalHttpUrl, openExternalUrl } from '../../lib/openExternal.js';
import { highlightTextInElement } from '../../lib/searchHighlight.js';
import { prepareHtmlPreviewDocument } from '../../lib/text/htmlPreview.js';
import { injectNasScrollbarStyle } from '../../lib/ui/nasScrollbarStyle.js';

/**
 * Sandboxed live preview of an HTML document (no scripts, same as the old viewer).
 * @param {{
 *   html: string,
 *   relativePath?: string,
 *   title?: string,
 *   className?: string,
 *   highlightQuery?: string,
 * }} props
 */
export default function HtmlPreviewFrame({
  html,
  relativePath = '',
  title = 'HTML 미리보기',
  className = '',
  highlightQuery = '',
}) {
  const srcDoc = useMemo(
    () => prepareHtmlPreviewDocument(html, relativePath),
    [html, relativePath],
  );
  const frameRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const onPreviewClick = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const raw = String(anchor.getAttribute('href') ?? '').trim();
      if (!raw || raw.startsWith('#') || raw.toLowerCase().startsWith('javascript:')) return;
      let url = raw;
      try {
        url = new URL(raw, 'https://preview.invalid/').href;
      } catch {
        return;
      }
      if (!isExternalHttpUrl(url) || url.startsWith('https://preview.invalid/')) return;
      event.preventDefault();
      event.stopPropagation();
      void openExternalUrl(url);
    };

    /** @type {Document | null} */
    let boundDoc = null;
    const unbind = () => {
      boundDoc?.removeEventListener('click', onPreviewClick, true);
      boundDoc = null;
    };
    const bind = () => {
      unbind();
      const doc = frame.contentDocument;
      if (!doc) return;
      injectNasScrollbarStyle(doc);
      highlightTextInElement(doc.body || doc.documentElement, highlightQuery);
      doc.addEventListener('click', onPreviewClick, true);
      boundDoc = doc;
    };

    bind();
    frame.addEventListener('load', bind);
    return () => {
      unbind();
      frame.removeEventListener('load', bind);
    };
  }, [highlightQuery, srcDoc]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-forms"
      className={className || 'h-full min-h-0 w-full border-0 bg-white'}
    />
  );
}
