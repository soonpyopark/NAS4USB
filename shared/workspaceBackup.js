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
/**
 * APFS/Finder often store Korean names as NFD. Compare as NFC.
 * @param {string} name
 */
export function normalizeBackupBaseName(name) {
  const base = String(name ?? '').split(/[/\\]/).pop() ?? '';
  try {
    return base.normalize('NFC');
  } catch {
    return base;
  }
}

export function extractBackupStamp(name) {
  const match = /_(\d{6}_\d{6})\.zip$/i.exec(normalizeBackupBaseName(name));
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
 * Group key for the settings list: `YYYYMMDD`, or '' when the day is unknown.
 * Day-folder archives use that folder; older loose zips use the stamp (20YY).
 * @param {string} fileName
 * @param {string} [at]
 */
export function backupArchiveDayKey(fileName, at) {
  const parsed = parseWorkspaceBackupPath(fileName);
  if (parsed?.dayFolder) return parsed.dayFolder;
  const yyMMdd = extractBackupDay(fileName);
  if (yyMMdd) return `20${yyMMdd}`;
  if (at) {
    const date = new Date(at);
    if (!Number.isNaN(date.getTime())) return formatBackupDayFolder(date);
  }
  return '';
}

/**
 * @param {string} dayKey
 */
export function formatBackupDayListLabel(dayKey) {
  const key = String(dayKey ?? '');
  if (!isWorkspaceBackupDayFolder(key)) return '날짜 없음';
  const year = key.slice(0, 4);
  const month = Number(key.slice(4, 6));
  const day = Number(key.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return key;
  return `${year}년 ${month}월 ${day}일`;
}

/**
 * @param {Array<{ fileName: string, at?: string }>} archives
 * @returns {Array<[string, typeof archives]>}
 */
export function groupWorkspaceBackupsByDay(archives) {
  /** @type {Map<string, Array<{ fileName: string, at?: string }>>} */
  const groups = new Map();
  for (const item of Array.isArray(archives) ? archives : []) {
    const key = backupArchiveDayKey(item.fileName, item.at);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].sort((left, right) => {
    if (!left[0]) return 1;
    if (!right[0]) return -1;
    return right[0].localeCompare(left[0]);
  });
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
  return Boolean(parseWorkspaceBackupKind(name));
}

/**
 * @param {string} name
 * @returns {{ kind: 'share' | 'private' | 'legacy', userFolder: string | null } | null}
 */
export function parseWorkspaceBackupKind(name) {
  const base = normalizeBackupBaseName(name);
  if (!base || base.includes('..')) return null;
  if (!base.startsWith(WORKSPACE_BACKUP_FILE_PREFIX) || !base.toLowerCase().endsWith('.zip')) {
    return null;
  }
  const rest = base.slice(WORKSPACE_BACKUP_FILE_PREFIX.length, -4);
  if (/^share_\d{6}_\d{6}$/i.test(rest)) {
    return { kind: 'share', userFolder: null };
  }
  const privateMatch = /^private_(.+)_\d{6}_\d{6}$/i.exec(rest);
  if (privateMatch) {
    return { kind: 'private', userFolder: privateMatch[1] };
  }
  if (/^\d{6}_\d{6}$/.test(rest)) {
    return { kind: 'legacy', userFolder: null };
  }
  return null;
}

/**
 * Day folder (`YYYYMMDD`) implied by the stamp in the archive name.
 * @param {string} name
 */
export function dayFolderFromBackupName(name) {
  const stamp = extractBackupStamp(name);
  if (!stamp) return formatBackupDayFolder();
  return `20${stamp.slice(0, 6)}`;
}

/**
 * @param {string} fileName
 * @returns {{ title: string, body: string }}
 */
export function describeWorkspaceBackupRestore(fileName) {
  const kind = parseWorkspaceBackupKind(fileName);
  if (kind?.kind === 'share') {
    return {
      title: '공유폴더 복원',
      body: '공유폴더의 같은 경로 파일을 덮어씁니다. 백업에 없는 파일은 그대로 둡니다.',
    };
  }
  if (kind?.kind === 'private') {
    return {
      title: '개인폴더 복원',
      body: `개인폴더(${kind.userFolder})의 같은 경로 파일을 덮어씁니다. 백업에 없는 파일은 그대로 둡니다.`,
    };
  }
  return {
    title: '백업 복원',
    body: '워크스페이스의 같은 경로 파일을 덮어씁니다. 백업에 없는 파일은 그대로 둡니다.',
  };
}

/**
 * Splits `YYYYMMDD/NAS4USB_백업_….zip`, and also the bare file name archives written
 * before day folders existed.
 * @param {string} name
 * @returns {{ dayFolder: string, fileName: string } | null}
 */
export function parseWorkspaceBackupPath(name) {
  const parts = String(name ?? '')
    .normalize('NFC')
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
