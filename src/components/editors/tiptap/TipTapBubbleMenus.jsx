import { BubbleMenu } from '@tiptap/react/menus';
import { useTiptapEditorTick } from '../../../hooks/useTiptapEditorTick.js';
import {
  TIPTAP_HIGHLIGHT_COLORS,
  TIPTAP_TEXT_COLORS,
} from '../../../lib/tiptap/colorPalettes.js';
import TipTapColorSwatchPicker from './TipTapColorSwatchPicker.jsx';
import {
  IconBold,
  IconCode,
  IconCopyLink,
  IconItalic,
  IconLink,
  IconStrike,
  IconUnderline,
} from './TipTapIcons.jsx';

/**
 * Text-selection bubble only (tiptap.dev style).
 * Table / empty-line floating bubbles are intentionally omitted —
 * table tools live in the toolbar; block insert uses "/" and the "+" handle.
 *
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   readOnly?: boolean,
 *   onUploadImage?: () => void,
 *   onEditLink?: () => void,
 *   onCopyBlockLink?: () => void,
 * }} props
 */
export default function TipTapBubbleMenus({ editor, readOnly = false, onEditLink, onCopyBlockLink }) {
  useTiptapEditorTick(editor);
  if (!editor || readOnly) return null;

  const textColor = editor.getAttributes('textStyle').color || '';
  const highlightColor =
    editor.getAttributes('highlight').color || (editor.isActive('highlight') ? '#fef08a' : '');

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

  return (
    <BubbleMenu
      editor={editor}
      className="tiptap-bubble-menu"
      options={{ placement: 'top' }}
      shouldShow={({ editor: current, state }) => {
        const { selection } = state;
        if (!current.isEditable) return false;
        if (selection.empty) return false;
        if (current.isActive('codeBlock')) return false;
        if (current.isActive('table')) return false;
        if (current.isActive('image')) return false;
        if (current.isActive('video')) return false;
        if (current.isActive('audio')) return false;
        if (current.isActive('fileAttachment')) return false;
        return true;
      }}
    >
      <button
        type="button"
        title="굵게"
        aria-label="굵게"
        className={editor.isActive('bold') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <IconBold />
      </button>
      <button
        type="button"
        title="기울임"
        aria-label="기울임"
        className={editor.isActive('italic') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <IconItalic />
      </button>
      <button
        type="button"
        title="밑줄"
        aria-label="밑줄"
        className={editor.isActive('underline') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <IconUnderline />
      </button>
      <button
        type="button"
        title="취소선"
        aria-label="취소선"
        className={editor.isActive('strike') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <IconStrike />
      </button>
      <button
        type="button"
        title="인라인 코드"
        aria-label="인라인 코드"
        className={editor.isActive('code') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <IconCode />
      </button>
      <TipTapColorSwatchPicker
        title="글자 색"
        mode="text"
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
        value={highlightColor}
        colors={TIPTAP_HIGHLIGHT_COLORS}
        onChange={(next) => {
          if (!next) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().toggleHighlight({ color: next }).run();
        }}
      />
      <button
        type="button"
        title="링크"
        aria-label="링크"
        className={editor.isActive('link') ? 'is-active' : ''}
        onClick={setLink}
      >
        <IconLink />
      </button>
      <button
        type="button"
        title="이곳 링크 복사"
        aria-label="이곳 링크 복사"
        onClick={() => onCopyBlockLink?.()}
      >
        <IconCopyLink />
      </button>
    </BubbleMenu>
  );
}
