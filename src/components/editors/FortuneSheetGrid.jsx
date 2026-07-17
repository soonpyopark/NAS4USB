import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import '../../styles/fortune-sheet.css';
import { cloneFortuneSheets } from '../../lib/xlsx/cloneFortuneSheets.js';

// FortuneSheet's built-in toolbar "insert image" button (see insertImage/saveImage in
// @fortune-sheet/core) embeds the picked file as a raw base64 data URL directly in the sheet's
// state — there is no hook to intercept/upload it instead. Every subsequent edit then re-clones
// that state (Immer draft + our own cloneFortuneSheets) and re-serializes the *entire* workbook
// for the Yjs snapshot/disk sidecar with that string still embedded, so a several-MB photo can
// spike memory/CPU enough to freeze or crash the renderer (reported as "선택하면 프로그램이
// 다운되네"). Reject oversized files before FortuneSheet's own hidden
// `<input id="fortune-img-upload">` handler ever sees them.
const MAX_IMAGE_INSERT_BYTES = 4 * 1024 * 1024;
const FORTUNE_IMAGE_INPUT_ID = 'fortune-img-upload';

/**
 * @param {{
 *   initialSheets: import('@fortune-sheet/core').Sheet[],
 *   onReady?: (editor: {
 *     getSheets: () => import('@fortune-sheet/core').Sheet[],
 *     updateSheets: (sheets: import('@fortune-sheet/core').Sheet[]) => void,
 *     applyOp: (ops: import('@fortune-sheet/core').Op[]) => void,
 *     onOp: (callback: (ops: import('@fortune-sheet/core').Op[]) => void) => () => void,
 *     onSelectionChange: (callback: (payload: { sheetId: string, selection: { r: number, c: number } }) => void) => () => void,
 *     getWorkbook: () => { addPresence?: Function, addPresences?: Function, removePresence?: Function, removePresences?: Function } | null,
 *     getMountElement: () => HTMLElement | null,
 *     destroy: () => void,
 *   }) => void,
 * }} props
 */
export default function FortuneSheetGrid({ initialSheets, onReady }) {
  const [sheets, setSheets] = useState(() => cloneFortuneSheets(initialSheets));
  const [workbookEpoch, setWorkbookEpoch] = useState(0);
  const sheetsRef = useRef(initialSheets);
  const applyingRemoteRef = useRef(false);
  const listenersRef = useRef(new Set());
  const selectionListenersRef = useRef(new Set());
  const onReadyRef = useRef(onReady);
  const workbookRef = useRef(null);
  const hostRef = useRef(null);
  const readyRef = useRef(false);

  onReadyRef.current = onReady;
  sheetsRef.current = sheets;

  const getSheets = useCallback(() => {
    const current = workbookRef.current?.getAllSheets() ?? sheetsRef.current;
    return cloneFortuneSheets(current);
  }, []);

  const updateSheets = useCallback((nextSheets) => {
    const mutableSheets = cloneFortuneSheets(nextSheets);
    sheetsRef.current = mutableSheets;
    setSheets(mutableSheets);
    // Workbook only expands celldata on mount; force remount for full snapshot replaces.
    setWorkbookEpoch((epoch) => epoch + 1);
  }, []);

  const applyOp = useCallback((ops) => {
    if (!workbookRef.current || !Array.isArray(ops) || ops.length === 0) return;

    applyingRemoteRef.current = true;
    try {
      workbookRef.current.applyOp(ops);
      const mutableSheets = cloneFortuneSheets(workbookRef.current.getAllSheets());
      sheetsRef.current = mutableSheets;
      setSheets(mutableSheets);
    } finally {
      applyingRemoteRef.current = false;
    }
  }, []);

  const notifyReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;

    const editor = {
      getSheets,
      updateSheets,
      applyOp,
      onOp(callback) {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      onSelectionChange(callback) {
        selectionListenersRef.current.add(callback);
        return () => selectionListenersRef.current.delete(callback);
      },
      getWorkbook: () => workbookRef.current,
      getMountElement: () => hostRef.current,
      destroy() {
        listenersRef.current.clear();
        selectionListenersRef.current.clear();
        readyRef.current = false;
      },
    };

    onReadyRef.current?.(editor);
  }, [applyOp, getSheets, updateSheets]);

  useEffect(() => {
    const mutableSheets = cloneFortuneSheets(initialSheets);
    sheetsRef.current = mutableSheets;
    setSheets(mutableSheets);
    readyRef.current = false;
    // Remount Workbook so celldata→data init runs for the new document.
    setWorkbookEpoch((epoch) => epoch + 1);
  }, [initialSheets]);

  useEffect(() => {
    return () => {
      listenersRef.current.clear();
      selectionListenersRef.current.clear();
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => notifyReady(), 0);
    return () => window.clearTimeout(timer);
  }, [notifyReady, initialSheets]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // Capture-phase listener on an ancestor of the toolbar fires before the event ever reaches
    // the `<input>` (and therefore before React's own bubble-phase onChange), so calling
    // stopPropagation() here fully prevents FortuneSheet from processing an oversized file.
    const onChangeCapture = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== FORTUNE_IMAGE_INPUT_ID) return;
      const file = input.files?.[0];
      if (!file || file.size <= MAX_IMAGE_INSERT_BYTES) return;

      event.stopPropagation();
      event.preventDefault();
      input.value = '';
      window.alert(
        `이미지 용량이 너무 커서 삽입할 수 없습니다 (${(file.size / (1024 * 1024)).toFixed(1)}MB).\n` +
          `${(MAX_IMAGE_INSERT_BYTES / (1024 * 1024)).toFixed(0)}MB 이하의 이미지를 사용해 주세요.`,
      );
    };

    host.addEventListener('change', onChangeCapture, true);
    return () => host.removeEventListener('change', onChangeCapture, true);
  }, []);

  const handleOp = useCallback((ops) => {
    if (applyingRemoteRef.current) return;
    listenersRef.current.forEach((listener) => listener(ops));
  }, []);

  const handleChange = useCallback((newData) => {
    const mutableSheets = cloneFortuneSheets(newData);
    sheetsRef.current = mutableSheets;
    setSheets(mutableSheets);
  }, []);

  const hooks = useMemo(
    () => ({
      afterSelectionChange(sheetId, selection) {
        if (!selection?.row?.length || !selection?.column?.length) return;
        const payload = {
          sheetId: String(sheetId),
          selection: { r: selection.row[0], c: selection.column[0] },
        };
        selectionListenersRef.current.forEach((listener) => listener(payload));
      },
    }),
    [],
  );

  return (
    <div ref={hostRef} className="fortune-sheet-host relative min-h-0 flex-1">
      <Workbook
        key={workbookEpoch}
        ref={workbookRef}
        data={sheets}
        onChange={handleChange}
        onOp={handleOp}
        hooks={hooks}
      />
    </div>
  );
}
