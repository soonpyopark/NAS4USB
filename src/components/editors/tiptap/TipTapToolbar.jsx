import { useEffect, useState } from 'react';
import { detectTouchUi, useTouchUi } from '../../../hooks/useTouchUi.js';
import { useTiptapEditorTick } from '../../../hooks/useTiptapEditorTick.js';
import { useTiptapFormatPainter } from '../../../hooks/useTiptapFormatPainter.js';
import TipTapTableInsertPicker from './TipTapTableInsertPicker.jsx';
import TipTapTableControls from './TipTapTableControls.jsx';
import TipTapColorSwatchPicker from './TipTapColorSwatchPicker.jsx';
import TipTapEmojiPicker from './TipTapEmojiPicker.jsx';
import {
  TIPTAP_HIGHLIGHT_COLORS,
  TIPTAP_TEXT_COLORS,
} from '../../../lib/tiptap/colorPalettes.js';
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconIndent,
  IconOutdent,
  IconBold,
  IconClearFormat,
  IconFormatPainter,
  IconCode,
  IconDetails,
  IconHorizontalRule,
  IconHtml,
  IconImage,
  IconInvisibleChars,
  IconItalic,
  IconCopyLink,
  IconLink,
  IconAudio,
  IconMarkdown,
  IconMath,
  IconPaperclip,
  IconVideo,
  IconListBullet,
  IconListOrdered,
  IconListTodo,
  IconQuote,
  IconPullQuote,
  IconRedo,
  IconSearch,
  IconStrike,
  IconSubscript,
  IconSuperscript,
  IconToc,
  IconUnderline,
  IconUndo,
  IconYoutube,
} from './TipTapIcons.jsx';

const FONT_FAMILIES = [
  { label: '맑은 고딕', value: '' },
  { label: 'Sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'ui-serif, Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
];

const FONT_SIZES = [
  { label: '크기', value: '' },
  { label: '8pt', value: '8pt' },
  { label: '9pt', value: '9pt' },
  { label: '10pt', value: '10pt' },
  { label: '11pt', value: '11pt' },
  { label: '12pt', value: '12pt' },
  { label: '14pt', value: '14pt' },
  { label: '16pt', value: '16pt' },
  { label: '18pt', value: '18pt' },
  { label: '20pt', value: '20pt' },
  { label: '22pt', value: '22pt' },
  { label: '24pt', value: '24pt' },
  { label: '28pt', value: '28pt' },
  { label: '36pt', value: '36pt' },
];

/**
 * @param {string | null | undefined} raw
 */
function toPtFontSize(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const pt = value.match(/^([\d.]+)\s*pt$/i);
  if (pt) return `${Number(pt[1])}pt`;
  const px = value.match(/^([\d.]+)\s*px$/i);
  if (px) return `${Math.round((Number(px[1]) * 72) / 96)}pt`;
  return value;
}

/**
 * @param {string | null | undefined} raw
 */
function fontFamilySelectValue(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/malgun gothic|맑은 고딕/i.test(value)) return '';
  const match = FONT_FAMILIES.find((item) => item.value && item.value === value);
  return match ? match.value : value;
}

const LINE_HEIGHTS = [
  { label: 'LH', value: '' },
  { label: '1', value: '1' },
  { label: '1.2', value: '1.2' },
  { label: '1.5', value: '1.5' },
  { label: '1.8', value: '1.8' },
  { label: '2', value: '2' },
];

/**
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   readOnly?: boolean,
 *   tocOpen?: boolean,
 *   tocAvailable?: boolean,
 *   onToggleToc?: () => void,
 *   searchOpen?: boolean,
 *   onToggleSearch?: () => void,
 *   emojiOpenRequest?: number,
 *   onUploadImage?: () => void,
 *   onUploadVideo?: () => void,
 *   onUploadAudio?: () => void,
 *   onUploadFile?: () => void,
 *   zoom?: number,
 *   onZoomIn?: () => void,
 *   onZoomOut?: () => void,
 *   onZoomReset?: () => void,
 *   htmlMode?: boolean,
 *   onToggleHtml?: () => void,
 *   onEditLink?: () => void,
 *   onCopyBlockLink?: () => void,
 * }} props
 */
