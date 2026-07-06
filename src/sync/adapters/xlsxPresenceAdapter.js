/**
 * @typedef {{ sheetId: string, selection: { r: number, c: number } }} SheetPresencePayload
 * @typedef {{
 *   sheetId: string,
 *   username: string,
 *   userId: string,
 *   color: string,
 *   selection: { r: number, c: number },
 * }} FortuneSheetPresence
 */

/**
 * @param {{ addPresence?: (p: FortuneSheetPresence) => void, addPresences?: (p: FortuneSheetPresence[]) => void } | null | undefined} workbook
 * @param {FortuneSheetPresence[]} presences
 */
function callAddPresences(workbook, presences) {
  if (!workbook || presences.length === 0) return;
  if (typeof workbook.addPresences === 'function') {
    workbook.addPresences(presences);
    return;
  }
  if (typeof workbook.addPresence === 'function') {
    for (const presence of presences) {
      workbook.addPresence(presence);
    }
  }
}

/**
 * @param {{ removePresence?: (p: { userId?: string, username?: string }) => void, removePresences?: (p: { userId?: string, username?: string }[]) => void } | null | undefined} workbook
 * @param {{ userId?: string, username?: string }[]} presences
 */
function callRemovePresences(workbook, presences) {
  if (!workbook || presences.length === 0) return;
  if (typeof workbook.removePresences === 'function') {
    workbook.removePresences(presences);
    return;
  }
  if (typeof workbook.removePresence === 'function') {
    for (const presence of presences) {
      workbook.removePresence(presence);
    }
  }
}

/**
 * Y.js awareness ↔ Fortune Sheet Presence API
 *
 * @param {import('y-websocket').WebsocketProvider | null | undefined} provider
 * @param {{
 *   getWorkbook?: () => {
 *     addPresence?: (p: FortuneSheetPresence) => void,
 *     addPresences?: (p: FortuneSheetPresence[]) => void,
 *     removePresence?: (p: { userId?: string, username?: string }) => void,
 *     removePresences?: (p: { userId?: string, username?: string }[]) => void,
 *   } | null,
 *   onSelectionChange?: (callback: (payload: SheetPresencePayload) => void) => () => void,
 * }} editor
 */
export function bindFortuneSheetPresence(provider, editor) {
  const awareness = provider?.awareness;
  if (!awareness || typeof editor.onSelectionChange !== 'function') {
    return () => {};
  }

  const localClientId = awareness.clientID;
  /** @type {Map<string, string>} */
  const trackedRemoteUsers = new Map();
  let lastLocalKey = '';

  const syncRemotePresences = () => {
    const workbook = editor.getWorkbook?.();
    if (!workbook) return;

    /** @type {Map<string, FortuneSheetPresence>} */
    const desired = new Map();

    awareness.getStates().forEach((state, clientId) => {
      if (clientId === localClientId) return;

      const rawPresence = state?.sheetPresence;
      if (!rawPresence || typeof rawPresence !== 'object') return;

      const sheetId = rawPresence.sheetId;
      const selection = rawPresence.selection;
      if (typeof sheetId !== 'string' || !sheetId) return;
      if (!selection || typeof selection.r !== 'number' || typeof selection.c !== 'number') return;

      const user = state?.user;
      const userId = String(clientId);
      const username = typeof user?.name === 'string' && user.name ? user.name : `사용자 ${clientId}`;

      desired.set(userId, {
        sheetId,
        username,
        userId,
        color: typeof user?.color === 'string' && user.color ? user.color : '#64748b',
        selection: { r: selection.r, c: selection.c },
      });
    });

    for (const [userId, username] of trackedRemoteUsers) {
      if (!desired.has(userId)) {
        callRemovePresences(workbook, [{ userId, username }]);
      }
    }

    trackedRemoteUsers.clear();
    const toAdd = [];
    for (const [userId, presence] of desired) {
      trackedRemoteUsers.set(userId, presence.username);
      toAdd.push(presence);
    }

    callAddPresences(workbook, toAdd);
  };

  const onAwarenessChange = () => {
    syncRemotePresences();
  };

  const unsubSelection = editor.onSelectionChange(({ sheetId, selection }) => {
    const key = `${sheetId}:${selection.r}:${selection.c}`;
    if (key === lastLocalKey) return;
    lastLocalKey = key;
    awareness.setLocalStateField('sheetPresence', { sheetId, selection });
  });

  awareness.on('change', onAwarenessChange);

  let syncAttempts = 0;
  const trySyncRemotePresences = () => {
    if (editor.getWorkbook?.()) {
      syncRemotePresences();
      return;
    }
    if (syncAttempts >= 60) return;
    syncAttempts += 1;
    window.requestAnimationFrame(trySyncRemotePresences);
  };

  trySyncRemotePresences();

  const publishInitialLocalPresence = () => {
    const workbook = editor.getWorkbook?.();
    if (!workbook) return;

    const selection = workbook.getSelection?.()?.[0];
    const sheets = workbook.getAllSheets?.() ?? [];
    const activeSheet = sheets.find((sheet) => sheet.status === 1) ?? sheets[0];
    if (!activeSheet?.id || !selection?.row?.length || !selection?.column?.length) return;

    const payload = {
      sheetId: String(activeSheet.id),
      selection: { r: selection.row[0], c: selection.column[0] },
    };
    lastLocalKey = `${payload.sheetId}:${payload.selection.r}:${payload.selection.c}`;
    awareness.setLocalStateField('sheetPresence', payload);
  };

  window.requestAnimationFrame(publishInitialLocalPresence);

  return () => {
    unsubSelection();
    awareness.off('change', onAwarenessChange);

    const workbook = editor.getWorkbook?.();
    if (workbook && trackedRemoteUsers.size > 0) {
      callRemovePresences(
        workbook,
        [...trackedRemoteUsers.entries()].map(([userId, username]) => ({ userId, username })),
      );
    }
    trackedRemoteUsers.clear();

    awareness.setLocalStateField('sheetPresence', null);
    lastLocalKey = '';
  };
}
