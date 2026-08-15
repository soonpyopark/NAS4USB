import {
  FOLDER_COLOR_KEYS,
  FOLDER_COLORS,
  isCustomFolderColor,
  normalizeFolderColorValue,
} from '../../../shared/folderColors.js';

const CUSTOM_FALLBACK = '#3b82f6';

/**
 * @param {{
 *   value?: string,
 *   disabled?: boolean,
 *   onChange?: (color: string) => void,
 * }} props
 */
export default function FolderColorSwatches({ value = '', disabled = false, onChange }) {
  const customSelected = isCustomFolderColor(value);
  const customHex = customSelected ? normalizeFolderColorValue(value) : CUSTOM_FALLBACK;

  return (
    <div className="folder-color-swatches" role="group" aria-label="폴더 색">
      <button
        type="button"
        className={`folder-color-swatch folder-color-swatch--default${value ? '' : ' is-selected'}`}
        disabled={disabled}
        title="기본 (깊이 색)"
        aria-label="기본 (깊이 색)"
        aria-pressed={!value}
        onClick={() => onChange?.('')}
      >
        <span aria-hidden="true">∅</span>
      </button>
      {FOLDER_COLOR_KEYS.map((key) => {
        const preset = FOLDER_COLORS[key];
        return (
          <button
            key={key}
            type="button"
            className={`folder-color-swatch${value === key ? ' is-selected' : ''}`}
            style={{ background: preset.swatch }}
            disabled={disabled}
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={value === key}
            onClick={() => onChange?.(key)}
          />
        );
      })}
      <label
        className={`folder-color-swatch folder-color-swatch--custom${customSelected ? ' is-selected' : ''}`}
        title="사용자 정의"
      >
        <span
          className="folder-color-swatch__preview"
          style={customSelected ? { background: customHex } : undefined}
          aria-hidden="true"
        />
        <input
          type="color"
          value={customHex}
          disabled={disabled}
          aria-label="사용자 정의 색"
          onChange={(event) => onChange?.(event.target.value)}
        />
      </label>
    </div>
  );
}
