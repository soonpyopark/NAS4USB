import { useCallback, useEffect, useRef, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import '../../styles/fortune-sheet.css';

/**
 * @param {{
 *   initialSheets: import('@fortune-sheet/core').Sheet[],
 *   onReady?: (editor: {
 *     getSheets: () => import('@fortune-sheet/core').Sheet[],
 *     updateSheets: (sheets: import('@fortune-sheet/core').Sheet[]) => void,
 *     applyOp: (ops: import('@fortune-sheet/core').Op[]) => void,
 *     onOp: (callback: (ops: import('@fortune-sheet/core').Op[]) => void) => () => void,
 *     getMountElement: () => HTMLElement | null,
 *     destroy: () => void,
 *   }) => void,
 * }} props
 */
export default function FortuneSheetGrid({ initialSheets, onReady }) {
  const [sheets, setSheets] = useState(initialSheets);
  const sheetsRef = useRef(initialSheets);
  const applyingRemoteRef = useRef(false);
  const listenersRef = useRef(new Set());
  const onReadyRef = useRef(onReady);
  const workbookRef = useRef(null);
  const hostRef = useRef(null);
  const readyRef = useRef(false);

  onReadyRef.current = onReady;
  sheetsRef.current = sheets;

  const getSheets = useCallback(
    () => workbookRef.current?.getAllSheets() ?? sheetsRef.current,
    [],
  );

  const updateSheets = useCallback((nextSheets) => {
    sheetsRef.current = nextSheets;
    setSheets(nextSheets);
    if (workbookRef.current) {
      workbookRef.current.updateSheet(nextSheets);
    }
  }, []);

  const applyOp = useCallback((ops) => {
    if (!workbookRef.current || !Array.isArray(ops) || ops.length === 0) return;

    applyingRemoteRef.current = true;
    try {
      workbookRef.current.applyOp(ops);
      sheetsRef.current = workbookRef.current.getAllSheets();
      setSheets(sheetsRef.current);
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
      getMountElement: () => hostRef.current,
      destroy() {
        listenersRef.current.clear();
        readyRef.current = false;
      },
    };

    onReadyRef.current?.(editor);
  }, [applyOp, getSheets, updateSheets]);

  useEffect(() => {
    return () => {
      listenersRef.current.clear();
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => notifyReady(), 0);
    return () => window.clearTimeout(timer);
  }, [notifyReady]);

  const handleOp = useCallback((ops) => {
    if (applyingRemoteRef.current) return;
    listenersRef.current.forEach((listener) => listener(ops));
  }, []);

  const handleChange = useCallback((newData) => {
    sheetsRef.current = newData;
    setSheets(newData);
  }, []);

  return (
    <div ref={hostRef} className="fortune-sheet-host relative min-h-0 flex-1">
      <Workbook
        ref={workbookRef}
        data={sheets}
        onChange={handleChange}
        onOp={handleOp}
      />
    </div>
  );
}
