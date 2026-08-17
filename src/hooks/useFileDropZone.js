import { useCallback, useEffect, useRef, useState } from 'react';
import { collectDroppedPayload } from '../lib/droppedFiles.js';
import { nativeAlert } from '../lib/nativeDialog.js';

function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

/**
 * @param {(files: File[], meta?: { emptyDirs: string[] }) => void | Promise<void>} onDrop
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
      try {
        const { files, emptyDirs } = await collectDroppedPayload(event.dataTransfer);
        if (files.length || emptyDirs.length) {
          await onDrop(files, { emptyDirs });
        }
      } catch (err) {
        nativeAlert(err instanceof Error ? err.message : '파일을 읽지 못했습니다.');
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
