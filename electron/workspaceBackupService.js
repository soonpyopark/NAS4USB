import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataRoot, getHomesRoot, getPortableRoot } from './appContext.js';
import { getAppSettings, updateAppSettings } from './settingsService.js';
import { sevenZipMin } from './sevenZip.js';
import {
  backupPrivateFileName,
  backupShareFileName,
  backupSlotKey,
  extractBackupDay,
  extractBackupStamp,
  formatBackupDay,
  isWorkspaceBackupFileName,
  normalizeWorkspaceBackup,
} from '../shared/workspaceBackup.js';

const STATE_FILE = path.join('.nas4usb', 'workspace-backup-state.json');
const TICK_MS = 30_000;

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
let running = false;

/** @type {{
 *   at: string,
 *   fileName: string,
 *   filePath: string,
 *   bytes: number,
 *   files?: Array<{ fileName: string, filePath: string, bytes: number }>,
 *   trigger: 'manual' | 'auto',
 *   error?: string,
 * } | null} */
let lastResult = null;

/**
 * @param {string} value
 */
function normalizeAbs(value) {
  const resolved = path.resolve(String(value ?? ''));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * @param {string} target
 * @param {string} root
 */
function isEqualOrInside(target, root) {
  const t = normalizeAbs(target);
  const r = normalizeAbs(root);
  if (t === r) return true;
  const relative = path.relative(r, t);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * @param {string} destPath
 */
export function assertBackupDestAllowed(destPath) {
  const dest = path.resolve(String(destPath ?? '').trim());
  if (!dest) {
    throw new Error('백업 폴더를 지정해 주세요.');
  }
  const shareRoot = getDataRoot();
  const privateRoot = getHomesRoot();
  if (isEqualOrInside(dest, shareRoot)) {
    throw new Error('공유폴더(share) 안에는 백업할 수 없습니다.');
  }
  if (isEqualOrInside(dest, privateRoot)) {
    throw new Error('개인폴더(private) 안에는 백업할 수 없습니다.');
  }
  return dest;
}

/**
 * @param {string} [portableRoot]
 */
async function loadState(portableRoot = getPortableRoot()) {
  try {
    const raw = await fs.readFile(path.join(portableRoot, STATE_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ranSlots: Array.isArray(parsed?.ranSlots)
        ? parsed.ranSlots.filter((item) => typeof item === 'string')
        : [],
      last: parsed?.last && typeof parsed.last === 'object' ? parsed.last : null,
    };
  } catch {
    return { ranSlots: [], last: null };
  }
}

/**
 * @param {{ ranSlots: string[], last: object | null }} state
 * @param {string} [portableRoot]
 */
async function saveState(state, portableRoot = getPortableRoot()) {
  const filePath = path.join(portableRoot, STATE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} destDir
 * @param {number} maxPerDay
 * @param {Date} [now]
 */
async function pruneDayBackups(destDir, maxPerDay, now = new Date()) {
  const day = formatBackupDay(now);
  let names = [];
  try {
    names = await fs.readdir(destDir);
  } catch {
    return;
  }
  const zips = names.filter(
    (name) => isWorkspaceBackupFileName(name) && extractBackupDay(name) === day,
  );
  /** @type {Map<string, string[]>} */
  const byStamp = new Map();
  for (const name of zips) {
    const stamp = extractBackupStamp(name);
    if (!stamp) continue;
    const list = byStamp.get(stamp) ?? [];
    list.push(name);
    byStamp.set(stamp, list);
  }
  const stamps = [...byStamp.keys()].sort();
  const extra = stamps.length - maxPerDay;
  if (extra <= 0) return;
  for (const stamp of stamps.slice(0, extra)) {
    for (const name of byStamp.get(stamp) ?? []) {
      await fs.rm(path.join(destDir, name), { force: true }).catch(() => {});
    }
  }
}

/**
 * @param {string} destZip
 * @param {string} sourceAbs
 */
async function zipBackupSource(destZip, sourceAbs) {
  await sevenZipMin.cmd([
    'a',
    '-tzip',
    '-mx=1',
    '-x!.nas4usb',
    '-x!*/.nas4usb',
    destZip,
    sourceAbs,
  ]);
}

/**
 * @param {string} folder
 */
async function isExistingDirectory(folder) {
  try {
    const stat = await fs.stat(folder);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<string[]>}
 */
async function listPrivateHomeFolders() {
  const homesRoot = getHomesRoot();
  let entries = [];
  try {
    entries = await fs.readdir(homesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name && name !== '.' && name !== '..' && !name.startsWith('.'))
    .sort((left, right) => left.localeCompare(right, 'ko'));
}

/**
 * @param {'manual' | 'auto'} trigger
 */
export async function runWorkspaceBackup(trigger = 'manual') {
  if (running) {
    throw new Error('이미 백업이 진행 중입니다.');
  }

  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) {
    throw new Error('백업 폴더를 먼저 지정해 주세요.');
  }
  const destDir = assertBackupDestAllowed(settings.destPath);
  await fs.mkdir(destDir, { recursive: true });

  const now = new Date();
  /** @type {Array<{ fileName: string, sourceAbs: string }>} */
  const jobs = [];
  if (await isExistingDirectory(getDataRoot())) {
    jobs.push({
      fileName: backupShareFileName(now),
      sourceAbs: getDataRoot(),
    });
  }
  const homesRoot = getHomesRoot();
  if (await isExistingDirectory(homesRoot)) {
    for (const userFolder of await listPrivateHomeFolders()) {
      jobs.push({
        fileName: backupPrivateFileName(userFolder, now),
        sourceAbs: path.join(homesRoot, userFolder),
      });
    }
  }
  if (jobs.length === 0) {
    throw new Error('백업할 share/private 폴더가 없습니다.');
  }

  /** @type {string[]} */
  const created = [];
  running = true;
  try {
    /** @type {Array<{ fileName: string, filePath: string, bytes: number }>} */
    const files = [];
    for (const job of jobs) {
      const destZip = path.join(destDir, job.fileName);
      await zipBackupSource(destZip, job.sourceAbs);
      created.push(destZip);
      const stat = await fs.stat(destZip);
      files.push({
        fileName: job.fileName,
        filePath: destZip,
        bytes: stat.size,
      });
    }
    await pruneDayBackups(destDir, settings.maxPerDay);
    const bytes = files.reduce((sum, item) => sum + item.bytes, 0);
    lastResult = {
      at: new Date().toISOString(),
      fileName: files.map((item) => item.fileName).join('\n'),
      filePath: files[0]?.filePath ?? destDir,
      bytes,
      files,
      trigger,
    };
    const state = await loadState();
    state.last = lastResult;
    await saveState(state);
    return lastResult;
  } catch (error) {
    lastResult = {
      at: new Date().toISOString(),
      fileName: jobs.map((job) => job.fileName).join('\n'),
      filePath: destDir,
      bytes: 0,
      trigger,
      error: error instanceof Error ? error.message : String(error),
    };
    const state = await loadState();
    state.last = lastResult;
    await saveState(state);
    for (const destZip of created) {
      await fs.rm(destZip, { force: true }).catch(() => {});
    }
    throw error;
  } finally {
    running = false;
  }
}

async function tickAutoBackup() {
  if (running) return;
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.enabled || !settings.destPath || settings.times.length === 0) return;

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const state = await loadState();
  const todayPrefix = backupSlotKey(now, '').slice(0, 11);
  const ranToday = new Set(state.ranSlots.filter((slot) => slot.startsWith(todayPrefix)));

  /** @type {{ time: string, key: string }[]} */
  const due = [];
  for (const time of settings.times) {
    const [hour, minute] = time.split(':').map(Number);
    const slotMinutes = hour * 60 + minute;
    if (minutesNow < slotMinutes) continue;
    const key = backupSlotKey(now, time);
    if (ranToday.has(key)) continue;
    due.push({ time, key });
  }
  const next = due[due.length - 1];
  if (!next) return;

  for (const slot of due) ranToday.add(slot.key);
  try {
    await runWorkspaceBackup('auto');
    state.ranSlots = [...ranToday];
    state.last = lastResult;
    await saveState(state);
  } catch (error) {
    console.warn('[backup] auto backup failed:', error);
    state.ranSlots = [...ranToday];
    state.last = lastResult;
    await saveState(state);
  }
}

export function startWorkspaceBackupScheduler() {
  if (timer) return;
  void tickAutoBackup().catch((error) => {
    console.warn('[backup] scheduler tick failed:', error);
  });
  timer = setInterval(() => {
    void tickAutoBackup().catch((error) => {
      console.warn('[backup] scheduler tick failed:', error);
    });
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * @returns {Promise<Array<{ fileName: string, filePath: string, bytes: number, at: string }>>}
 */
export async function listWorkspaceBackups() {
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) return [];
  const destDir = assertBackupDestAllowed(settings.destPath);
  let names = [];
  try {
    names = await fs.readdir(destDir);
  } catch {
    return [];
  }
  /** @type {Array<{ fileName: string, filePath: string, bytes: number, at: string }>} */
  const items = [];
  for (const name of names) {
    if (!isWorkspaceBackupFileName(name)) continue;
    const filePath = path.join(destDir, name);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      items.push({
        fileName: name,
        filePath,
        bytes: stat.size,
        at: stat.mtime.toISOString(),
      });
    } catch {
      // skip unreadable
    }
  }
  items.sort((left, right) => {
    const stampLeft = extractBackupStamp(left.fileName) ?? '';
    const stampRight = extractBackupStamp(right.fileName) ?? '';
    if (stampLeft !== stampRight) return stampRight.localeCompare(stampLeft);
    return left.fileName.localeCompare(right.fileName, 'ko');
  });
  return items;
}

/**
 * @param {string} fileName
 */
export async function deleteWorkspaceBackup(fileName) {
  const base = path.basename(String(fileName ?? ''));
  if (!isWorkspaceBackupFileName(base)) {
    throw new Error('백업 파일이 아닙니다.');
  }
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) {
    throw new Error('백업 폴더를 먼저 지정해 주세요.');
  }
  const destDir = assertBackupDestAllowed(settings.destPath);
  const destZip = path.join(destDir, base);
  if (!isEqualOrInside(destZip, destDir)) {
    throw new Error('잘못된 백업 파일입니다.');
  }
  await fs.rm(destZip);
  if (
    lastResult?.fileName === base ||
    lastResult?.files?.some((item) => item.fileName === base)
  ) {
    lastResult = null;
    const state = await loadState();
    state.last = null;
    await saveState(state);
  }
  return listWorkspaceBackups();
}

export async function getWorkspaceBackupStatus() {
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!lastResult) {
    const state = await loadState();
    lastResult = state.last;
  }
  return {
    config: settings,
    running,
    last: lastResult,
    archives: await listWorkspaceBackups(),
  };
}

/**
 * Persist backup settings and keep dest validated when set.
 * @param {unknown} patch
 */
export async function saveWorkspaceBackupSettings(patch) {
  const current = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  const next = normalizeWorkspaceBackup({ ...current, ...patch });
  if (next.destPath) {
    next.destPath = assertBackupDestAllowed(next.destPath);
  }
  const settings = await updateAppSettings({ workspaceBackup: next });
  return normalizeWorkspaceBackup(settings.workspaceBackup);
}
