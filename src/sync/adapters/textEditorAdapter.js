import { applyDeltaToString, computeTextDiff } from '../textDiff.js';

const LOCAL_ORIGIN = Symbol('educowork-local-editor');
const SEED_ORIGIN = 'seed';

/**
 * @param {import('yjs').Map<string, unknown>} meta
 * @param {string} fieldName
 */
function getSnapshotDiskRevision(meta, fieldName) {
  const value = meta.get(`${fieldName}:diskRevision`);
  return typeof value === 'string' ? value : '';
}

/**
 * @param {import('yjs').Map<string, unknown>} meta
 * @param {string} fieldName
 * @param {string | undefined} diskRevision
 */
function shouldPreferDiskContent(meta, fieldName, diskRevision) {
  if (!diskRevision) return false;
  const snapshotRevision = getSnapshotDiskRevision(meta, fieldName);
  if (!snapshotRevision) return false;
  return diskRevision > snapshotRevision;
}

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
 * @param {{ fieldName?: string, initialText?: string, synced?: boolean, deferSeedUntilSync?: boolean, diskRevision?: string, canonicalText?: (text: string) => string }} [options]
 */
export function bindTextEditor(
  ydoc,
  editor,
  { fieldName = 'content', initialText = '', synced = true, deferSeedUntilSync = false, diskRevision = '', canonicalText } = {},
) {
  const ytext = ydoc.getText(fieldName);
  const meta = ydoc.getMap('meta');
  const useFullReplace =
    fieldName === 'documentBase64' || fieldName === 'document';
  const normalizeForSync = canonicalText ?? ((text) => String(text ?? ''));
  let applyingRemote = false;
  let hasBootstrapped = false;
  let localText = normalizeForSync(editor.getText());
  /** @type {Promise<void>} */
  let remoteApplyQueue = Promise.resolve();

  const applyRemoteTextNow = async (nextText) => {
    if (useFullReplace) {
      nextText = ytext.toString();
    }
    nextText = normalizeForSync(nextText);
    if (nextText === localText) return;

    applyingRemote = true;
    try {
      await awaitSetTextResult(editor.setText(nextText, 'yjs'));
      localText = normalizeForSync(useFullReplace ? ytext.toString() : nextText);
    } catch (error) {
      console.warn(`[sync] remote apply failed (${fieldName})`, error);
    } finally {
      applyingRemote = false;
    }
  };

  const applyRemoteText = (nextText) => {
    remoteApplyQueue = remoteApplyQueue
      .catch(() => {})
      .then(() => applyRemoteTextNow(nextText));
    return remoteApplyQueue;
  };

  const pushLocalText = (text) => {
    const normalizedText = normalizeForSync(text);
    ydoc.transact(() => {
      if (useFullReplace) {
        if (ytext.length > 0) {
          ytext.delete(0, ytext.length);
        }
        if (normalizedText) {
          ytext.insert(0, normalizedText);
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
      if (diskRevision) {
        meta.set(`${fieldName}:diskRevision`, diskRevision);
      }
    }, SEED_ORIGIN);
  };

  const applyDiskSnapshot = () => {
    ydoc.transact(() => {
      replaceYText(ytext, initialText);
      meta.set(`${fieldName}:seeded`, true);
      if (diskRevision) {
        meta.set(`${fieldName}:diskRevision`, diskRevision);
      }
    }, SEED_ORIGIN);
    void applyRemoteText(initialText);
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
    if (shouldPreferDiskContent(meta, fieldName, diskRevision)) {
      applyDiskSnapshot();
      return;
    }

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

    if (shouldPreferDiskContent(meta, fieldName, diskRevision)) {
      applyDiskSnapshot();
      return;
    }

    void applyRemoteText(repairRemoteYText(ytext.toString()));
  };

  if (deferSeedUntilSync) {
    localText = normalizeForSync(editor.getText());
  } else {
    hasBootstrapped = true;
    bootstrapFromYjs();
  }

  const unobserveEditor = editor.onChange((text, origin) => {
    if (origin === 'yjs' || applyingRemote) return;

    const normalizedText = normalizeForSync(text);
    const normalizedYText = normalizeForSync(ytext.toString());

    if (normalizedText === localText) return;
    if (normalizedText === normalizedYText) {
      localText = normalizedYText;
      return;
    }

    pushLocalText(normalizedText);
    localText = normalizedText;
  });

  const observeYText = (event) => {
    if (event.transaction.origin === LOCAL_ORIGIN || event.transaction.origin === SEED_ORIGIN) {
      return;
    }

    if (useFullReplace) {
      void applyRemoteText(ytext.toString());
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

    async flushRemoteApply() {
      syncFromYjs();
      await remoteApplyQueue;
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

/**
 * @param {import('yjs').Doc} ydoc
 * @param {string} fieldName
 * @param {string} diskRevision
 */
export function setTextDiskRevision(ydoc, fieldName, diskRevision) {
  if (!diskRevision) return;
  ydoc.getMap('meta').set(`${fieldName}:diskRevision`, diskRevision);
}
