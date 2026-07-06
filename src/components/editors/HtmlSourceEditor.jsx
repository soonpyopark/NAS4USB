import { useCallback, useEffect, useMemo, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('xml', xml);

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.readOnly]
 */
export default function HtmlSourceEditor({ value, onChange, readOnly = false }) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);
  const panelRef = useRef(null);

  const highlighted = useMemo(() => {
    const source = value ?? '';
    try {
      return hljs.highlight(source, { language: 'xml', ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(source);
    }
  }, [value]);

  const lineNumbers = useMemo(() => {
    const lines = Math.max(1, (value?.match(/\n/g)?.length ?? 0) + 1);
    return Array.from({ length: lines }, (_, index) => index + 1);
  }, [value]);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = textarea.scrollTop;
    }
  }, []);

  const handleWheel = useCallback(
    (event) => {
      const textarea = textareaRef.current;
      if (!textarea || event.target === textarea) return;

      textarea.scrollTop += event.deltaY;
      textarea.scrollLeft += event.deltaX;
      syncScroll();
      event.preventDefault();
    },
    [syncScroll],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;

    panel.addEventListener('wheel', handleWheel, { passive: false });
    return () => panel.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = (event) => {
    if (readOnly || event.key !== 'Tab') return;
    event.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  };

  return (
    <div ref={panelRef} className="tiptap-source-panel">
      <div ref={gutterRef} className="tiptap-source-gutter" aria-hidden="true">
        {lineNumbers.map((line) => (
          <div key={line} className="tiptap-source-gutter-line">
            {line}
          </div>
        ))}
      </div>
      <div className="tiptap-source-code">
        <pre ref={highlightRef} className="tiptap-source-highlight" aria-hidden="true">
          <code className="language-xml" dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
        </pre>
        <textarea
          ref={textareaRef}
          className="tiptap-source-editor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          aria-label="HTML 소스 코드"
        />
      </div>
    </div>
  );
}
