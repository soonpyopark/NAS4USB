import { TextSelection } from '@tiptap/pm/state';

const BOOLEAN_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript'];
const COPYABLE_MARKS = [...BOOLEAN_MARKS, 'highlight', 'textStyle'];
const TEXT_STYLE_KEYS = ['color', 'fontFamily', 'fontSize', 'lineHeight', 'backgroundColor'];
const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'];

/**
 * @typedef {{
 *   type: 'heading' | 'paragraph',
 *   level?: number,
 * }} FormatBlockSnapshot
 *
 * @typedef {{
 *   booleanMarks: string[],
 *   textStyle: Record<string, string>,
 *   highlightColor: string,
 *   textAlign: string,
 *   block: FormatBlockSnapshot | null,
 * }} FormatSnapshot
 */

/**
 * @param {import('@tiptap/core').Editor} editor
 * @returns {FormatSnapshot}
 */
export function snapshotFormat(editor) {
  const booleanMarks = BOOLEAN_MARKS.filter((name) => editor.isActive(name));
  const attrs = editor.getAttributes('textStyle') || {};
  /** @type {Record<string, string>} */
  const textStyle = {};
  for (const key of TEXT_STYLE_KEYS) {
    const value = attrs[key];
    if (typeof value === 'string' && value.trim()) textStyle[key] = value.trim();
  }

  let highlightColor = '';
  if (editor.isActive('highlight')) {
    const color = editor.getAttributes('highlight').color;
    highlightColor = typeof color === 'string' && color.trim() ? color.trim() : '#fef08a';
  }

  let textAlign = '';
  for (const align of TEXT_ALIGNS) {
    if (editor.isActive({ textAlign: align })) {
      textAlign = align;
      break;
    }
  }

  /** @type {FormatBlockSnapshot | null} */
  let block = null;
  if (editor.isActive('heading')) {
    const level = Number(editor.getAttributes('heading').level);
    if (Number.isInteger(level) && level >= 1 && level <= 6) {
      block = { type: 'heading', level };
    }
  } else if (editor.isActive('paragraph')) {
    block = { type: 'paragraph' };
  }

  return { booleanMarks, textStyle, highlightColor, textAlign, block };
}

/**
 * @param {import('@tiptap/core').Editor} editor
 */
export function expandCollapsedToWord(editor) {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty || !(selection instanceof TextSelection)) return;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return;

  const text = $from.parent.textContent;
  const offset = $from.parentOffset;
  const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);
  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;
  if (start === end) return;

  const base = $from.start();
  editor.commands.setTextSelection({ from: base + start, to: base + end });
}

/**
 * Replace copyable marks / alignment on the current selection.
 *
 * @param {import('@tiptap/core').Editor} editor
 * @param {FormatSnapshot} snapshot
 */
export function applyFormat(editor, snapshot) {
  if (!editor || !snapshot || !editor.isEditable) return;
  if (!(editor.state.selection instanceof TextSelection)) return;

  if (editor.state.selection.empty) expandCollapsedToWord(editor);

  let chain = editor.chain().focus();
  if (snapshot.block?.type === 'heading' && snapshot.block.level) {
    chain = chain.setHeading({ level: snapshot.block.level });
  } else if (snapshot.block?.type === 'paragraph') {
    chain = chain.setParagraph();
  }

  for (const name of COPYABLE_MARKS) {
    if (typeof chain.unsetMark === 'function') chain = chain.unsetMark(name);
  }

  for (const name of snapshot.booleanMarks) {
    if (name === 'bold') chain = chain.setBold();
    else if (name === 'italic') chain = chain.setItalic();
    else if (name === 'underline') chain = chain.setUnderline();
    else if (name === 'strike') chain = chain.setStrike();
    else if (name === 'code') chain = chain.setCode();
    else if (name === 'subscript') chain = chain.setSubscript();
    else if (name === 'superscript') chain = chain.setSuperscript();
  }

  if (snapshot.highlightColor) {
    chain = chain.setHighlight({ color: snapshot.highlightColor });
  }

  const style = snapshot.textStyle;
  if (style.color) chain = chain.setColor(style.color);
  if (style.fontFamily) chain = chain.setFontFamily(style.fontFamily);
  if (style.fontSize) chain = chain.setFontSize(style.fontSize);
  if (style.lineHeight) chain = chain.setLineHeight(style.lineHeight);
  if (style.backgroundColor && typeof chain.setBackgroundColor === 'function') {
    chain = chain.setBackgroundColor(style.backgroundColor);
  }

  if (snapshot.textAlign) chain = chain.setTextAlign(snapshot.textAlign);
  else if (typeof chain.unsetTextAlign === 'function') chain = chain.unsetTextAlign();

  chain.run();
}
