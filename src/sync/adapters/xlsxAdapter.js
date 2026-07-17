const LOCAL_ORIGIN = Symbol('nas4usb-local-fortune-sheet');
const DISK_SNAPSHOT_ORIGIN = Symbol('nas4usb-disk-snapshot');

const SNAPSHOT_FLUSH_MS = 400;

// FortuneSheet occasionally throws while applying a remote "addSheet"-style op (see
// ErrorBoundary recovery in XlsxEditorShell.jsx), which forces this peer to remount and
// re-bootstrap. If we bootstrap from the Yjs snapshot at that exact moment, the peer who
// pushed the op may not have flushed their own (debounced) snapshot yet — bootstrapping
// from a stale snapshot while marking the just-received op as "applied" silently drops
// that change for this peer forever. Waiting briefly for a fresher snapshot closes that
// race in the overwhelming majority of real-world (sub-second) sync latencies.
const SNAPSHOT_STALE_WAIT_MS = 2000;
const SNAPSHOT_OP_COUNT_KEY = 'workbook:snapshotOpCount';

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
  const yops = getOpsArray(ydoc);

  try {
    ydoc.transact(() => {
      snapshotMap.set('sheets', JSON.stringify(sheets));
      meta.set(SNAPSHOT_OP_COUNT_KEY, yops.length);
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
  let destroyed = false;

  const getSnapshotOpCount = () => {
    const value = meta.get(SNAPSHOT_OP_COUNT_KEY);
    return typeof value === 'number' ? value : null;
  };

  /**
   * Resolves once the snapshot's recorded op-count reaches `targetOpCount`, or after
   * `timeoutMs` elapses — whichever comes first. Resolves immediately if the snapshot
   * is already fresh enough, or if we've never seen a tracked op-count for this doc
   * (legacy/pre-existing docs written before this tracking existed) so we don't stall
   * every load of an older collaborative document.
   * @param {number} targetOpCount
   * @param {number} timeoutMs
   */
  const waitForFreshSnapshot = (targetOpCount, timeoutMs) => new Promise((resolve) => {
    const current = getSnapshotOpCount();
    if (current == null || current >= targetOpCount) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      meta.unobserve(onMetaChange);
      window.clearTimeout(timer);
      resolve();
    };
    function onMetaChange() {
      const next = getSnapshotOpCount();
      if (next != null && next >= targetOpCount) finish();
    }
    const timer = window.setTimeout(finish, timeoutMs);
    meta.observe(onMetaChange);
  });

  const flushSnapshot = () => {
    snapshotFlushTimer = null;
    try {
      const sheets = editor.getSheets();
      if (!isFortuneSheetArray(sheets)) return;
      ydoc.transact(() => {
        snapshotMap.set('sheets', JSON.stringify(sheets));
        meta.set(SNAPSHOT_OP_COUNT_KEY, yops.length);
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
        meta.set(SNAPSHOT_OP_COUNT_KEY, yops.length);
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

  const bootstrapFromYjs = async () => {
    // Snapshot the target op-count *before* waiting — any ops pushed while we wait
    // will simply be picked up by `observeOps` once bound, same as always.
    const targetOpCount = yops.length;
    const diskCellCount = countSheetCells(initialSheets);
    const preSnapshotSheets = readSnapshotSheets(snapshotMap);
    const preferDisk = isFortuneSheetArray(initialSheets) && diskCellCount > 0
      && (shouldPreferDiskContent(meta, diskRevision) || !preSnapshotSheets || countSheetCells(preSnapshotSheets) === 0);

    // Only worth waiting when we're actually going to trust the Yjs snapshot below —
    // if disk content wins anyway, or there's no ops yet, staleness is moot.
    if (!preferDisk && targetOpCount > 0) {
      await waitForFreshSnapshot(targetOpCount, SNAPSHOT_STALE_WAIT_MS);
    }
    if (destroyed) return;

    const snapshotSheets = readSnapshotSheets(snapshotMap);
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
    // op schedules a snapshot flush, and we just waited for that flush to land when
    // it looked stale), so replaying the full ops log on top of it would double-apply
    // history and can corrupt sheets whose ids were regenerated on this load. Only
    // ops pushed *after* we bootstrap need to be replayed, which `observeOps` handles
    // going forward. If the wait above timed out (peer never flushed — e.g. it
    // disconnected), we fall back to whatever snapshot is available rather than
    // replaying the op that's known to crash this reducer.
    appliedOpCount = yops.length;
  };

  const resyncFromYjs = () => {
    // Y.js ops + snapshot are the collaboration source of truth.
    // Never reload stale initialSheets from disk when another peer saved.
    replayRemoteOps(appliedOpCount);
  };

  // Guards observeOps/resync from touching the editor before the initial bootstrap
  // (which may be awaiting a fresher snapshot, see waitForFreshSnapshot) has actually
  // established a base state — applying ops on top of nothing risks a fresh crash.
  let bootstrapped = false;

  let cancelBootstrap = () => {};
  const runBootstrap = () => {
    bootstrapFromYjs()
      .catch(() => {
        // Ignore — bootstrap already guards its own state mutations.
      })
      .finally(() => {
        bootstrapped = true;
      });
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
    if (!bootstrapped) return;
    replayRemoteOps(appliedOpCount);
  };

  yops.observe(observeOps);

  const binder = {
    resync() {
      if (!bootstrapped) return;
      resyncFromYjs();
    },
    destroy() {
      destroyed = true;
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
