const LOCAL_ORIGIN = Symbol('nas4usb-local-fortune-sheet');
const DISK_SNAPSHOT_ORIGIN = Symbol('nas4usb-disk-snapshot');

/**
 * @param {import('yjs').Map<string, unknown>} meta
 */
function getSnapshotDiskRevision(meta) {
  const value = meta.get('workbook:diskRevision');
  return typeof value === 'string' ? value : '';
}

/**
 * @param {import('yjs').Map<string, unknown>} meta
 * @param {string | undefined} diskRevision
 */
function shouldPreferDiskSheets(meta, diskRevision) {
  if (!diskRevision) return false;
  const snapshotRevision = getSnapshotDiskRevision(meta);
  if (!snapshotRevision) return false;
  return diskRevision > snapshotRevision;
}

/**
 * @param {unknown} value
 * @returns {value is import('@fortune-sheet/core').Sheet[]}
 */
function isFortuneSheetArray(value) {
  return (
    Array.isArray(value)
    && value.length > 0
    && value.every((sheet) => sheet && typeof sheet === 'object' && typeof sheet.name === 'string')
  );
}

/**
 * @param {{
 *   updateSheets: (sheets: import('@fortune-sheet/core').Sheet[]) => void,
 * }} editor
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {import('@fortune-sheet/core').Sheet[]} fallback
 */
function applySheetsSafely(editor, sheets, fallback) {
  const primary = isFortuneSheetArray(sheets) ? sheets : null;
  const secondary = isFortuneSheetArray(fallback) ? fallback : null;
  const target = primary ?? secondary;
  if (!target) return;

  try {
    editor.updateSheets(target);
  } catch {
    if (secondary && target !== secondary) {
      editor.updateSheets(secondary);
    }
  }
}

/**
 * @param {import('yjs').Doc} ydoc
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ diskRevision?: string }} [options]
 */
export function setWorkbookSnapshot(ydoc, sheets, { diskRevision } = {}) {
  if (!isFortuneSheetArray(sheets)) return;

  const snapshotMap = getWorkbookSnapshotMap(ydoc);
  const meta = ydoc.getMap('meta');

  try {
    ydoc.transact(() => {
      snapshotMap.set('sheets', JSON.stringify(sheets));
      if (diskRevision) {
        meta.set('workbook:diskRevision', diskRevision);
      }
    }, DISK_SNAPSHOT_ORIGIN);
  } catch {
    // Ignore snapshots that cannot be serialized.
  }
}

/**
 * @param {import('yjs').Doc} ydoc
 */
export function getWorkbookSnapshotMap(ydoc) {
  return ydoc.getMap('workbook');
}

/**
 * @param {import('yjs').Doc} ydoc
 */
export function getOpsArray(ydoc) {
  return ydoc.getArray('ops');
}

/**
 * @param {{
 *   getSheets: () => import('@fortune-sheet/core').Sheet[],
 *   updateSheets: (sheets: import('@fortune-sheet/core').Sheet[]) => void,
 *   applyOp: (ops: import('@fortune-sheet/core').Op[]) => void,
 *   onOp: (callback: (ops: import('@fortune-sheet/core').Op[]) => void) => () => void,
 *   getMountElement?: () => HTMLElement | null,
 * }} editor
 * @param {import('yjs').Doc} ydoc
 * @param {{
 *   initialSheets?: import('@fortune-sheet/core').Sheet[],
 *   provider?: import('y-websocket').WebsocketProvider,
 *   diskRevision?: string,
 * }} [options]
 */
