import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import FolderColorSwatches from './FolderColorSwatches.jsx';

const VIEWPORT_PADDING = 8;

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function resolveMenuPosition(x, y, width, height) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x;
  let top = y;

  if (left + width > viewportWidth - VIEWPORT_PADDING) {
    left = x - width;
  }
  if (top + height > viewportHeight - VIEWPORT_PADDING) {
    top = y - height;
  }

  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING);

  return {
    left: Math.min(Math.max(VIEWPORT_PADDING, left), maxLeft),
    top: Math.min(Math.max(VIEWPORT_PADDING, top), maxTop),
  };
}

/**
 * @param {{
 *   x: number,
 *   y: number,
 *   items: Array<{
 *     id: string,
 *     label: string,
 *     danger?: boolean,
 *     disabled?: boolean,
 *     type?: 'item' | 'swatches',
 *     value?: string,
 *     onClick?: () => void,
 *     onSelect?: (value: string) => void,
 *   }>,
 *   onClose: () => void,
 * }} props
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(() => ({ left: x, top: y }));

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      setPosition({ left: x, top: y });
      return;
    }

    const { width, height } = menu.getBoundingClientRect();
    setPosition(resolveMenuPosition(x, y, width, height));
  }, [x, y, items]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', onClose, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-nas-border bg-white py-1 shadow-lg"
      style={{ left: position.left, top: position.top }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        item.type === 'swatches' ? (
          <div key={item.id} className="px-3 py-2" role="none">
            <div className="mb-1.5 text-[10pt] text-slate-500">{item.label}</div>
            <FolderColorSwatches
              value={item.value || ''}
              disabled={item.disabled}
              onChange={(color) => {
                if (item.disabled) return;
                item.onSelect?.(color);
                if (!String(color).startsWith('#')) onClose();
              }}
            />
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick?.();
              onClose();
            }}
            className={`flex w-full px-3 py-2 text-left text-[10pt] disabled:cursor-not-allowed disabled:opacity-40 ${
              item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
