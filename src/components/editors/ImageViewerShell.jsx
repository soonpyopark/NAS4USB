import { useCallback, useEffect, useMemo, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { getImageMimeType } from '../../lib/media/mediaTypes.js';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

/**
 * @param {number} scale
 * @param {'in' | 'out'} direction
 */
function stepScale(scale, direction) {
  const next = direction === 'in' ? scale * ZOOM_STEP : scale / ZOOM_STEP;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 1000) / 1000));
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 * }} props
 */
export default function ImageViewerShell({
  relativePath,
  fileName,
  extension,
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const mimeType = getImageMimeType(extension);
  const streamUrl = useMemo(() => buildMediaStreamUrl(relativePath), [relativePath]);
  const absoluteStreamUrl = useMemo(() => {
    try {
      return new URL(streamUrl, window.location.origin).href;
    } catch {
      return streamUrl;
    }
  }, [streamUrl]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setScale(1);
    setRotation(0);
  }, [streamUrl]);

  const zoomBy = useCallback((direction) => {
    setScale((prev) => stepScale(prev, direction));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
  }, []);

  const rotateClockwise = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handlePrint = useCallback(() => {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      window.open(absoluteStreamUrl, '_blank', 'noopener');
      return;
    }

    const title = fileName || 'image';
    const safeUrl = absoluteStreamUrl.replace(/"/g, '&quot;');
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/[<>&]/g, '')}</title>
  <style>
    @page { margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      height: 100%;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      transform: rotate(${rotation}deg);
    }
  </style>
</head>
<body>
  <img src="${safeUrl}" alt="${title.replace(/"/g, '&quot;')}" />
</body>
</html>`);
    doc.close();

    const cleanup = () => {
      window.setTimeout(() => frame.remove(), 1000);
    };

    const img = doc.querySelector('img');
    const doPrint = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(absoluteStreamUrl, '_blank', 'noopener');
      }
      cleanup();
    };

    if (img instanceof HTMLImageElement) {
      if (img.complete) doPrint();
      else {
        img.onload = doPrint;
        img.onerror = () => {
          window.open(absoluteStreamUrl, '_blank', 'noopener');
          cleanup();
        };
      }
    } else {
      doPrint();
    }

    window.setTimeout(cleanup, 15000);
  }, [absoluteStreamUrl, fileName, rotation]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomBy('in');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        zoomBy('out');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        resetZoom();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePrint, resetZoom, zoomBy]);

  const zoomPercent = Math.round(scale * 100);
  const busy = loading || Boolean(loadError);

  return (
    <ViewerModal
      title={fileName}
      subtitle={`이미지 · ${extension.toUpperCase()} · ${mimeType}`}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || scale <= MIN_SCALE}
          onClick={() => zoomBy('out')}
          title="축소 (Ctrl+-)"
        >
          −
        </button>
        <button
          type="button"
          className="nas-btn-ghost min-w-[3.25rem] text-xs"
          disabled={busy}
          onClick={resetZoom}
          title="실제 크기 100% (Ctrl+0)"
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || scale >= MAX_SCALE}
          onClick={() => zoomBy('in')}
          title="확대 (Ctrl+=)"
        >
          +
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy}
          onClick={rotateClockwise}
          title="시계 방향 회전"
        >
          회전
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy}
          onClick={handlePrint}
          title="인쇄 (Ctrl+P)"
        >
          인쇄
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
        {loading && !loadError && (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-300">
            이미지 불러오는 중…
          </p>
        )}

        <img
          src={streamUrl}
          alt={fileName}
          className="max-h-full max-w-full origin-center object-contain transition-transform duration-150"
          style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoadError('이미지를 표시할 수 없습니다.');
            setLoading(false);
          }}
          draggable={false}
        />
      </div>
    </ViewerModal>
  );
}
