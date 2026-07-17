const LOCAL_ORIGIN = Symbol('nas4usb-local-fortune-sheet');
const DISK_SNAPSHOT_ORIGIN = Symbol('nas4usb-disk-snapshot');

const SNAPSHOT_FLUSH_MS = 400;

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
function shouldPreferDiskContent(meta, diskRevision) {
  if (!diskRevision) return false;
  const snapshotRevision = getSnapshotDiskRevision(meta);
  if (!snapshotRevision) return false;
  return diskRevision > snapshotRevision;
}

/**
 * @param {import('@fortune-sheet/core').Sheet[] | null | undefined} sheets
 */
function countSheetCells(sheets) {
  if (!Array.isArray(sheets)) return 0;
  let count = 0;
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    if (Array.isArray(sheet.celldata) && sheet.celldata.length > 0) {
      count += sheet.celldata.length;
      continue;
    }
    if (!Array.isArray(sheet.data)) continue;
    for (const row of sheet.data) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (cell != null) count += 1;
      }
    }
  }
  return count;
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
 * @param {import('yjs').Map<string, unknown>} snapshotMap
 * @returns {import('@fortune-sheet/core').Sheet[] | null}
 */
function readSnapshotSheets(snapshotMap) {
  const snapshotRaw = snapshotMap.get('sheets');
  if (typeof snapshotRaw !== 'string' || !snapshotRaw) return null;

  try {
    const parsed = JSON.parse(snapshotRaw);
    return isFortuneSheetArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  let snapshotFlushTimer = null;

  const flushSnapshot = () => {
    snapshotFlushTimer = null;
    try {
      const sheets = editor.getSheets();
      if (!isFortuneSheetArray(sheets)) return;
      ydoc.transact(() => {
        snapshotMap.set('sheets', JSON.stringify(sheets));
      }, LOCAL_ORIGIN);
    } catch {
      // Ignore snapshots that cannot be serialized.
    }
  };

  const scheduleSnapshotFlush = () => {
    if (snapshotFlushTimer) window.clearTimeout(snapshotFlushTimer);
    snapshotFlushTimer = window.setTimeout(flushSnapshot, SNAPSHOT_FLUSH_MS);
  };

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

  const writeDiskSnapshot = (sheets) => {
    if (!isFortuneSheetArray(sheets)) return;
    try {
      ydoc.transact(() => {
        snapshotMap.set('sheets', JSON.stringify(sheets));
        meta.set('workbook:seeded', true);
        if (diskRevision) {
          meta.set('workbook:diskRevision', diskRevision);
        }
      }, DISK_SNAPSHOT_ORIGIN);
    } catch {
      // Ignore snapshots that cannot be serialized.
    }
  };

  const seedSnapshotIfEmpty = () => {
    if (snapshotMap.get('sheets') || !isFortuneSheetArray(initialSheets)) return;
    writeDiskSnapshot(initialSheets);
  };

  const bootstrapFromYjs = () => {
    const snapshotSheets = readSnapshotSheets(snapshotMap);
    const diskCellCount = countSheetCells(initialSheets);
    const snapshotCellCount = countSheetCells(snapshotSheets);

    // Prefer newer disk content, or recover when the Yjs snapshot is empty but disk is not.
    if (
      isFortuneSheetArray(initialSheets)
      && diskCellCount > 0
      && (
        shouldPreferDiskContent(meta, diskRevision)
        || !snapshotSheets
        || snapshotCellCount === 0
      )
    ) {
      applySheetsSafely(editor, initialSheets, initialSheets);
      if (!snapshotSheets || snapshotCellCount === 0 || shouldPreferDiskContent(meta, diskRevision)) {
        writeDiskSnapshot(initialSheets);
      }
      appliedOpCount = yops.length;
      return;
    }

    if (snapshotSheets) {
      applySheetsSafely(editor, snapshotSheets, initialSheets);
    } else {
      applySheetsSafely(editor, initialSheets, initialSheets);
      seedSnapshotIfEmpty();
    }

    // The snapshot already reflects every op applied so far (each local/remote
    // op schedules a snapshot flush), so replaying the full ops log on top of it
    // would double-apply history and can corrupt sheets whose ids were
    // regenerated on this load. Only ops pushed *after* we bootstrap need to be
    // replayed, which `observeOps` handles going forward.
    appliedOpCount = yops.length;
  };

  const resyncFromYjs = () => {
    // Y.js ops + snapshot are the collaboration source of truth.
    // Never reload stale initialSheets from disk when another peer saved.
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
    scheduleSnapshotFlush();
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
      if (snapshotFlushTimer) {
        window.clearTimeout(snapshotFlushTimer);
        snapshotFlushTimer = null;
        flushSnapshot();
      }
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
      binder.destroy();
      provider.off('sync', onSync);
    };
  }

  return () => {
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

export { getSnapshotDiskRevision };
