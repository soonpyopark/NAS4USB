/** @typedef {'title' | 'body' | 'body1' | 'body2' | 'tableHeader' | 'tableCell'} HtmlBlockStylePreset */

export const DEFAULT_HTML_FONT_FAMILY = '"Human Myeongjo", "휴먼명조", serif';

/** 한글 1타(전각 1글자) ≈ 1em */
export const HTML_BODY_INDENT_EM = {
  body1: 2,
  body2: 4,
};

export const HTML_FONT_OPTIONS = [
  { label: '휴먼명조', value: '"Human Myeongjo", "휴먼명조", serif' },
  { label: '맑은 고딕', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '바탕', value: 'Batang, "바탕", serif' },
  { label: '돋움', value: 'Dotum, "돋움", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
];

/** @type {Record<HtmlBlockStylePreset, Record<string, string>>} */
export const HTML_BLOCK_STYLE_PRESETS = {
  title: { 'font-size': '14pt', 'font-weight': '700', 'padding-left': '0' },
  body: { 'font-size': '13pt', 'font-weight': '400', 'padding-left': '0' },
  body1: {
    'font-size': '13pt',
    'font-weight': '400',
    'padding-left': `${HTML_BODY_INDENT_EM.body1}em`,
  },
  body2: {
    'font-size': '13pt',
    'font-weight': '400',
    'padding-left': `${HTML_BODY_INDENT_EM.body2}em`,
  },
  tableHeader: { 'font-size': '12pt', 'font-weight': '700' },
  tableCell: { 'font-size': '12pt', 'font-weight': '400' },
};

/**
 * @param {string | null | undefined} styleText
 */
export function parseInlineStyle(styleText) {
  /** @type {Record<string, string>} */
  const result = {};
  if (!styleText) return result;

  for (const part of styleText.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (key && value) result[key] = value;
  }

  return result;
}

/**
 * @param {Record<string, string>} styles
 */
export function serializeInlineStyle(styles) {
  return Object.entries(styles)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const prop = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      return `${prop}: ${value}`;
    })
    .join('; ');
}

/**
 * @param {string | null | undefined} existingStyle
 * @param {Record<string, string>} next
 */
export function mergeInlineStyle(existingStyle, next) {
  return serializeInlineStyle({
    ...parseInlineStyle(existingStyle),
    ...next,
  });
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {string[]} nodeNames
 * @param {Record<string, string>} stylePatch
 */
function applyStyleToFocusedBlock(editor, nodeNames, stylePatch) {
  editor
    .chain()
    .focus()
    .command(({ tr, state, dispatch }) => {
      const { $from } = state.selection;

      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (!nodeNames.includes(node.type.name)) continue;

        const pos = $from.before(depth);
        const style = mergeInlineStyle(node.attrs.style, stylePatch);
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          style: style || null,
        });
        if (dispatch) dispatch(tr);
        return true;
      }

      return false;
    })
    .run();
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {HtmlBlockStylePreset} preset
 */
export function applyHtmlBlockStylePreset(editor, preset) {
  const patch = HTML_BLOCK_STYLE_PRESETS[preset];
  if (preset === 'tableHeader' || preset === 'tableCell') {
    applyStyleToFocusedBlock(editor, ['tableHeader', 'tableCell'], patch);
    return;
  }
  applyStyleToFocusedBlock(editor, ['paragraph'], patch);
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {{ textAlign?: string, verticalAlign?: string }} alignment
 */
export function applyHtmlTableCellAlignment(editor, alignment) {
  /** @type {Record<string, string>} */
  const patch = {};
  if (alignment.textAlign) patch['text-align'] = alignment.textAlign;
  if (alignment.verticalAlign) patch['vertical-align'] = alignment.verticalAlign;
  if (Object.keys(patch).length === 0) return;
  applyStyleToFocusedBlock(editor, ['tableHeader', 'tableCell'], patch);
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {string} fontFamily
 */
export function applyHtmlDocumentFontFamily(editor, fontFamily) {
  editor
    .chain()
    .focus()
    .command(({ tr, state, dispatch }) => {
      state.doc.descendants((node, pos) => {
        if (!['paragraph', 'tableHeader', 'tableCell'].includes(node.type.name)) return;
        const style = mergeInlineStyle(node.attrs.style, { 'font-family': fontFamily });
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          style: style || null,
        });
      });
      if (dispatch) dispatch(tr);
      return true;
    })
    .run();
}

/**
 * @param {string} fontFamily
 */
export function findHtmlFontOptionLabel(fontFamily) {
  const match = HTML_FONT_OPTIONS.find((option) => option.value === fontFamily);
  return match?.label ?? '휴먼명조';
}
