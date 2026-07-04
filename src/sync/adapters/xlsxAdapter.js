const LOCAL_ORIGIN = Symbol('educowork-local-fortune-sheet');

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
 * }} editor
 * @param {import('yjs').Doc} ydoc
 * @param {{
 *   initialSheets?: import('@fortune-sheet/core').Sheet[],
 *   provider?: import('y-websocket').WebsocketProvider,
 * }} [options]
 */
export function bindFortuneSheetEditor(ydoc, editor, { initialSheets = [], provider } = {}) {
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

  const seedSnapshot = () => {
    if (snapshotMap.get('sheets')) return;

    ydoc.transact(() => {
      if (snapshotMap.get('sheets')) return;
      snapshotMap.set('sheets', JSON.stringify(initialSheets));
      meta.set('workbook:seeded', true);
    }, 'seed');
  };

  const bootstrapFromYjs = () => {
    const snapshotRaw = snapshotMap.get('sheets');
    if (typeof snapshotRaw === 'string' && snapshotRaw) {
      try {
        editor.updateSheets(JSON.parse(snapshotRaw));
      } catch {
        editor.updateSheets(initialSheets);
      }
    } else if (initialSheets.length > 0) {
      editor.updateSheets(initialSheets);
      seedSnapshot();
    }

    replayRemoteOps(0);
  };

  seedSnapshot();
  bootstrapFromYjs();

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
      bootstrapFromYjs();
    },
    destroy() {
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
      provider.off('sync', onSync);
      binder.destroy();
    };
  }

  return () => binder.destroy();
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
