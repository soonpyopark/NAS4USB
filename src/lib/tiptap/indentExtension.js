import { Extension } from '@tiptap/core';

const INDENT_STEP_PX = 24;
const INDENT_MAX = 8;

/**
 * @param {string | null | undefined} value
 * @returns {number}
 */
export function cssLengthToPx(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return 0;
  const match = raw.match(/^(-?[\d.]+)\s*(px|pt|em|rem|in|cm|mm)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const unit = (match[2] || 'px').toLowerCase();
  switch (unit) {
    case 'pt':
      return amount * (96 / 72);
    case 'in':
      return amount * 96;
    case 'cm':
      return amount * (96 / 2.54);
    case 'mm':
      return amount * (96 / 25.4);
    case 'em':
    case 'rem':
      return amount * 16;
    default:
      return amount;
  }
}

/**
 * @param {number} px
 */
function pxToIndentLevel(px) {
  if (!Number.isFinite(px) || px <= 0) return 0;
  return Math.min(INDENT_MAX, Math.max(0, Math.round(px / INDENT_STEP_PX)));
}

/**
 * @param {HTMLElement} element
 */
function parseIndentLevel(element) {
  const data = element.getAttribute('data-indent');
  if (data != null && data !== '') {
    const level = Number.parseInt(data, 10);
    if (Number.isFinite(level) && level > 0) return Math.min(INDENT_MAX, level);
  }
  return pxToIndentLevel(cssLengthToPx(element.style?.marginLeft));
}

/**
 * @param {import('@tiptap/core').Editor} editor
 */
function isInTable(editor) {
  return editor.isActive('table');
}

/**
 * @param {import('@tiptap/core').Editor} editor
 */
function isInList(editor) {
  return editor.isActive('listItem') || editor.isActive('taskItem');
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {import('@tiptap/core').SingleCommands} commands
 * @param {number} delta
 */
function applyParagraphIndent(editor, commands, delta) {
  const indentExt = editor.extensionManager.extensions.find((ext) => ext.name === 'indent');
  const allowed = new Set(indentExt?.options?.types ?? ['paragraph', 'heading']);

  return commands.command(({ tr, state }) => {
    let changed = false;
    const { from, to } = state.selection;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!allowed.has(node.type.name)) return;
      const current = Number(node.attrs.indent) || 0;
      const next = Math.min(INDENT_MAX, Math.max(0, current + delta));
      if (next === current) return;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
      changed = true;
    });
    return changed;
  });
}

/**
 * Paragraph / heading indent without list markers.
 * Lists still nest via sink/lift; Tab in tables stays cell navigation.
 */
export const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: parseIndentLevel,
            renderHTML: (attributes) => {
              const level = Number(attributes.indent) || 0;
              if (level <= 0) return {};
              return {
                'data-indent': String(level),
                style: `margin-left: ${level * INDENT_STEP_PX}px`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem')) return commands.sinkListItem('listItem');
          if (editor.isActive('taskItem')) return commands.sinkListItem('taskItem');
          return applyParagraphIndent(editor, commands, 1);
        },
      outdent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem')) return commands.liftListItem('listItem');
          if (editor.isActive('taskItem')) return commands.liftListItem('taskItem');
          return applyParagraphIndent(editor, commands, -1);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (isInTable(this.editor) || this.editor.isActive('codeBlock') || isInList(this.editor)) {
          return false;
        }
        return this.editor.commands.indent();
      },
      'Shift-Tab': () => {
        if (isInTable(this.editor) || this.editor.isActive('codeBlock') || isInList(this.editor)) {
          return false;
        }
        return this.editor.commands.outdent();
      },
    };
  },
});
