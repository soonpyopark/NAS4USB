import { mergeAttributes } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { DecorationSet } from '@tiptap/pm/view';
import { columnResizing, ResizeState, tableEditing } from '@tiptap/pm/tables';
import { createFullWidthResizePlugin, safeColumnResizeMouseDown } from './tableFullWidthResize.js';
import { createLastAutoColGroupSpec, Nas4usbTableView } from './tableView.js';

/**
 * TableMap.get / colCount throw on irregular tables. After 「표 너비 100%」
 * those exceptions fire from hover decorations and freeze the renderer.
 *
 * @param {import('@tiptap/pm/state').Plugin} plugin
 * @param {string} label
 */
function guardPluginViewProps(plugin, label) {
  const origDecorations = plugin.props.decorations;
  if (typeof origDecorations === 'function') {
    plugin.props.decorations = function decorations(state) {
      try {
        return origDecorations.call(this, state);
      } catch (error) {
        console.warn(`[tiptap] ${label} decorations failed`, error);
        return DecorationSet.empty;
      }
    };
  }

  const origEvents = plugin.props.handleDOMEvents;
  if (origEvents) {
    /** @type {typeof origEvents} */
    const nextEvents = { ...origEvents };
    for (const [name, handler] of Object.entries(origEvents)) {
      if (typeof handler !== 'function') continue;
      nextEvents[name] = (view, event) => {
        try {
          return handler(view, event);
        } catch (error) {
          console.warn(`[tiptap] ${label} ${name} failed`, error);
          return false;
        }
      };
    }
    plugin.props.handleDOMEvents = nextEvents;
  }

  return plugin;
}

/**
 * @param {import('@tiptap/pm/state').Plugin} plugin
 * @param {number} cellMinWidth
 */
function guardColumnResizingPlugin(plugin, cellMinWidth) {
  guardPluginViewProps(plugin, 'table resize');

  const origApply = plugin.spec.state?.apply;
  if (typeof origApply === 'function') {
    plugin.spec.state.apply = function apply(tr, prev, oldState, newState) {
      try {
        return origApply.call(this, tr, prev, oldState, newState);
      } catch (error) {
        console.warn('[tiptap] table resize state failed', error);
        return prev instanceof ResizeState ? prev : new ResizeState(-1, false);
      }
    };
  }

  const events = plugin.props.handleDOMEvents || {};
  events.mousedown = (view, event) => {
    try {
      return safeColumnResizeMouseDown(view, event, cellMinWidth);
    } catch (error) {
      console.warn('[tiptap] table mousedown failed', error);
      return false;
    }
  };
  plugin.props.handleDOMEvents = events;

  return plugin;
}

/**
 * @param {import('@tiptap/pm/state').Plugin} plugin
 */
function guardTableEditingPlugin(plugin) {
  guardPluginViewProps(plugin, 'table editing');
  const origAppend = plugin.spec.appendTransaction;
  if (typeof origAppend === 'function') {
    plugin.spec.appendTransaction = function appendTransaction(...args) {
      try {
        return origAppend.apply(this, args);
      } catch (error) {
        console.warn('[tiptap] tableEditing appendTransaction failed', error);
        return null;
      }
    };
  }
  return plugin;
}

function parseTableFullWidth(element) {
  const table =
    element instanceof HTMLElement && element.tagName === 'TABLE'
      ? element
      : element instanceof HTMLElement
        ? element.querySelector('table')
        : null;
  const target = table || element;
  if (!(target instanceof HTMLElement)) return false;
  return target.getAttribute('data-full-width') === 'true';
}

/**
 * OneNote uses `background: rgb(...)` shorthand; some DOMs leave
 * `style.backgroundColor` empty until computed.
 * @param {HTMLElement} element
 */
function parseCellBackground(element) {
  const fromAttr = element.getAttribute('data-background-color');
  if (fromAttr) return fromAttr;
  if (element.style.backgroundColor) return element.style.backgroundColor;
  if (element.style.background && !/url\(|gradient/i.test(element.style.background)) {
    return element.style.background;
  }
  const style = element.getAttribute('style') || '';
  const match = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
  const value = match?.[1]?.trim();
  if (value && !/url\(|gradient/i.test(value)) return value;
  return null;
}

/**
 * TableCell / TableHeader with cell background + horizontal align.
 */
export const TiptapTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: parseCellBackground,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

export const TiptapTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: parseCellBackground,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

export const TiptapTableRow = TableRow;

/**
 * Table with column resizing always registered when `resizable` is true.
 * TipTap's default skips columnResizing while `!editable`, so sync/read-only
 * bootstrap would permanently lose resize handles after setEditable(true).
 */
export const TiptapTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fullWidth: {
        default: false,
        parseHTML: parseTableFullWidth,
        renderHTML: (attributes) =>
          attributes.fullWidth ? { 'data-full-width': 'true' } : {},
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const colgroup = createLastAutoColGroupSpec(node);
    const table = [
      'table',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: 'width: 100%; table-layout: fixed;',
      }),
      colgroup,
      ['tbody', 0],
    ];
    return this.options.renderWrapper ? ['div', { class: 'tableWrapper' }, table] : table;
  },
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable;
    return [
      ...(isResizable
        ? [
            guardColumnResizingPlugin(
              columnResizing({
                handleWidth: this.options.handleWidth,
                cellMinWidth: this.options.cellMinWidth,
                defaultCellMinWidth: this.options.cellMinWidth,
                View: this.options.View,
                lastColumnResizable: this.options.lastColumnResizable,
              }),
              this.options.cellMinWidth,
            ),
            createFullWidthResizePlugin(this.options.cellMinWidth),
          ]
        : []),
      guardTableEditingPlugin(
        tableEditing({
          allowTableNodeSelection: this.options.allowTableNodeSelection,
        }),
      ),
    ];
  },
});

/** @returns {import('@tiptap/core').Extensions} */
export function createTiptapTableExtensions() {
  return [
    TiptapTable.configure({
      resizable: true,
      allowTableNodeSelection: true,
      lastColumnResizable: true,
      cellMinWidth: 80,
      renderWrapper: true,
      View: Nas4usbTableView,
      HTMLAttributes: { class: 'tiptap-table' },
    }),
    TiptapTableRow,
    TiptapTableHeader,
    TiptapTableCell,
  ];
}