export default function TipTapToolbar({
  editor,
  readOnly = false,
  tocOpen = false,
  tocAvailable = false,
  onToggleToc,
  searchOpen = false,
  onToggleSearch,
  emojiOpenRequest = 0,
  onUploadImage,
  onUploadVideo,
  onUploadAudio,
  onUploadFile,
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  htmlMode = false,
  onToggleHtml,
  onEditLink,
  onCopyBlockLink,
}) {
  useTiptapEditorTick(editor);
  const touchUi = useTouchUi();
  const [formatOpen, setFormatOpen] = useState(() => !detectTouchUi());
  const disabled = !editor || readOnly || !editor.isEditable || htmlMode;
  const formatPainter = useTiptapFormatPainter(editor, disabled);

  useEffect(() => {
    if (touchUi) setFormatOpen(false);
  }, [touchUi]);

  if (!editor) return null;
  const chars = editor.storage.characterCount?.characters?.() ?? 0;
  const words = editor.storage.characterCount?.words?.() ?? 0;
  const textColor = editor.getAttributes('textStyle').color || '';
  const highlightColor =
    editor.getAttributes('highlight').color || (editor.isActive('highlight') ? '#fef08a' : '');
  const invisiblesVisible = Boolean(editor.storage.invisibleCharacters?.visibility?.());
  const currentFontFamily = fontFamilySelectValue(editor.getAttributes('textStyle').fontFamily);
  const currentFontSize = toPtFontSize(editor.getAttributes('textStyle').fontSize);
  const fontFamilyOptions =
    currentFontFamily && !FONT_FAMILIES.some((item) => item.value === currentFontFamily)
      ? [...FONT_FAMILIES, { label: currentFontFamily, value: currentFontFamily }]
      : FONT_FAMILIES;
  const fontSizeOptions =
    currentFontSize && !FONT_SIZES.some((item) => item.value === currentFontSize)
      ? [...FONT_SIZES, { label: currentFontSize, value: currentFontSize }]
      : FONT_SIZES;

  const setLink = () => {
    if (onEditLink) {
      onEditLink();
      return;
    }
    const previous = editor.getAttributes('link').href;
    const next = window.prompt('링크 URL', previous || 'https://');
    if (next === null) return;
    if (!next) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: next }).run();
  };

  const insertYoutube = () => {
    const src = window.prompt('YouTube URL', 'https://www.youtube.com/watch?v=');
    if (!src) return;
    editor.chain().focus().setYoutubeVideo({ src }).run();
  };

  const insertInlineMath = () => {
    const latex = window.prompt('인라인 수식 (LaTeX)', 'E = mc^2');
    if (latex == null || !String(latex).trim()) return;
    editor.chain().focus().insertInlineMath({ latex: String(latex).trim() }).run();
  };

  const insertBlockMath = () => {
    const latex = window.prompt('블록 수식 (LaTeX)', '\\int_0^1 x^2\\,dx');
    if (latex == null || !String(latex).trim()) return;
    editor.chain().focus().insertBlockMath({ latex: String(latex).trim() }).run();
  };

  const copyMarkdown = async () => {
    try {
      const md = editor.getMarkdown?.() ?? '';
      await navigator.clipboard.writeText(md);
      window.alert('Markdown을 클립보드에 복사했습니다.');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Markdown 복사에 실패했습니다.');
    }
  };

  const showFullFormat = !touchUi || formatOpen;

  return (
    <div className="tiptap-toolbar" role="toolbar" aria-label="TipTap 서식">
      {touchUi ? (
        <div className="tiptap-toolbar__row tiptap-toolbar__row--chrome">
          <ToolbarGroup>
            <ToolbarButton
              title={formatOpen ? '서식 접기' : '서식 펼치기'}
              active={formatOpen}
              onClick={() => setFormatOpen((value) => !value)}
            >
              서식
            </ToolbarButton>
            {!formatOpen ? (
              <>
                <ToolbarButton
                  title="실행 취소 (Ctrl+Z)"
                  disabled={disabled || typeof editor.commands.undo !== 'function' || !editor.can().undo()}
                  onClick={() => editor.commands.undo?.()}
                >
                  <IconUndo />
                </ToolbarButton>
                <ToolbarButton
                  title="다시 실행 (Ctrl+Shift+Z)"
                  disabled={disabled || typeof editor.commands.redo !== 'function' || !editor.can().redo()}
                  onClick={() => editor.commands.redo?.()}
                >
                  <IconRedo />
                </ToolbarButton>
                {tocAvailable ? (
                  <ToolbarButton title="목차 패널" active={tocOpen} onClick={() => onToggleToc?.()}>
                    <IconToc />
                  </ToolbarButton>
                ) : null}
                <ToolbarButton title="본문 검색 (Ctrl+F)" active={searchOpen} onClick={() => onToggleSearch?.()}>
                  <IconSearch />
                </ToolbarButton>
              </>
            ) : null}
          </ToolbarGroup>
          {!formatOpen ? (
            <TipTapZoomControls
              zoom={zoom}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onZoomReset={onZoomReset}
            />
          ) : null}
        </div>
      ) : null}
      {showFullFormat ? (
      <>
      <div className="tiptap-toolbar__row">
        <ToolbarGroup>
          <ToolbarButton
            title="실행 취소 (Ctrl+Z)"
            disabled={disabled || typeof editor.commands.undo !== 'function' || !editor.can().undo()}
            onClick={() => editor.commands.undo?.()}
          >
            <IconUndo />
          </ToolbarButton>
          <ToolbarButton
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={disabled || typeof editor.commands.redo !== 'function' || !editor.can().redo()}
            onClick={() => editor.commands.redo?.()}
          >
            <IconRedo />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <select
            className="tiptap-toolbar__select"
            disabled={disabled}
            title="블록 유형"
            aria-label="블록 유형"
            value={
              editor.isActive('heading', { level: 1 })
                ? 'h1'
                : editor.isActive('heading', { level: 2 })
                  ? 'h2'
                  : editor.isActive('heading', { level: 3 })
                    ? 'h3'
                    : editor.isActive('heading', { level: 4 })
                      ? 'h4'
                      : editor.isActive('heading', { level: 5 })
                        ? 'h5'
                        : editor.isActive('heading', { level: 6 })
                          ? 'h6'
                          : editor.isActive('codeBlock')
                            ? 'code'
                            : editor.isActive('pullQuote')
                              ? 'pullQuote'
                              : editor.isActive('blockquote')
                                ? 'quote'
                                : 'p'
            }
            onChange={(event) => {
              const value = event.target.value;
              const chain = editor.chain().focus();
              if (value === 'p') chain.setParagraph().run();
              else if (value.startsWith('h')) chain.setHeading({ level: Number(value.slice(1)) }).run();
              else if (value === 'code') chain.toggleCodeBlock().run();
              else if (value === 'quote') chain.toggleBlockquote().run();
              else if (value === 'pullQuote') chain.togglePullQuote().run();
            }}
          >
            <option value="p">Aa</option>
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
            <option value="h4">H4</option>
            <option value="h5">H5</option>
            <option value="h6">H6</option>
            <option value="quote">❝</option>
            <option value="pullQuote">“</option>
            <option value="code">{'</>'}</option>
          </select>
        </ToolbarGroup>

        <ToolbarGroup>
          <select
            className="tiptap-toolbar__select"
            disabled={disabled}
            title="글꼴"
            aria-label="글꼴"
            value={currentFontFamily}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
          >
            {fontFamilyOptions.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="tiptap-toolbar__select tiptap-toolbar__select--narrow"
            disabled={disabled}
            title="글자 크기"
            aria-label="글자 크기"
            value={currentFontSize}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) editor.chain().focus().unsetFontSize().run();
              else editor.chain().focus().setFontSize(value).run();
            }}
          >
            {fontSizeOptions.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="tiptap-toolbar__select tiptap-toolbar__select--narrow"
            disabled={disabled}
            title="줄 간격"
            aria-label="줄 간격"
            value={editor.getAttributes('textStyle').lineHeight || ''}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) editor.chain().focus().unsetLineHeight().run();
              else editor.chain().focus().setLineHeight(value).run();
            }}
          >
            {LINE_HEIGHTS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            title="굵게 (Ctrl+B)"
            active={editor.isActive('bold')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <IconBold />
          </ToolbarButton>
          <ToolbarButton
            title="기울임 (Ctrl+I)"
            active={editor.isActive('italic')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <IconItalic />
          </ToolbarButton>
          <ToolbarButton
            title="밑줄 (Ctrl+U)"
            active={editor.isActive('underline')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <IconUnderline />
          </ToolbarButton>
          <ToolbarButton
            title="취소선"
            active={editor.isActive('strike')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <IconStrike />
          </ToolbarButton>
          <ToolbarButton
            title="인라인 코드"
            active={editor.isActive('code')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <IconCode />
          </ToolbarButton>
          <ToolbarButton
            title="아래 첨자"
            active={editor.isActive('subscript')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
          >
            <IconSubscript />
          </ToolbarButton>
          <ToolbarButton
            title="위 첨자"
            active={editor.isActive('superscript')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
          >
            <IconSuperscript />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <TipTapColorSwatchPicker
            title="글자 색"
            mode="text"
            disabled={disabled}
            value={textColor}
            colors={TIPTAP_TEXT_COLORS}
            onChange={(next) => {
              if (!next) editor.chain().focus().unsetColor().run();
              else editor.chain().focus().setColor(next).run();
            }}
          />
          <TipTapColorSwatchPicker
            title="하이라이트"
            mode="highlight"
            disabled={disabled}
            value={highlightColor}
            colors={TIPTAP_HIGHLIGHT_COLORS}
            onChange={(next) => {
              if (!next) editor.chain().focus().unsetHighlight().run();
              else editor.chain().focus().toggleHighlight({ color: next }).run();
            }}
          />
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            title="왼쪽 정렬"
            active={editor.isActive({ textAlign: 'left' })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <IconAlignLeft />
          </ToolbarButton>
          <ToolbarButton
            title="가운데 정렬"
            active={editor.isActive({ textAlign: 'center' })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <IconAlignCenter />
          </ToolbarButton>
          <ToolbarButton
            title="오른쪽 정렬"
            active={editor.isActive({ textAlign: 'right' })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <IconAlignRight />
          </ToolbarButton>
          <ToolbarButton
            title="양쪽 정렬"
            active={editor.isActive({ textAlign: 'justify' })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          >
            <IconAlignJustify />
          </ToolbarButton>
          <ToolbarButton
            title="내어쓰기 (Shift+Tab)"
            disabled={disabled}
            onClick={() => editor.chain().focus().outdent().run()}
          >
            <IconOutdent />
          </ToolbarButton>
          <ToolbarButton
            title="들여쓰기 (Tab)"
            disabled={disabled}
            onClick={() => editor.chain().focus().indent().run()}
          >
            <IconIndent />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton
            title="글머리 기호 목록"
            active={editor.isActive('bulletList')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <IconListBullet />
          </ToolbarButton>
          <ToolbarButton
            title="번호 목록"
            active={editor.isActive('orderedList')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <IconListOrdered />
          </ToolbarButton>
          <ToolbarButton
            title="할 일 목록"
            active={editor.isActive('taskList')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <IconListTodo />
          </ToolbarButton>
          <ToolbarButton
            title="인용"
            active={editor.isActive('blockquote')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <IconQuote />
          </ToolbarButton>
          <ToolbarButton
            title="강조 인용"
            active={editor.isActive('pullQuote')}
            disabled={disabled}
            onClick={() => editor.chain().focus().togglePullQuote().run()}
          >
            <IconPullQuote />
          </ToolbarButton>
          <ToolbarButton
            title="토글 (Details)"
            active={editor.isActive('details')}
            disabled={disabled}
            onClick={() => editor.chain().focus().setDetails().run()}
          >
            <IconDetails />
          </ToolbarButton>
          <ToolbarButton
            title="구분선"
            disabled={disabled}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <IconHorizontalRule />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton title="링크" active={editor.isActive('link')} disabled={disabled} onClick={setLink}>
            <IconLink />
          </ToolbarButton>
          <ToolbarButton
            title="이곳 링크 복사"
            disabled={disabled}
            onClick={() => onCopyBlockLink?.()}
          >
            <IconCopyLink />
          </ToolbarButton>
          <TipTapEmojiPicker editor={editor} disabled={disabled} openRequest={emojiOpenRequest} />
          <ToolbarButton title="이미지 업로드" disabled={disabled} onClick={() => onUploadImage?.()}>
            <IconImage />
          </ToolbarButton>
          <ToolbarButton title="영상 첨부" disabled={disabled} onClick={() => onUploadVideo?.()}>
            <IconVideo />
          </ToolbarButton>
          <ToolbarButton title="오디오 첨부" disabled={disabled} onClick={() => onUploadAudio?.()}>
            <IconAudio />
          </ToolbarButton>
          <ToolbarButton title="파일 첨부" disabled={disabled} onClick={() => onUploadFile?.()}>
            <IconPaperclip />
          </ToolbarButton>
          <ToolbarButton title="YouTube 삽입" disabled={disabled} onClick={insertYoutube}>
            <IconYoutube />
          </ToolbarButton>
          <ToolbarButton title="인라인 수식" disabled={disabled} onClick={insertInlineMath}>
            <IconMath />
          </ToolbarButton>
          <ToolbarButton title="블록 수식" disabled={disabled} onClick={insertBlockMath}>
            <span className="tiptap-toolbar__math-block" aria-hidden="true">
              ∑
            </span>
          </ToolbarButton>
          <TipTapTableInsertPicker
            disabled={disabled}
            onInsert={(rows, cols) => {
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
            }}
          />
          <ToolbarButton
            title="본문 검색 (Ctrl+F)"
            active={searchOpen}
            disabled={false}
            onClick={() => onToggleSearch?.()}
          >
            <IconSearch />
          </ToolbarButton>
          <ToolbarButton
            title={tocAvailable ? '목차 패널' : '목차 패널 (창이 좁아 표시할 수 없음)'}
            active={tocOpen && tocAvailable}
            disabled={!tocAvailable}
            onClick={() => onToggleToc?.()}
          >
            <IconToc />
          </ToolbarButton>
          <ToolbarButton
            title="보이지 않는 문자 표시"
            active={invisiblesVisible}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleInvisibleCharacters().run()}
          >
            <IconInvisibleChars />
          </ToolbarButton>
          <ToolbarButton title="Markdown 복사" disabled={disabled} onClick={copyMarkdown}>
            <IconMarkdown />
          </ToolbarButton>
          <ToolbarButton
            title={htmlMode ? '서식 편집으로 돌아가기' : 'HTML 편집'}
            active={htmlMode}
            disabled={!editor || readOnly}
            onClick={() => onToggleHtml?.()}
          >
            <IconHtml />
          </ToolbarButton>
          <ToolbarButton
            title={
              formatPainter.mode === 'locked'
                ? '서식 연속 적용 중 — Esc 또는 다시 클릭하면 종료'
                : formatPainter.mode === 'once'
                  ? '서식 복사 중 — 적용할 텍스트를 선택하세요 (Esc 취소)'
                  : '서식 복사 — 클릭 후 칠하기, 더블클릭은 연속 (Ctrl+Shift+C / V)'
            }
            active={Boolean(formatPainter.mode)}
            extraClass={formatPainter.mode === 'locked' ? 'is-format-locked' : ''}
            disabled={disabled}
            onClick={formatPainter.onButtonClick}
            onDoubleClick={formatPainter.onButtonDoubleClick}
          >
            <IconFormatPainter />
          </ToolbarButton>
          <ToolbarButton
            title="서식 지우기"
            disabled={disabled}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <IconClearFormat />
          </ToolbarButton>
        </ToolbarGroup>
      </div>

      <TipTapTableControls editor={editor} disabled={disabled} />

      <div className="tiptap-toolbar__meta">
        <span>
          {chars.toLocaleString()}자 · {words.toLocaleString()}단어
        </span>
        <div className="tiptap-toolbar__meta-end">
          <TipTapZoomControls
            zoom={zoom}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
          />
          <span className="tiptap-toolbar__hint">
            {htmlMode
              ? 'HTML 편집 중 — 적용해야 문서에 반영됩니다'
              : '`/` 블록 · `:` 이모지 · `$…$` 수식 · Tab 들여쓰기 · 표 안 셀 이동'}
          </span>
        </div>
      </div>
      </>
      ) : null}
    </div>
  );
}

/**
 * View-only zoom controls (does not change document content).
 * @param {{
 *   zoom: number,
 *   onZoomIn?: () => void,
 *   onZoomOut?: () => void,
 *   onZoomReset?: () => void,
 * }} props
 */
export function TipTapZoomControls({ zoom, onZoomIn, onZoomOut, onZoomReset }) {
  const zoomPercent = Math.round(zoom * 100);
  return (
    <div className="tiptap-toolbar__zoom" role="group" aria-label="보기 배율">
      <button
        type="button"
        className="tiptap-toolbar__btn"
        disabled={zoom <= 0.5}
        title="축소 (Ctrl+-)"
        aria-label="축소"
        onClick={() => onZoomOut?.()}
      >
        −
      </button>
      <button
        type="button"
        className="tiptap-toolbar__btn tiptap-toolbar__zoom-label"
        title="실제 크기 100% (Ctrl+0)"
        aria-label={`현재 배율 ${zoomPercent}%`}
        onClick={() => onZoomReset?.()}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        className="tiptap-toolbar__btn"
        disabled={zoom >= 2}
        title="확대 (Ctrl+=)"
        aria-label="확대"
        onClick={() => onZoomIn?.()}
      >
        +
      </button>
    </div>
  );
}

function ToolbarGroup({ children }) {
  return <div className="tiptap-toolbar__group">{children}</div>;
}

function ToolbarButton({
  children,
  active = false,
  disabled = false,
  title,
  extraClass = '',
  onClick,
  onDoubleClick,
}) {
  return (
    <button
      type="button"
      className={`tiptap-toolbar__btn${active ? ' is-active' : ''}${extraClass ? ` ${extraClass}` : ''}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </button>
  );
}
