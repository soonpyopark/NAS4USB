import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_WIDTH = 48;
const CORNERS = [
  { id: 'nw', label: '왼쪽 위', dirX: -1 },
  { id: 'ne', label: '오른쪽 위', dirX: 1 },
  { id: 'sw', label: '왼쪽 아래', dirX: -1 },
  { id: 'se', label: '오른쪽 아래', dirX: 1 },
];
const PERCENT_PRESETS = [25, 50, 75, 100];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Resolves package-relative `assets/...` (or stream URLs) for display without mutating the doc,
 * and lets the user resize the image by dragging a corner or picking a width preset.
 *
 * @param {{
 *   node: { attrs: { src?: string, alt?: string, title?: string, width?: number, height?: number } },
 *   selected: boolean,
 *   editor: import('@tiptap/core').Editor,
 *   updateAttributes: (attrs: Record<string, unknown>) => void,
 *   extension: { options: { resolveFileUrl?: (url: string) => Promise<string> } },
 * }} props
 */
export default function TiptapImageView({
  node,
  selected,
  editor,
  updateAttributes,
  extension,
}) {
  const src = node.attrs.src ?? '';
  const width = node.attrs.width ?? null;
  const [displaySrc, setDisplaySrc] = useState(src);
  const [previewWidth, setPreviewWidth] = useState(null);
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const pendingSizeRef = useRef(null);
  const editable = editor?.isEditable !== false;
  const showControls = editable && selected;
  const renderedWidth = previewWidth ?? width;

  useEffect(() => {
    let cancelled = false;
    const resolve = extension.options.resolveFileUrl;
    if (!resolve || !src) {
      setDisplaySrc(src);
      return undefined;
    }

    resolve(src).then((url) => {
      if (!cancelled) setDisplaySrc(url || src);
    });

    return () => {
      cancelled = true;
    };
  }, [extension.options.resolveFileUrl, src]);

  /** Aspect ratio from the loaded bitmap, falling back to the rendered box. */
  const readAspectRatio = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 1;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img.naturalWidth / img.naturalHeight;
    }
    const rect = img.getBoundingClientRect();
    return rect.height > 0 ? rect.width / rect.height : 1;
  }, []);

  const availableWidth = useCallback(() => {
    const wrap = wrapRef.current;
    const fallback = imgRef.current?.getBoundingClientRect().width ?? 0;
    return wrap?.clientWidth || fallback || MIN_WIDTH;
  }, []);

  const startResize = useCallback(
    (event, corner) => {
      if (!editable || event.button !== 0) return;
      const img = imgRef.current;
      if (!img) return;

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = img.getBoundingClientRect().width;
      const ratio = readAspectRatio();
      const maxWidth = availableWidth();

      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) * corner.dirX;
        const next = Math.round(clamp(startWidth + delta, MIN_WIDTH, maxWidth));
        pendingSizeRef.current = { width: next, height: Math.round(next / ratio) };
        setPreviewWidth(next);
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        const size = pendingSizeRef.current;
        pendingSizeRef.current = null;
        setPreviewWidth(null);
        if (size) updateAttributes(size);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [availableWidth, editable, readAspectRatio, updateAttributes],
  );

  const applyPercentWidth = useCallback(
    (percent) => {
      const next = Math.round(clamp((availableWidth() * percent) / 100, MIN_WIDTH, availableWidth()));
      updateAttributes({ width: next, height: Math.round(next / readAspectRatio()) });
    },
    [availableWidth, readAspectRatio, updateAttributes],
  );

  const resetSize = useCallback(() => {
    updateAttributes({ width: null, height: null });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper
      ref={wrapRef}
      className={`tiptap-image-wrap${selected ? ' is-selected' : ''}`}
    >
      <span
        className="tiptap-image-frame"
        style={renderedWidth ? { width: `${renderedWidth}px` } : undefined}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text -- alt from attrs */}
        <img
          ref={imgRef}
          className="tiptap-image"
          src={displaySrc}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || undefined}
          style={renderedWidth ? { width: '100%' } : undefined}
          draggable={false}
        />

        {showControls &&
          CORNERS.map((corner) => (
            <span
              key={corner.id}
              aria-hidden="true"
              title={`${corner.label} 모서리를 끌어 크기 조절`}
              className={`tiptap-image-handle tiptap-image-handle--${corner.id}`}
              onPointerDown={(event) => startResize(event, corner)}
            />
          ))}

        {previewWidth && <span className="tiptap-image-size-badge">{previewWidth}px</span>}

        {showControls && !previewWidth && (
          <span className="tiptap-image-toolbar" contentEditable={false}>
            {PERCENT_PRESETS.map((percent) => (
              <button
                key={percent}
                type="button"
                title={`너비 ${percent}%`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyPercentWidth(percent)}
              >
                {percent}%
              </button>
            ))}
            <button
              type="button"
              title="원래 크기"
              onMouseDown={(event) => event.preventDefault()}
              onClick={resetSize}
            >
              원본
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
}
