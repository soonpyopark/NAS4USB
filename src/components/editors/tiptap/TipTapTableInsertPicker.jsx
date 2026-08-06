import { useEffect, useRef, useState } from 'react';
import { IconTable } from './TipTapIcons.jsx';

const MAX_ROWS = 8;
const MAX_COLS = 8;

/**
 * Notion-like table size picker (rows × cols).
 * @param {{
 *   disabled?: boolean,
 *   onInsert: (rows: number, cols: number) => void,
 * }} props
 */
export default function TipTapTableInsertPicker({ disabled = false, onInsert }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 3, cols: 3 });
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="tiptap-table-picker" ref={rootRef}>
      <button
        type="button"
        className="tiptap-toolbar__btn"
        disabled={disabled}
        title="표 삽입"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        aria-label="표 삽입"
      >
        <IconTable />
      </button>
      {open && (
        <div className="tiptap-table-picker__panel" role="dialog" aria-label="표 크기 선택">
          <div className="tiptap-table-picker__label">
            {hover.rows} × {hover.cols} 표
          </div>
          <div
            className="tiptap-table-picker__grid"
            onMouseLeave={() => setHover({ rows: 3, cols: 3 })}
          >
            {Array.from({ length: MAX_ROWS }, (_, rowIndex) =>
              Array.from({ length: MAX_COLS }, (_, colIndex) => {
                const rows = rowIndex + 1;
                const cols = colIndex + 1;
                const active = rows <= hover.rows && cols <= hover.cols;
                return (
                  <button
                    key={`${rows}-${cols}`}
                    type="button"
                    className={`tiptap-table-picker__cell${active ? ' is-active' : ''}`}
                    aria-label={`${rows}행 ${cols}열`}
                    onMouseEnter={() => setHover({ rows, cols })}
                    onClick={() => {
                      onInsert(rows, cols);
                      setOpen(false);
                    }}
                  />
                );
              }),
            )}
          </div>
          <button
            type="button"
            className="tiptap-table-picker__quick"
            onClick={() => {
              onInsert(3, 3);
              setOpen(false);
            }}
          >
            기본 3×3 (헤더 포함)
          </button>
        </div>
      )}
    </div>
  );
}
