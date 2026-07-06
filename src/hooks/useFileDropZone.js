import { useCallback, useEffect, useRef, useState } from 'react';

function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

/**
 * @param {(files: File[]) => void | Promise<void>} onDrop
 * @param {{ enabled?: boolean }} [options]
 */
export function useFileDropZone(onDrop, { enabled = true } = {}) {
  const depthRef = useRef(0);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setIsFileDragOver(false);
  }, []);

  const handleDragEnter = useCallback(
    (event) => {
      if (!isExternalFileDrag(event)) return;
      if (!enabled) return;
      event.preventDefault();
      depthRef.current += 1;
      if (depthRef.current === 1) {
        setIsFileDragOver(true);
      }
    },
    [enabled],
  );

  const handleDragLeave = useCallback(
    (event) => {
      if (!isExternalFileDrag(event)) return;
      if (!enabled) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) {
        setIsFileDragOver(false);
      }
    },
    [enabled],
  );

  const handleDragOver = useCallback(
    (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
      }
    },
    [enabled],
  );

  const handleDrop = useCallback(
    async (event) => {
      if (!isExternalFileDrag(event)) return;
      event.preventDefault();
      reset();
      if (!enabled) return;
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length) {
        await onDrop(files);
      }
    },
    [enabled, onDrop, reset],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled, reset]);

  useEffect(() => {
    window.addEventListener('dragend', reset);
    return () => window.removeEventListener('dragend', reset);
  }, [reset]);

  return {
    isFileDragOver,
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
