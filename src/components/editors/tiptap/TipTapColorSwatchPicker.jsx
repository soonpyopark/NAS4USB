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
  const hexInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const pickingRef = useRef(false);
  const hexDraftRef = useRef(hexDraft);
  hexDraftRef.current = hexDraft;
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
    if (document.activeElement === hexInputRef.current) return undefined;
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
      const hexInput = hexInputRef.current;
      const hexFocused = hexInput && document.activeElement === hexInput;

      if (hexFocused) {
        if (event.key === 'Escape') return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          commitHexDraft(hexDraftRef, value, onChange, setHexDraft);
          return;
        }
        const inserted = hexCharFromEvent(event);
        if (inserted) {
          event.preventDefault();
          event.stopPropagation();
          applyHexInsert(hexInput, hexDraftRef, inserted, onChange, setHexDraft);
        }
        return;
      }

      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLInputElement) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onChange, value]);

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
            <span
              className="tiptap-swatch__marker"
              style={{ background: value || '#fde047' }}
            >
              A
            </span>
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
                  ref={hexInputRef}
                  type="text"
                  lang="en"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={7}
                  className="tiptap-swatch__hex"
                  value={hexDraft}
                  placeholder="#RRGGBB"
                  aria-label={`${title} HEX`}
                  onChange={(event) => {
                    const next = sanitizeHexDraft(event.target.value);
                    setHexDraft(next);
                    const complete = parseHexColor(next, { allowShort: false });
                    if (complete) onChange(complete);
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    const pasted = event.clipboardData?.getData('text') ?? '';
                    applyHexInsert(
                      event.currentTarget,
                      hexDraftRef,
                      sanitizeHexDraft(pasted).replace(/^#/, ''),
                      onChange,
                      setHexDraft,
                    );
                  }}
                  onCompositionStart={(event) => event.preventDefault()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onKeyUp={(event) => event.stopPropagation()}
                  onBlur={() => commitHexDraft(hexDraftRef, value, onChange, setHexDraft)}
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

const HEX_CODE_CHARS = {
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  KeyA: 'a',
  KeyB: 'b',
  KeyC: 'c',
  KeyD: 'd',
  KeyE: 'e',
  KeyF: 'f',
};

/**
 * Physical key → hex char so Hangul IME cannot swallow A–F.
 * @param {KeyboardEvent} event
 */
function hexCharFromEvent(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return '';
  if (event.key === '#') return '#';
  return HEX_CODE_CHARS[event.code] ?? '';
}

/**
 * @param {HTMLInputElement} input
 * @param {{ current: string }} draftRef
 * @param {string} chunk
 * @param {(value: string) => void} onChange
 * @param {(value: string) => void} setHexDraft
 */
function applyHexInsert(input, draftRef, chunk, onChange, setHexDraft) {
  const current = draftRef.current;
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const next = sanitizeHexDraft(`${current.slice(0, start)}${chunk}${current.slice(end)}`);
  draftRef.current = next;
  setHexDraft(next);
  const complete = parseHexColor(next, { allowShort: false });
  if (complete) onChange(complete);
  const caret = Math.min(start + chunk.length, next.length);
  queueMicrotask(() => {
    input.setSelectionRange(caret, caret);
  });
}

/**
 * @param {{ current: string }} draftRef
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {(value: string) => void} setHexDraft
 */
function commitHexDraft(draftRef, value, onChange, setHexDraft) {
  const committed = parseHexColor(draftRef.current, { allowShort: true });
  if (!committed) return;
  draftRef.current = committed;
  setHexDraft(committed);
  if (committed !== value) onChange(committed);
}

/** @param {string} value */
function sanitizeHexDraft(value) {
  const raw = String(value ?? '');
  const hash = raw.includes('#') ? '#' : '';
  const digits = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  return `${hash}${digits}`.slice(0, 7);
}

/**
 * @param {string} value
 * @param {{ allowShort?: boolean }} [options]
 */
function parseHexColor(value, options = {}) {
  if (!value || typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (!trimmed.startsWith('#')) trimmed = `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (options.allowShort && /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '';
}

/** @param {string} value */
function normalizeHexColor(value) {
  return parseHexColor(value, { allowShort: true });
}
