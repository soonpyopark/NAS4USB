import { applyDeltaToString, computeTextDiff } from '../textDiff.js';

const LOCAL_ORIGIN = Symbol('educowork-local-editor');
const SEED_ORIGIN = 'seed';

/**
 * Y.js room에 파일 내용이 반복 누적된 경우(열 때마다 2배) 파일 기준으로 복구합니다.
 * @param {string} remoteText
 * @param {string} fileText
 */
function repairAgainstFile(remoteText, fileText) {
  if (!fileText || !remoteText || remoteText === fileText) return remoteText;
  if (!remoteText.startsWith(fileText)) return remoteText;

  let rest = remoteText;
  let repeats = 0;
  while (rest.startsWith(fileText)) {
    repeats += 1;
    rest = rest.slice(fileText.length);
  }

  return rest.length === 0 && repeats > 1 ? fileText : remoteText;
}

/**
 * @param {import('yjs').Text} ytext
 * @param {string} nextText
 */
function replaceYText(ytext, nextText) {
  if (ytext.length > 0) {
    ytext.delete(0, ytext.length);
  }
  if (nextText) {
    ytext.insert(0, nextText);
  }
}

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
  let hasBootstrapped = false;
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
    if (!initialText || meta.get(`${fieldName}:seeded`)) return;

    ydoc.transact(() => {
      if (meta.get(`${fieldName}:seeded`) || ytext.length > 0) return;
      ytext.insert(0, initialText);
      meta.set(`${fieldName}:seeded`, true);
    }, SEED_ORIGIN);
  };

  const normalizeRemoteText = (remoteText) => repairAgainstFile(remoteText, initialText);

  const repairRemoteYText = (remoteText) => {
    const repaired = normalizeRemoteText(remoteText);
    if (repaired === remoteText) return repaired;

    ydoc.transact(() => {
      replaceYText(ytext, repaired);
    }, SEED_ORIGIN);

    return repaired;
  };

  const bootstrapFromYjs = () => {
    if (ytext.length > 0) {
      const remoteText = repairRemoteYText(ytext.toString());
      meta.set(`${fieldName}:seeded`, true);
      void applyRemoteText(remoteText);
      return;
    }

    seedFromFile();

    const seededText = ytext.length > 0 ? ytext.toString() : initialText;
    if (seededText) {
      void applyRemoteText(seededText);
    }
  };

  const syncFromYjs = () => {
    if (!hasBootstrapped) {
      hasBootstrapped = true;
      bootstrapFromYjs();
      return;
    }

    if (ytext.length === 0) return;

    void applyRemoteText(repairRemoteYText(ytext.toString()));
  };

  if (deferSeedUntilSync) {
    localText = editor.getText();
  } else {
    hasBootstrapped = true;
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
      syncFromYjs();
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
