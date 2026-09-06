import { formatBackupStamp } from './workspaceBackup.js';

export const PC_SETTINGS_BACKUP_KIND = 'nas4usb-pc-settings';
export const PC_SETTINGS_BACKUP_VERSION = 1;
export const PC_SETTINGS_BACKUP_FILE_PREFIX = 'NAS4USB_설정_';

/**
 * @param {Date} [date]
 */
export function pcSettingsBackupFileName(date = new Date()) {
  return `${PC_SETTINGS_BACKUP_FILE_PREFIX}${formatBackupStamp(date)}.zip`;
}

/**
 * @param {string} name
 */
export function isPcSettingsBackupFileName(name) {
  const base = String(name ?? '').split(/[/\\]/).pop() ?? '';
  const normalized = (() => {
    try {
      return base.normalize('NFC');
    } catch {
      return base;
    }
  })();
  return (
    Boolean(normalized) &&
    !normalized.includes('..') &&
    normalized.startsWith(PC_SETTINGS_BACKUP_FILE_PREFIX) &&
    normalized.toLowerCase().endsWith('.zip')
  );
}

/**
 * @param {unknown} value
 * @returns {{
 *   kind: string,
 *   version: number,
 *   appVersion?: string,
 *   exportedAt?: string,
 *   files?: string[],
 *   dataRoot?: string | null,
 *   skipped?: string[],
 * } | null}
 */
export function parsePcSettingsManifest(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = String(value.kind ?? '').trim();
  const version = Number(value.version);
  if (kind !== PC_SETTINGS_BACKUP_KIND) return null;
  if (!Number.isInteger(version) || version < 1) return null;
  return {
    kind,
    version,
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : undefined,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : undefined,
    files: Array.isArray(value.files)
      ? value.files.filter((item) => typeof item === 'string')
      : undefined,
    dataRoot: value.dataRoot == null ? null : String(value.dataRoot),
    skipped: Array.isArray(value.skipped)
      ? value.skipped.filter((item) => typeof item === 'string')
      : undefined,
  };
}
