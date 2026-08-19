import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { isChangeOrigin } from '@tiptap/extension-collaboration';

const INDENT_STEP_PX = 24;
const INDENT_MAX = 8;
const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem']);
const INDENT_BLOCK_TYPES = new Set(['paragraph', 'heading']);
const indentTransferKey = new PluginKey('nas4usbListIndentTransfer');

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

function isNestedListItem($pos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (depth === $pos.depth) continue;
    if (LIST_ITEM_TYPES.has($pos.node(depth).type.name)) return true;
  }
  return false;
}

/**
 * Map a document position through a run of transactions. `null` if it was deleted.
 * @param {import('@tiptap/pm/state').Transaction[]} transactions
 * @param {number} pos
 */
function mapThroughTransactions(transactions, pos) {
  let current = pos;
  for (const transaction of transactions) {
    const result = transaction.mapping.mapResult(current, 1);
    if (result.deleted) return null;
    current = result.pos;
  }
  return current;
}

/**
 * Keep list markers with the indented text: paragraph indent becomes list-item indent
 * (and the reverse when the list is turned off). Nested items drop the extra indent
 * so sink/lift nesting is not applied twice.
 *
 * @param {import('@tiptap/pm/state').EditorState} oldState
 * @param {import('@tiptap/pm/state').EditorState} newState
 * @param {import('@tiptap/pm/state').Transaction[]} transactions
 * @returns {import('@tiptap/pm/state').Transaction | null}
 */
export function applyListIndentTransfers(oldState, newState, transactions) {
  const tr = newState.tr;
  let changed = false;

  newState.doc.descendants((node, pos) => {
    if (!LIST_ITEM_TYPES.has(node.type.name)) return;
    const first = node.firstChild;
    const childIndent = first && INDENT_BLOCK_TYPES.has(first.type.name) ? Number(first.attrs.indent) || 0 : 0;
    if (childIndent > 0) {
      const itemIndent = Number(node.attrs.indent) || 0;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        indent: Math.min(INDENT_MAX, itemIndent + childIndent),
      });
      tr.setNodeMarkup(pos + 1, undefined, { ...first.attrs, indent: 0 });
      changed = true;
    }
  });

  const afterWrap = changed ? tr.doc : newState.doc;
  afterWrap.descendants((node, pos) => {
    if (!LIST_ITEM_TYPES.has(node.type.name)) return;
    if ((Number(node.attrs.indent) || 0) <= 0) return;
    if (!isNestedListItem(afterWrap.resolve(pos))) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: 0 });
    changed = true;
  });

  const released = [];
  oldState.doc.descendants((node, pos) => {
    if (!LIST_ITEM_TYPES.has(node.type.name)) return;
    const itemIndent = Number(node.attrs.indent) || 0;
    if (itemIndent <= 0) return;
    const first = node.firstChild;
    if (!first || !INDENT_BLOCK_TYPES.has(first.type.name)) return;
    released.push({
      indent: itemIndent,
      id: first.attrs.id || null,
      mapped: mapThroughTransactions(transactions, pos + 1),
    });
  });

  const liveDoc = changed ? tr.doc : newState.doc;
  const takeRelease = (node, pos) => {
    if (!INDENT_BLOCK_TYPES.has(node.type.name)) return;
    if (LIST_ITEM_TYPES.has(liveDoc.resolve(pos).parent.type.name)) return;
    if ((Number(node.attrs.indent) || 0) > 0) return;
    const index = released.findIndex(
      (entry) => (entry.id && entry.id === node.attrs.id) || entry.mapped === pos,
    );
    if (index < 0) return;
    const { indent } = released.splice(index, 1)[0];
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      indent: Math.min(INDENT_MAX, indent),
    });
    changed = true;
  };
  liveDoc.descendants(takeRelease);

  return changed ? tr : null;
}

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
      listTypes: ['listItem', 'taskItem'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: [...this.options.types, ...this.options.listTypes],
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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: indentTransferKey,
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          if (transactions.some((transaction) => isChangeOrigin(transaction))) return null;
          const next = applyListIndentTransfers(oldState, newState, transactions);
          return next;
        },
      }),
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
