import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const tiptapSearchKey = new PluginKey('tiptapSearch');

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {string} query
 * @param {boolean} caseSensitive
 */
export function collectSearchMatches(doc, query, caseSensitive) {
  const needle = String(query ?? '');
  if (!needle) return [];

  const lookFor = caseSensitive ? needle : needle.toLowerCase();
  /** @type {{ from: number, to: number }[]} */
  const results = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const hay = caseSensitive ? node.textContent : node.textContent.toLowerCase();
    let offset = 0;
    while (offset < hay.length) {
      const index = hay.indexOf(lookFor, offset);
      if (index < 0) break;
      const from = pos + 1 + index;
      results.push({ from, to: from + needle.length });
      offset = index + Math.max(1, needle.length);
    }
    return false;
  });

  return results;
}

/**
 * @param {import('@tiptap/pm/state').EditorState} state
 */
export function getTiptapSearchState(state) {
  return (
    tiptapSearchKey.getState(state) ?? {
      query: '',
      caseSensitive: false,
      results: [],
      index: 0,
    }
  );
}

/**
 * @param {{ from: number, to: number }[]} results
 * @param {number} index
 */
function decorationsForResults(results, index) {
  return results.map((result, resultIndex) =>
    Decoration.inline(result.from, result.to, {
      class:
        resultIndex === index
          ? 'tiptap-search-hit tiptap-search-hit--active'
          : 'tiptap-search-hit',
    }),
  );
}

/**
 * In-document find for the live TipTap editor.
 */
export function createTiptapSearchExtension() {
  return Extension.create({
    name: 'tiptapSearch',

    addCommands() {
      return {
        setSearchQuery:
          (query, options = {}) =>
          ({ tr, dispatch }) => {
            if (dispatch) {
              dispatch(
                tr.setMeta(tiptapSearchKey, {
                  type: 'query',
                  query: String(query ?? ''),
                  caseSensitive: Boolean(options.caseSensitive),
                }),
              );
            }
            return true;
          },
        goToSearchResult:
          (direction) =>
          ({ tr, dispatch, state, view }) => {
            const pluginState = getTiptapSearchState(state);
            if (!pluginState.results.length) return false;
            const count = pluginState.results.length;
            const nextIndex =
              direction === 0
                ? pluginState.index
                : direction < 0
                  ? (pluginState.index - 1 + count) % count
                  : (pluginState.index + 1) % count;
            const match = pluginState.results[nextIndex];
            if (!match || !dispatch) return Boolean(match);
            // Do not setSelection / focus the editor — Enter would insert a newline.
            dispatch(tr.setMeta(tiptapSearchKey, { type: 'index', index: nextIndex }));
            queueMicrotask(() => {
              const hit = view?.dom?.querySelector?.('.tiptap-search-hit--active');
              hit?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            });
            return true;
          },
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: tiptapSearchKey,
          state: {
            init: () => ({
              query: '',
              caseSensitive: false,
              results: [],
              index: 0,
              decorations: DecorationSet.empty,
            }),
            apply(tr, prev, _oldState, newState) {
              const meta = tr.getMeta(tiptapSearchKey);
              let query = prev.query;
              let caseSensitive = prev.caseSensitive;
              let index = prev.index;
              let results = prev.results;

              if (meta?.type === 'query') {
                query = String(meta.query ?? '');
                caseSensitive = Boolean(meta.caseSensitive);
                index = 0;
              } else if (meta?.type === 'index') {
                index = Number(meta.index) || 0;
              }

              if (meta || tr.docChanged) {
                results = collectSearchMatches(newState.doc, query, caseSensitive);
                if (results.length === 0) index = 0;
                else index = Math.min(Math.max(0, index), results.length - 1);
              }

              return {
                query,
                caseSensitive,
                results,
                index,
                decorations: DecorationSet.create(
                  newState.doc,
                  decorationsForResults(results, index),
                ),
              };
            },
          },
          props: {
            decorations(state) {
              return this.getState(state)?.decorations ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
