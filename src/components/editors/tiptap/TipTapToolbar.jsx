import { useTiptapEditorTick } from '../../../hooks/useTiptapEditorTick.js';
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
  IconBold,
  IconClearFormat,
  IconCode,
  IconDetails,
  IconHorizontalRule,
  IconImage,
  IconInvisibleChars,
  IconItalic,
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
  IconRedo,
  IconStrike,
  IconSubscript,
  IconSuperscript,
  IconToc,
  IconUnderline,
  IconUndo,
  IconYoutube,
} from './TipTapIcons.jsx';

const FONT_FAMILIES = [
  { label: 'Aa', value: '' },
  { label: 'Sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'ui-serif, Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
];

const FONT_SIZES = [
  { label: 'Size', value: '' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '32', value: '32px' },
];

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
 *   onToggleToc?: () => void,
 *   emojiOpenRequest?: number,
 *   onUploadImage?: () => void,
 *   onUploadVideo?: () => void,
 *   onUploadAudio?: () => void,
 *   onUploadFile?: () => void,
 * }} props
 */
export default function TipTapToolbar({
  editor,
  readOnly = false,
  tocOpen = false,
  onToggleToc,
  emojiOpenRequest = 0,
  onUploadImage,
  onUploadVideo,
  onUploadAudio,
  onUploadFile,
}) {
  useTiptapEditorTick(editor);

  if (!editor) return null;

  const disabled = readOnly || !editor.isEditable;
  const chars = editor.storage.characterCount?.characters?.() ?? 0;
  const words = editor.storage.characterCount?.words?.() ?? 0;
  const textColor = editor.getAttributes('textStyle').color || '';
  const highlightColor =
    editor.getAttributes('highlight').color || (editor.isActive('highlight') ? '#fef08a' : '');
  const invisiblesVisible = Boolean(editor.storage.invisibleCharacters?.visibility?.());

  const setLink = () => {
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

  return (
    <div className="tiptap-toolbar" role="toolbar" aria-label="TipTap 서식">
      <div className="tiptap-toolbar__row">
        <ToolbarGroup>
          <ToolbarButton
            title="실행 취소 (Ctrl+Z)"
            disabled={disabled || !editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <IconUndo />
          </ToolbarButton>
          <ToolbarButton
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={disabled || !editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
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
            <option value="code">{'</>'}</option>
          </select>
        </ToolbarGroup>

        <ToolbarGroup>
          <select
            className="tiptap-toolbar__select"
            disabled={disabled}
            title="글꼴"
            aria-label="글꼴"
            value={editor.getAttributes('textStyle').fontFamily || ''}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
          >
            {FONT_FAMILIES.map((item) => (
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
            value={editor.getAttributes('textStyle').fontSize || ''}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) editor.chain().focus().unsetFontSize().run();
              else editor.chain().focus().setFontSize(value).run();
            }}
          >
            {FONT_SIZES.map((item) => (
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
            title="목차 패널"
            active={tocOpen}
            disabled={false}
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
        <span className="tiptap-toolbar__hint">
          `/` 블록 · `:` 이모지 · `$…$` 수식 · 표 안 Tab 이동
        </span>
      </div>
    </div>
  );
}

function ToolbarGroup({ children }) {
  return <div className="tiptap-toolbar__group">{children}</div>;
}

function ToolbarButton({ children, active = false, disabled = false, title, onClick }) {
  return (
    <button
      type="button"
      className={`tiptap-toolbar__btn${active ? ' is-active' : ''}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
