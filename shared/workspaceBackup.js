export const WORKSPACE_BACKUP_FILE_PREFIX = 'NAS4USB_백업_';

/**
 * @typedef {{
 *   enabled: boolean,
 *   destPath: string | null,
 *   times: string[],
 *   maxPerDay: number,
 * }} WorkspaceBackupSettings
 */

/** @type {WorkspaceBackupSettings} */
export const DEFAULT_WORKSPACE_BACKUP = {
  enabled: false,
  destPath: null,
  times: ['09:00'],
  maxPerDay: 2,
};

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeBackupDestPath(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeBackupTime(value) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeBackupTimes(value) {
  const list = Array.isArray(value) ? value : [];
  const unique = new Set();
  for (const item of list) {
    const time = normalizeBackupTime(item);
    if (time) unique.add(time);
  }
  return [...unique].sort();
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeBackupMaxPerDay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WORKSPACE_BACKUP.maxPerDay;
  return Math.min(24, Math.max(1, Math.round(parsed)));
}

/**
 * @param {unknown} value
 * @returns {WorkspaceBackupSettings}
 */
export function normalizeWorkspaceBackup(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: raw.enabled === true,
    destPath: normalizeBackupDestPath(raw.destPath),
    times: normalizeBackupTimes(raw.times ?? DEFAULT_WORKSPACE_BACKUP.times),
    maxPerDay: normalizeBackupMaxPerDay(raw.maxPerDay),
  };
}

/**
 * @param {Date} [date]
 */
export function formatBackupStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * @param {Date} [date]
 */
export function formatBackupDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * @param {Date} [date]
 */
export function formatBackupDayPrefix(date = new Date()) {
  return `${WORKSPACE_BACKUP_FILE_PREFIX}${formatBackupDay(date)}_`;
}

/**
 * Folder one run's archives land in: `YYYYMMDD`. Every run used to drop its share and
 * per-user zips straight into the destination, so a folder holding a few days of runs
 * was hard to read at a glance.
 * @param {Date} [date]
 */
export function formatBackupDayFolder(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * @param {string} name
 */
export function isWorkspaceBackupDayFolder(name) {
  return /^\d{8}$/.test(String(name ?? ''));
}

/**
 * Stamp at the end: `YYMMDD_HHMMSS` (legacy and split archives).
 * @param {string} name
 * @returns {string | null}
 */
export function extractBackupStamp(name) {
  const base = String(name ?? '').split(/[/\\]/).pop() ?? '';
  const match = /_(\d{6}_\d{6})\.zip$/i.exec(base);
  return match ? match[1] : null;
}

/**
 * @param {string} name
 * @returns {string | null} YYMMDD
 */
export function extractBackupDay(name) {
  const stamp = extractBackupStamp(name);
  return stamp ? stamp.slice(0, 6) : null;
}

/**
 * @param {Date} [date]
 */
export function backupFileName(date = new Date()) {
  return `${WORKSPACE_BACKUP_FILE_PREFIX}${formatBackupStamp(date)}.zip`;
}

/**
 * @param {Date} [date]
 */
export function backupShareFileName(date = new Date()) {
  return `${WORKSPACE_BACKUP_FILE_PREFIX}share_${formatBackupStamp(date)}.zip`;
}

/**
 * @param {string} userFolder
 * @param {Date} [date]
 */
export function backupPrivateFileName(userFolder, date = new Date()) {
  const user =
    String(userFolder ?? '')
      .split(/[/\\]/)
      .pop()
      ?.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim() || 'user';
  return `${WORKSPACE_BACKUP_FILE_PREFIX}private_${user}_${formatBackupStamp(date)}.zip`;
}

/**
 * @param {string} name
 */
export function isWorkspaceBackupFileName(name) {
  const base = String(name ?? '').split(/[/\\]/).pop() ?? '';
  if (!base || base.includes('..')) return false;
  if (!base.startsWith(WORKSPACE_BACKUP_FILE_PREFIX) || !base.toLowerCase().endsWith('.zip')) {
    return false;
  }
  const rest = base.slice(WORKSPACE_BACKUP_FILE_PREFIX.length, -4);
  return (
    /^\d{6}_\d{6}$/.test(rest) ||
    /^share_\d{6}_\d{6}$/i.test(rest) ||
    /^private_.+_\d{6}_\d{6}$/i.test(rest)
  );
}

/**
 * Splits `YYYYMMDD/NAS4USB_백업_….zip`, and also the bare file name archives written
 * before day folders existed.
 * @param {string} name
 * @returns {{ dayFolder: string, fileName: string } | null}
 */
export function parseWorkspaceBackupPath(name) {
  const parts = String(name ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;

  const fileName = parts[parts.length - 1];
  if (!isWorkspaceBackupFileName(fileName)) return null;
  const dayFolder = parts.length === 2 ? parts[0] : '';
  if (dayFolder && !isWorkspaceBackupDayFolder(dayFolder)) return null;
  return { dayFolder, fileName };
}

/**
 * @param {Date} date
 */
export function backupSlotKey(date, time) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}
