import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Palette / swatch color picker for TipTap toolbar.
 * @param {{
 *   title: string,
 *   value?: string,
 *   colors: { label: string, value: string }[],
 *   disabled?: boolean,
 *   mode?: 'text' | 'highlight' | 'fill',
 *   allowCustom?: boolean,
 *   columns?: number,
 *   onChange: (value: string) => void,
 * }} props
 */
export default function TipTapColorSwatchPicker({
  title,
  value = '',
  colors,
  disabled = false,
  mode = 'text',
  allowCustom = true,
  columns = 8,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState('');
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const customInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const pickingRef = useRef(false);
  const listId = useId();

  const paletteValues = useMemo(
    () => new Set(colors.map((item) => item.value).filter(Boolean)),
    [colors],
  );
  const isCustom = Boolean(value) && !paletteValues.has(value);
  const active =
    colors.find((item) => item.value === value) ||
    (isCustom ? { label: '사용자 지정', value } : colors[0]);

  useEffect(() => {
    if (!open) return undefined;
    setHexDraft(normalizeHexColor(value) || '');
  }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (pickingRef.current) return;
      if (customInputRef.current && document.activeElement === customInputRef.current) return;
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLInputElement) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="tiptap-swatch" ref={rootRef}>
      <button
        type="button"
        className={`tiptap-swatch__trigger${open ? ' is-open' : ''}${value ? ' has-color' : ''}`}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {mode === 'text' ? (
          <span className="tiptap-swatch__glyph" aria-hidden="true">
            A
            <span className="tiptap-swatch__bar" style={{ background: value || '#111827' }} />
          </span>
        ) : mode === 'highlight' ? (
          <span className="tiptap-swatch__glyph" aria-hidden="true">
            <span className="tiptap-swatch__marker">A</span>
            <span className="tiptap-swatch__bar" style={{ background: value || '#d1d5db' }} />
          </span>
        ) : (
          <span
            className={`tiptap-swatch__fill${value ? '' : ' is-empty'}`}
            style={value ? { background: value } : undefined}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div id={listId} className="tiptap-swatch__panel" role="listbox" aria-label={title}>
          <div
            className="tiptap-swatch__grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 22px)` }}
          >
            {colors.map((item) => {
              const selected = item.value === value;
              const isNone = !item.value;
              return (
                <button
                  key={`${item.label}-${item.value || 'none'}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  title={item.label}
                  aria-label={item.label}
                  className={`tiptap-swatch__chip${selected ? ' is-selected' : ''}${
                    isNone ? ' is-none' : ''
                  }`}
                  style={item.value ? { background: item.value } : undefined}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  {isNone ? <span className="tiptap-swatch__none-slash" /> : null}
                </button>
              );
            })}

            {allowCustom && (
              <button
                type="button"
                role="option"
                aria-selected={isCustom}
                title="다른 색상 선택"
                aria-label="다른 색상 선택"
                className={`tiptap-swatch__chip tiptap-swatch__chip--custom${
                  isCustom ? ' is-selected' : ''
                }`}
                style={
                  isCustom
                    ? { background: value }
                    : {
                        background:
                          'conic-gradient(from 180deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)',
                      }
                }
                onClick={() => {
                  pickingRef.current = true;
                  customInputRef.current?.click();
                }}
              />
            )}
          </div>

          {allowCustom && (
            <>
              <input
                ref={customInputRef}
                type="color"
                className="tiptap-swatch__native"
                value={normalizeHexColor(value) || '#2563eb'}
                aria-label={`${title} 사용자 지정`}
                onChange={(event) => {
                  onChange(event.target.value);
                  setHexDraft(event.target.value);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    pickingRef.current = false;
                  }, 0);
                }}
              />
              <label className="tiptap-swatch__hex-row">
                <span>HEX</span>
                <input
                  type="text"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  maxLength={7}
                  className="tiptap-swatch__hex"
                  value={hexDraft}
                  placeholder="#RRGGBB"
                  aria-label={`${title} HEX`}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7);
                    setHexDraft(next);
                    const normalized = normalizeHexColor(next);
                    if (normalized) onChange(normalized);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
            </>
          )}

          <div className="tiptap-swatch__caption">{active?.label || title}</div>
        </div>
      )}
    </div>
  );
}

/** @param {string} value */
function normalizeHexColor(value) {
  if (!value || typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (!trimmed.startsWith('#')) trimmed = `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '';
}
