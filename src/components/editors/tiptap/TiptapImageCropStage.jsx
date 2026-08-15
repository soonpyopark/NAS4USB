import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_CROP = 16;
const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n', cursor: 'ns-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e', cursor: 'ew-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's', cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w', cursor: 'ew-resize' },
];

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * @param {number} imageW
 * @param {number} imageH
 * @param {number} [aspect]
 */
function defaultCropRect(imageW, imageH, aspect) {
  if (!aspect) {
    const padX = Math.round(imageW * 0.06);
    const padY = Math.round(imageH * 0.06);
    return {
      x: padX,
      y: padY,
      width: Math.max(MIN_CROP, imageW - padX * 2),
      height: Math.max(MIN_CROP, imageH - padY * 2),
    };
  }

  let width = imageW;
  let height = width / aspect;
  if (height > imageH) {
    height = imageH;
    width = height * aspect;
  }
  return {
    x: Math.round((imageW - width) / 2),
    y: Math.round((imageH - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * @param {{
 *   imageSrc: string,
 *   aspect?: number,
 *   onCropChange: (crop: { x: number, y: number, width: number, height: number } | null) => void,
 * }} props
 */
export default function TiptapImageCropStage({ imageSrc, aspect, onCropChange }) {
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null));
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState(/** @type {{ x: number, y: number, width: number, height: number } | null} */ (null));
  const dragRef = useRef(/** @type {null | {
    mode: string,
    startX: number,
    startY: number,
    origin: { x: number, y: number, width: number, height: number },
  }} */ (null));

  const syncSize = useCallback(() => {
    const img = imgRef.current;
    if (!img || img.naturalWidth <= 0) return;
    const next = { width: img.naturalWidth, height: img.naturalHeight };
    setImageSize(next);
    setCrop((current) => current ?? defaultCropRect(next.width, next.height, aspect));
  }, [aspect]);

  useEffect(() => {
    setCrop(null);
    setImageSize({ width: 0, height: 0 });
  }, [imageSrc]);

  useEffect(() => {
    if (imageSize.width <= 0) return;
    setCrop(defaultCropRect(imageSize.width, imageSize.height, aspect));
  }, [aspect, imageSize.height, imageSize.width]);

  useEffect(() => {
    onCropChange(crop);
  }, [crop, onCropChange]);

  const clientToImage = useCallback(
    (clientX, clientY) => {
      const img = imgRef.current;
      if (!img || imageSize.width <= 0) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * imageSize.width,
        y: ((clientY - rect.top) / rect.height) * imageSize.height,
      };
    },
    [imageSize.height, imageSize.width],
  );

  const applyDrag = useCallback(
    (point) => {
      const drag = dragRef.current;
      if (!drag || imageSize.width <= 0) return;
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const origin = drag.origin;
      let next = { ...origin };

      if (drag.mode === 'move') {
        next.x = origin.x + dx;
        next.y = origin.y + dy;
        next.x = clamp(next.x, 0, imageSize.width - origin.width);
        next.y = clamp(next.y, 0, imageSize.height - origin.height);
        setCrop(next);
        return;
      }

      const mode = drag.mode;
      if (mode.includes('w')) {
        const right = origin.x + origin.width;
        next.x = clamp(origin.x + dx, 0, right - MIN_CROP);
        next.width = right - next.x;
      }
      if (mode.includes('e')) {
        next.width = clamp(origin.width + dx, MIN_CROP, imageSize.width - origin.x);
      }
      if (mode.includes('n')) {
        const bottom = origin.y + origin.height;
        next.y = clamp(origin.y + dy, 0, bottom - MIN_CROP);
        next.height = bottom - next.y;
      }
      if (mode.includes('s')) {
        next.height = clamp(origin.height + dy, MIN_CROP, imageSize.height - origin.y);
      }

      if (aspect) {
        if (mode === 'e' || mode === 'w') {
          next.height = next.width / aspect;
          if (next.y + next.height > imageSize.height) {
            next.height = imageSize.height - next.y;
            next.width = next.height * aspect;
            if (mode === 'w') next.x = origin.x + origin.width - next.width;
          }
        } else if (mode === 'n' || mode === 's') {
          next.width = next.height * aspect;
          if (next.x + next.width > imageSize.width) {
            next.width = imageSize.width - next.x;
            next.height = next.width / aspect;
            if (mode === 'n') next.y = origin.y + origin.height - next.height;
          }
        } else {
          next.height = next.width / aspect;
          if (mode.includes('n')) next.y = origin.y + origin.height - next.height;
          if (next.y < 0) {
            next.height += next.y;
            next.width = next.height * aspect;
            next.y = 0;
            if (mode.includes('w')) next.x = origin.x + origin.width - next.width;
          }
          if (next.y + next.height > imageSize.height) {
            next.height = imageSize.height - next.y;
            next.width = next.height * aspect;
            if (mode.includes('w')) next.x = origin.x + origin.width - next.width;
          }
        }
      }

      next.x = clamp(next.x, 0, imageSize.width - MIN_CROP);
      next.y = clamp(next.y, 0, imageSize.height - MIN_CROP);
      next.width = clamp(next.width, MIN_CROP, imageSize.width - next.x);
      next.height = clamp(next.height, MIN_CROP, imageSize.height - next.y);
      setCrop({
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height),
      });
    },
    [aspect, imageSize.height, imageSize.width],
  );

  const startDrag = useCallback(
    (event, mode) => {
      if (event.button !== 0 || !crop) return;
      event.preventDefault();
      event.stopPropagation();
      const point = clientToImage(event.clientX, event.clientY);
      dragRef.current = {
        mode,
        startX: point.x,
        startY: point.y,
        origin: { ...crop },
      };

      const onMove = (moveEvent) => {
        applyDrag(clientToImage(moveEvent.clientX, moveEvent.clientY));
      };
      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        dragRef.current = null;
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [applyDrag, clientToImage, crop],
  );

  const boxStyle = crop && imageSize.width > 0
    ? {
        left: `${(crop.x / imageSize.width) * 100}%`,
        top: `${(crop.y / imageSize.height) * 100}%`,
        width: `${(crop.width / imageSize.width) * 100}%`,
        height: `${(crop.height / imageSize.height) * 100}%`,
      }
    : undefined;

  return (
    <div className="tiptap-image-edit-crop">
      <div className="tiptap-image-edit-fit">
        <div className="tiptap-image-edit-frame">
          {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative crop source */}
          <img
            ref={imgRef}
            className="tiptap-image-edit-source"
            src={imageSrc}
            alt=""
            draggable={false}
            onLoad={syncSize}
          />
          {boxStyle && (
            <div
              className="tiptap-image-edit-box"
              style={boxStyle}
              onPointerDown={(event) => startDrag(event, 'move')}
            >
              {HANDLES.map((handle) => (
                <span
                  key={handle.id}
                  className={`tiptap-image-edit-handle tiptap-image-edit-handle--${handle.id}`}
                  style={{ cursor: handle.cursor }}
                  onPointerDown={(event) => startDrag(event, handle.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
