import { applyDeltaToString, computeTextDiff } from '../textDiff.js';

const LOCAL_ORIGIN = Symbol('educowork-local-editor');
const SEED_ORIGIN = 'seed';

/**
 * @param {unknown} result
 * @returns {Promise<void>}
 */
async function awaitSetTextResult(result) {
  if (result && typeof result.then === 'function') {
    await result;
  }
}

/**
 * Generic Y.Text ↔ text editor binding with incremental delta sync.
 *
 * @param {import('yjs').Doc} ydoc
 * @param {{ getText: () => string, setText: (text: string, origin?: string) => void | Promise<void>, onChange: (cb: (text: string, origin?: string) => void) => () => void }} editor
 * @param {{ fieldName?: string, initialText?: string, synced?: boolean, deferSeedUntilSync?: boolean }} [options]
 */
export function bindTextEditor(
  ydoc,
  editor,
  { fieldName = 'content', initialText = '', synced = true, deferSeedUntilSync = false } = {},
) {
  const ytext = ydoc.getText(fieldName);
  const meta = ydoc.getMap('meta');
  const useFullReplace = fieldName === 'documentBase64';
  let applyingRemote = false;
  let localText = editor.getText();

  const applyRemoteText = async (nextText) => {
    if (nextText === localText) return;

    applyingRemote = true;
    try {
      await awaitSetTextResult(editor.setText(nextText, 'yjs'));
      localText = nextText;
    } catch (error) {
      console.warn(`[sync] remote apply failed (${fieldName})`, error);
    } finally {
      applyingRemote = false;
    }
  };

  const pushLocalText = (text) => {
    ydoc.transact(() => {
      if (useFullReplace) {
        if (ytext.length > 0) {
          ytext.delete(0, ytext.length);
        }
        if (text) {
          ytext.insert(0, text);
        }
        return;
      }

      const diff = computeTextDiff(localText, text);
      if (diff.delete > 0) {
        ytext.delete(diff.retain, diff.delete);
      }
      if (diff.insert) {
        ytext.insert(diff.retain, diff.insert);
      }
    }, LOCAL_ORIGIN);
  };

  const seedFromFile = () => {
    if (!initialText) return;

    ydoc.transact(() => {
      if (meta.get(`${fieldName}:seeded`)) return;
      if (ytext.length === 0) {
        ytext.insert(0, initialText);
      }
      meta.set(`${fieldName}:seeded`, true);
    }, SEED_ORIGIN);
  };

  const bootstrapFromYjs = () => {
    if (ytext.length > 0) {
      void applyRemoteText(ytext.toString());
      return;
    }

    seedFromFile();

    if (ytext.length > 0) {
      void applyRemoteText(ytext.toString());
      return;
    }

    if (initialText && editor.getText() !== initialText) {
      void applyRemoteText(initialText);
    }
  };

  if (deferSeedUntilSync) {
    if (initialText && editor.getText() !== initialText) {
      void applyRemoteText(initialText);
    }
  } else {
    bootstrapFromYjs();
  }

  const unobserveEditor = editor.onChange((text, origin) => {
    if (origin === 'yjs' || applyingRemote) return;
    if (text === localText) return;

    pushLocalText(text);
    localText = text;
  });

  const observeYText = (event) => {
    if (event.transaction.origin === LOCAL_ORIGIN || event.transaction.origin === SEED_ORIGIN) {
      return;
    }

    const nextText = applyDeltaToString(localText, event.delta);
    if (nextText === localText) return;

    void applyRemoteText(nextText);
  };

  ytext.observe(observeYText);

  return {
    resync() {
      bootstrapFromYjs();
    },

    destroy() {
      unobserveEditor();
      ytext.unobserve(observeYText);
    },
  };
}

/**
 * @param {import('yjs').Doc} ydoc
 * @param {string} [fieldName]
 */
export function getSharedText(ydoc, fieldName = 'content') {
  return ydoc.getText(fieldName);
}
