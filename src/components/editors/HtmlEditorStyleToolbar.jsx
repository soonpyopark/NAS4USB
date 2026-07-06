import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyHtmlBlockStylePreset,
  applyHtmlDocumentFontFamily,
  DEFAULT_HTML_FONT_FAMILY,
  findHtmlFontOptionLabel,
  HTML_FONT_OPTIONS,
} from '../../lib/tiptap/htmlEditorStyles.js';

/**
 * @param {object} props
 * @param {import('@tiptap/core').Editor} props.editor
 * @param {boolean} props.disabled
 */
export default function HtmlEditorStyleToolbar({ editor, disabled }) {
  const menuRef = useRef(null);
  const [selectedFont, setSelectedFont] = useState(DEFAULT_HTML_FONT_FAMILY);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);

  const selectedFontLabel = useMemo(() => findHtmlFontOptionLabel(selectedFont), [selectedFont]);

  useEffect(() => {
    if (!fontMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setFontMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [fontMenuOpen]);

  const applyFont = (fontFamily) => {
    setSelectedFont(fontFamily);
    applyHtmlDocumentFontFamily(editor, fontFamily);
    setFontMenuOpen(false);
  };

  const applyPreset = (preset) => {
    applyHtmlBlockStylePreset(editor, preset);
  };

  return (
    <>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <div ref={menuRef} className="relative">
        <button
          type="button"
          className="tiptap-toolbar-btn max-w-[11rem] truncate"
          disabled={disabled}
          title="문서 전체 텍스트에 폰트 적용"
          onClick={() => setFontMenuOpen((open) => !open)}
        >
          폰트적용(기본: {selectedFontLabel})
        </button>
        {fontMenuOpen && !disabled && (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {HTML_FONT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${
                  option.value === selectedFont ? 'font-medium text-nas-accent' : 'text-slate-700'
                }`}
                style={{ fontFamily: option.value }}
                onClick={() => applyFont(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="제목 — 14pt, 진하게 (커서가 있는 줄)"
        onClick={() => applyPreset('title')}
      >
        제목(14pt, B)
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="본문 — 13pt, 보통 (커서가 있는 줄)"
        onClick={() => applyPreset('body')}
      >
        본문(13pt)
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="본문1 — 13pt, 좌여백 2타 (커서가 있는 줄)"
        onClick={() => applyPreset('body1')}
      >
        본문1(13pt, 2타)
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="본문2 — 13pt, 좌여백 4타 (커서가 있는 줄)"
        onClick={() => applyPreset('body2')}
      >
        본문2(13pt, 4타)
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="표제목 — 12pt, 진하게 (커서가 있는 표 셀)"
        onClick={() => applyPreset('tableHeader')}
      >
        표제목(12pt, B)
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn"
        disabled={disabled}
        title="표내용 — 12pt, 보통 (커서가 있는 표 셀)"
        onClick={() => applyPreset('tableCell')}
      >
        표내용(12pt)
      </button>
    </>
  );
}
