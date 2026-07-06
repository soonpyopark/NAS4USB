import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import '../../styles/fortune-sheet.css';
import { cloneFortuneSheets } from '../../lib/xlsx/cloneFortuneSheets.js';

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
        ref={workbookRef}
        data={sheets}
        onChange={handleChange}
        onOp={handleOp}
        hooks={hooks}
      />
    </div>
  );
}
