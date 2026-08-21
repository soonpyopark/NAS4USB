import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

const pluginKey = new PluginKey('nas4usbCollabStability');
const COMPOSITION_RESUME_MS = 24;
const COMPOSITION_STALE_MS = 8000;

/**
 * Map a caret offset through a same-line text change (prefix/suffix diff).
 * @param {string} oldText
 * @param {string} newText
 * @param {number} offset
 */
export function mapOffsetThroughTextDiff(oldText, newText, offset) {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, oldText.length));
  if (oldText === newText) return safeOffset;

  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  if (safeOffset <= prefix) return safeOffset;
  if (safeOffset >= oldEnd) return newEnd + (safeOffset - oldEnd);

  const oldMid = oldEnd - prefix;
  const newMid = newEnd - prefix;
  if (oldMid <= 0) return Math.min(prefix + (safeOffset - prefix), newEnd);
  return prefix + Math.round(((safeOffset - prefix) * newMid) / oldMid);
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {number} pos
 */
function readTextblockCaret(doc, pos) {
  const max = doc.content.size;
  const safe = Math.max(0, Math.min(pos, max));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (!node?.isTextblock) continue;
    return {
      id: typeof node.attrs?.id === 'string' ? node.attrs.id : '',
      offset: safe - $pos.start(depth),
      text: node.textContent,
      from: safe,
    };
  }
  return { id: '', offset: safe, text: '', from: safe };
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {string} id
 */
function findTextblockById(doc, id) {
  if (!id) return null;
  let found = null;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (found) return false;
    if (node.isTextblock && node.attrs?.id === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {{ id?: string, offset?: number, text?: string, from?: number }} snapshot
 */
function caretPosInTextblock(found, oldText, offset) {
  const mapped = mapOffsetThroughTextDiff(oldText, found.node.textContent, offset);
  const start = found.pos + 1;
  return Math.max(start, Math.min(start + mapped, found.pos + found.node.nodeSize - 1));
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {{ id?: string, offset?: number, text?: string, from?: number }} snapshot
 */
function resolveCaretFromSnapshot(doc, snapshot) {
  if (!snapshot) return null;
  const offset = Number(snapshot.offset) || 0;
  const oldText = snapshot.text || '';
  const found = findTextblockById(doc, snapshot.id || '');
  if (found) return caretPosInTextblock(found, oldText, offset);

  const fallbackPos = Math.max(0, Math.min(Number(snapshot.from) || 0, doc.content.size));
  const $pos = doc.resolve(fallbackPos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.isTextblock) {
      return caretPosInTextblock({ node, pos: $pos.before(depth) }, oldText, offset);
    }
  }
  return fallbackPos;
}

function getBinding(state) {
  return ySyncPluginKey.getState(state)?.binding ?? null;
}

function pauseRemoteBinding(state) {
  const binding = getBinding(state);
  if (!binding?.type || typeof binding._observeFunction !== 'function' || binding._nas4usbPaused) {
    return;
  }
  binding.type.unobserveDeep(binding._observeFunction);
  binding._nas4usbPaused = true;
}

function resumeRemoteBinding(state) {
  const binding = getBinding(state);
  if (!binding?.type || !binding._nas4usbPaused) return;
  binding.type.observeDeep(binding._observeFunction);
  binding._nas4usbPaused = false;
  if (typeof binding._forceRerender === 'function') {
    binding._forceRerender();
  }
}

/**
 * Keep the local caret on the same paragraph/offset when a remote Y.js
 * update rewrites the ProseMirror doc, and pause those rewrites while IME
 * composition is in progress (한글 조합).
 */
export function createCollabStabilityExtension() {
  return Extension.create({
    name: 'nas4usbCollabStability',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          state: {
            init: (_, state) => ({
              snapshot: readTextblockCaret(state.doc, state.selection.head),
              holdScroll: false,
            }),
            apply(tr, value, _oldState, newState) {
              const remote = isChangeOrigin(tr);
              const holdScroll = remote || tr.getMeta(pluginKey)?.holdScroll === true;
              if (holdScroll) {
                return { ...value, holdScroll: true };
              }
              if (tr.selectionSet || tr.docChanged) {
                return {
                  snapshot: readTextblockCaret(newState.doc, newState.selection.head),
                  holdScroll: false,
                };
              }
              return { ...value, holdScroll: false };
            },
          },
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some((transaction) => isChangeOrigin(transaction))) {
              return null;
            }

            const snapshot = pluginKey.getState(oldState)?.snapshot;
            const nextPos = resolveCaretFromSnapshot(newState.doc, snapshot);
            if (nextPos == null) return null;
            if (newState.selection.head === nextPos && newState.selection.anchor === nextPos) {
              return null;
            }

            try {
              const selection = TextSelection.create(newState.doc, nextPos);
              return newState.tr.setSelection(selection).setMeta(pluginKey, { holdScroll: true });
            } catch {
              return null;
            }
          },
          props: {
            handleScrollToSelection(view) {
              return pluginKey.getState(view.state)?.holdScroll === true;
            },
            handleDOMEvents: {
              compositionstart(view) {
                const pluginState = pluginKey.getState(view.state);
                if (pluginState) pluginState.snapshot = readTextblockCaret(view.state.doc, view.state.selection.head);
                pauseRemoteBinding(view.state);
                return false;
              },
              compositionend(view) {
                window.setTimeout(() => {
                  if (view.isDestroyed || view.composing) return;
                  resumeRemoteBinding(view.state);
                }, COMPOSITION_RESUME_MS);
                return false;
              },
            },
          },
          view(view) {
            let staleTimer = 0;
            const ydoc = getBinding(view.state)?.doc ?? null;

            const capture = () => {
              const pluginState = pluginKey.getState(view.state);
              if (!pluginState) return;
              pluginState.snapshot = readTextblockCaret(view.state.doc, view.state.selection.head);
            };

            const onCompositionStart = () => {
              capture();
              pauseRemoteBinding(view.state);
              window.clearTimeout(staleTimer);
              staleTimer = window.setTimeout(() => {
                if (view.isDestroyed) return;
                resumeRemoteBinding(view.state);
              }, COMPOSITION_STALE_MS);
            };

            const onCompositionEnd = () => {
              window.clearTimeout(staleTimer);
              staleTimer = 0;
              window.setTimeout(() => {
                if (view.isDestroyed || view.composing) return;
                resumeRemoteBinding(view.state);
              }, COMPOSITION_RESUME_MS);
            };

            view.dom.addEventListener('compositionstart', onCompositionStart);
            view.dom.addEventListener('compositionend', onCompositionEnd);
            ydoc?.on('beforeAllTransactions', capture);

            return {
              destroy() {
                window.clearTimeout(staleTimer);
                view.dom.removeEventListener('compositionstart', onCompositionStart);
                view.dom.removeEventListener('compositionend', onCompositionEnd);
                ydoc?.off('beforeAllTransactions', capture);
                const binding = getBinding(view.state);
                if (binding?._nas4usbPaused) {
                  binding.type?.observeDeep(binding._observeFunction);
                  binding._nas4usbPaused = false;
                }
              },
            };
          },
        }),
      ];
    },
  });
}