export function bindFortuneSheetEditor(
  ydoc,
  editor,
  { initialSheets = [], provider, diskRevision = '' } = {},
) {
  const snapshotMap = getWorkbookSnapshotMap(ydoc);
  const yops = getOpsArray(ydoc);
  const meta = ydoc.getMap('meta');
  let applyingRemote = false;
  let appliedOpCount = 0;

  const applyRemoteBatch = (ops) => {
    if (!Array.isArray(ops) || ops.length === 0) return;
    applyingRemote = true;
    try {
      editor.applyOp(ops);
    } finally {
      applyingRemote = false;
    }
  };

  const replayRemoteOps = (fromIndex = 0) => {
    for (let index = fromIndex; index < yops.length; index += 1) {
      const raw = yops.get(index);
      if (typeof raw !== 'string' || raw === '') continue;
      try {
        applyRemoteBatch(JSON.parse(raw));
      } catch {
        // ignore malformed batches
      }
    }
    appliedOpCount = yops.length;
  };

  const seedSnapshotIfEmpty = () => {
    if (snapshotMap.get('sheets') || !isFortuneSheetArray(initialSheets)) return;

    try {
      ydoc.transact(() => {
        if (snapshotMap.get('sheets')) return;
        snapshotMap.set('sheets', JSON.stringify(initialSheets));
        meta.set('workbook:seeded', true);
        if (diskRevision) {
          meta.set('workbook:diskRevision', diskRevision);
        }
      }, 'seed');
    } catch {
      // Ignore invalid seed payloads.
    }
  };

  const bootstrapFromYjs = () => {
    if (shouldPreferDiskSheets(meta, diskRevision)) {
      applySheetsSafely(editor, initialSheets, initialSheets);
      setWorkbookSnapshot(ydoc, initialSheets, { diskRevision });
    } else {
      const snapshotRaw = snapshotMap.get('sheets');
      if (typeof snapshotRaw === 'string' && snapshotRaw) {
        try {
          const snapshotSheets = JSON.parse(snapshotRaw);
          if (isFortuneSheetArray(snapshotSheets)) {
            applySheetsSafely(editor, snapshotSheets, initialSheets);
          } else {
            applySheetsSafely(editor, initialSheets, initialSheets);
            setWorkbookSnapshot(ydoc, initialSheets, { diskRevision });
          }
        } catch {
          applySheetsSafely(editor, initialSheets, initialSheets);
          setWorkbookSnapshot(ydoc, initialSheets, { diskRevision });
        }
      } else {
        applySheetsSafely(editor, initialSheets, initialSheets);
        seedSnapshotIfEmpty();
      }
    }

    replayRemoteOps(0);
  };

  const resyncFromYjs = () => {
    if (shouldPreferDiskSheets(meta, diskRevision)) {
      applySheetsSafely(editor, initialSheets, initialSheets);
      setWorkbookSnapshot(ydoc, initialSheets, { diskRevision });
      replayRemoteOps(0);
      return;
    }

    replayRemoteOps(appliedOpCount);
  };

  let cancelBootstrap = () => {};
  const runBootstrap = () => {
    bootstrapFromYjs();
  };

  if (typeof editor.getMountElement === 'function' && !editor.getMountElement()) {
    const raf = window.requestAnimationFrame(runBootstrap);
    cancelBootstrap = () => window.cancelAnimationFrame(raf);
  } else {
    runBootstrap();
  }

  const pushLocalOps = (ops) => {
    if (!Array.isArray(ops) || ops.length === 0) return;

    ydoc.transact(() => {
      yops.push([JSON.stringify(ops)]);
    }, LOCAL_ORIGIN);

    appliedOpCount = yops.length;
  };

  const unobserveEditor = editor.onOp((ops) => {
    if (applyingRemote) return;
    pushLocalOps(ops);
  });

  const observeOps = (event) => {
    if (event.transaction.origin === LOCAL_ORIGIN) return;
    replayRemoteOps(appliedOpCount);
  };

  yops.observe(observeOps);

  const binder = {
    resync() {
      resyncFromYjs();
    },
    destroy() {
      cancelBootstrap?.();
      unobserveEditor();
      yops.unobserve(observeOps);
    },
  };

  if (provider) {
    const onSync = (isSynced) => {
      if (isSynced) binder.resync();
    };
    provider.on('sync', onSync);
    return () => {
      cancelBootstrap?.();
      provider.off('sync', onSync);
      binder.destroy();
    };
  }

  return () => {
    cancelBootstrap?.();
    binder.destroy();
  };
}

/** @deprecated Use bindFortuneSheetEditor */
export const bindSpreadsheetEditor = bindFortuneSheetEditor;

/** @deprecated Use bindFortuneSheetEditor */
export const bindTinySheetEditor = bindFortuneSheetEditor;

/** @deprecated Legacy cell map helper */
export function getCellMap(ydoc) {
  return ydoc.getMap('cells');
}

/** @deprecated Legacy cell map helper */
export function mapToCells(ycells) {
  /** @type {Record<string, string>} */
  const cells = {};
  ycells.forEach((value, key) => {
    cells[key] = value == null ? '' : String(value);
  });
  return cells;
}
