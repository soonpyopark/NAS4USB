import { BubbleMenu } from '@tiptap/react/menus';
import {
  IconBold,
  IconCode,
  IconHighlight,
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
 * }} props
 */
export default function TipTapBubbleMenus({ editor, readOnly = false, onEditLink }) {
  if (!editor || readOnly) return null;

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
      <button
        type="button"
        title="하이라이트"
        aria-label="하이라이트"
        className={editor.isActive('highlight') ? 'is-active' : ''}
        onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
      >
        <IconHighlight />
      </button>
      <button
        type="button"
        title="링크"
        aria-label="링크"
        className={editor.isActive('link') ? 'is-active' : ''}
        onClick={setLink}
      >
        <IconLink />
      </button>
    </BubbleMenu>
  );
}
