import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDataRoot, getHomesRoot, getPortableRoot } from './appContext.js';
import { getAppSettings, updateAppSettings } from './settingsService.js';
import { sevenZipMin } from './sevenZip.js';
import { repairExtractedNameTree, repairZipEntryName } from './zipNameEncoding.js';
import { SHARED_FOLDER } from '../shared/constants.js';
import { HOMES_FOLDER } from '../shared/memberHomes.js';
import { isPcSettingsBackupFileName } from '../shared/pcSettingsBackup.js';
import {
  backupArchiveDayKey,
  backupFileName,
  backupPrivateFileName,
  backupShareFileName,
  backupSlotKey,
  dayFolderFromBackupName,
  extractBackupStamp,
  formatBackupDayFolder,
  isWorkspaceBackupDayFolder,
  isWorkspaceBackupFileName,
  normalizeBackupBaseName,
  normalizeWorkspaceBackup,
  parseWorkspaceBackupKind,
  parseWorkspaceBackupPath,
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
 * The day folder holds exactly one day of runs, so every archive in it counts toward the
 * limit. Archives left in the destination root by older versions are not touched.
 *
 * @param {string} dayDir
 * @param {number} maxPerDay
 */
async function pruneDayBackups(dayDir, maxPerDay) {
  let names = [];
  try {
    names = await fs.readdir(dayDir);
  } catch {
    return;
  }
  const zips = names.filter((name) => isWorkspaceBackupFileName(name));
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
      await fs.rm(path.join(dayDir, name), { force: true }).catch(() => {});
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
    '-mcu=on',
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
  const dayFolder = formatBackupDayFolder(now);
  const dayDir = path.join(destDir, dayFolder);
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

  await fs.mkdir(dayDir, { recursive: true });

  /** @type {string[]} */
  const created = [];
  running = true;
  try {
    /** @type {Array<{ fileName: string, filePath: string, bytes: number }>} */
    const files = [];
    for (const job of jobs) {
      const destZip = path.join(dayDir, job.fileName);
      await zipBackupSource(destZip, job.sourceAbs);
      created.push(destZip);
      const stat = await fs.stat(destZip);
      files.push({
        // Carries the day folder so the settings list and its delete button, which only
        // ever see this name, can find the archive again.
        fileName: `${dayFolder}/${job.fileName}`,
        filePath: destZip,
        bytes: stat.size,
      });
    }
    await pruneDayBackups(dayDir, settings.maxPerDay);
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
      fileName: jobs.map((job) => `${dayFolder}/${job.fileName}`).join('\n'),
      filePath: dayDir,
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
 * Archives from day folders, plus any left in the destination root by versions that
 * wrote them flat.
 *
 * @param {string} destDir
 * @returns {Promise<Array<{ fileName: string, filePath: string }>>}
 */
async function collectBackupArchives(destDir) {
  let entries = [];
  try {
    entries = await fs.readdir(destDir, { withFileTypes: true });
  } catch {
    return [];
  }

  /** @type {Array<{ fileName: string, filePath: string }>} */
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      if (isWorkspaceBackupFileName(entry.name)) {
        found.push({ fileName: entry.name, filePath: path.join(destDir, entry.name) });
      }
      continue;
    }
    if (!isWorkspaceBackupDayFolder(entry.name)) continue;

    let dayNames = [];
    try {
      dayNames = await fs.readdir(path.join(destDir, entry.name));
    } catch {
      continue;
    }
    for (const name of dayNames) {
      if (!isWorkspaceBackupFileName(name)) continue;
      found.push({
        fileName: `${entry.name}/${name}`,
        filePath: path.join(destDir, entry.name, name),
      });
    }
  }
  return found;
}

/**
 * @returns {Promise<Array<{ fileName: string, filePath: string, bytes: number, at: string }>>}
 */
export async function listWorkspaceBackups() {
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) return [];
  const destDir = assertBackupDestAllowed(settings.destPath);

  /** @type {Array<{ fileName: string, filePath: string, bytes: number, at: string }>} */
  const items = [];
  for (const archive of await collectBackupArchives(destDir)) {
    try {
      const stat = await fs.stat(archive.filePath);
      if (!stat.isFile()) continue;
      const parsed = parseWorkspaceBackupPath(archive.fileName);
      items.push({
        fileName: parsed
          ? parsed.dayFolder
            ? `${parsed.dayFolder}/${parsed.fileName}`
            : parsed.fileName
          : archive.fileName,
        filePath: archive.filePath,
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
 * @param {string} dayDir
 */
async function removeEmptyDayFolder(dayDir) {
  try {
    const names = await fs.readdir(dayDir);
    if (names.length === 0) await fs.rmdir(dayDir);
  } catch {
    // leave the folder rather than fail the delete that already succeeded
  }
}

/**
 * @param {string} fileName `YYYYMMDD/NAS4USB_백업_….zip`, or a bare name for older archives
 */
async function resolveBackupArchive(fileName) {
  const parsed = parseWorkspaceBackupPath(fileName);
  if (!parsed) {
    throw new Error('백업 파일이 아닙니다.');
  }
  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) {
    throw new Error('백업 폴더를 먼저 지정해 주세요.');
  }
  const destDir = assertBackupDestAllowed(settings.destPath);
  const dayDir = parsed.dayFolder ? path.join(destDir, parsed.dayFolder) : destDir;
  const destZip = path.join(dayDir, parsed.fileName);
  if (!isEqualOrInside(destZip, destDir)) {
    throw new Error('잘못된 백업 파일입니다.');
  }
  return { destDir, dayDir, destZip, parsed };
}

/**
 * @param {string} zipPath
 * @returns {Promise<string[]>}
 */
async function listZipTopLevelNames(zipPath) {
  const output = await sevenZipMin.cmd(['l', '-slt', zipPath]);
  const text = String(output ?? '');
  const body = text.includes('----------') ? text.slice(text.indexOf('----------') + 10) : text;
  const names = new Set();
  const archiveBase = normalizeBackupBaseName(zipPath);
  for (const match of body.matchAll(/^Path = (.+)$/gm)) {
    const entry = match[1].trim().replace(/\\/g, '/');
    if (!entry || normalizeBackupBaseName(entry) === archiveBase) continue;
    const top = repairZipEntryName(entry.split('/').filter(Boolean)[0] ?? '');
    if (!top || top === '__MACOSX' || top === '.DS_Store') continue;
    names.add(top);
  }
  return [...names];
}

/**
 * @param {string[]} tops
 * @returns {{ kind: 'share' | 'private' | 'legacy', userFolder: string | null } | null}
 */
function guessKindFromZipTops(tops) {
  const names = tops.map((item) => String(item).normalize('NFC'));
  const set = new Set(names);
  if (set.has('manifest.json')) return null;
  if (
    (set.has('share') || set.has(SHARED_FOLDER)) &&
    (set.has('private') || set.has(HOMES_FOLDER))
  ) {
    return { kind: 'legacy', userFolder: null };
  }
  if (set.has('share') || set.has(SHARED_FOLDER)) {
    return { kind: 'share', userFolder: null };
  }
  if (set.has('private') || set.has(HOMES_FOLDER)) {
    return { kind: 'legacy', userFolder: null };
  }
  if (names.length === 1 && names[0]) {
    return { kind: 'private', userFolder: names[0] };
  }
  return null;
}

/**
 * @param {{ kind: 'share' | 'private' | 'legacy', userFolder: string | null }} kind
 */
function officialBackupFileName(kind, date = new Date()) {
  if (kind.kind === 'share') return backupShareFileName(date);
  if (kind.kind === 'private') return backupPrivateFileName(kind.userFolder, date);
  return backupFileName(date);
}

/**
 * @param {string} extractRoot
 */
async function listExtractTops(extractRoot) {
  const entries = await fs.readdir(extractRoot, { withFileTypes: true });
  return entries
    .map((entry) => entry.name)
    .filter((name) => name !== '__MACOSX' && name !== '.DS_Store')
    .map((name) => name.normalize('NFC'));
}

/**
 * @param {string} extractRoot
 * @param {string} folderName
 */
function findExtractedFolder(extractRoot, folderName) {
  return fs.readdir(extractRoot).then((names) => {
    const match = names.find((name) => name.normalize('NFC') === folderName);
    return match ? path.join(extractRoot, match) : null;
  });
}

/**
 * @param {string} from
 * @param {string} to
 */
async function copyTreeInto(from, to) {
  await fs.mkdir(to, { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

/**
 * @param {{ kind: 'share' | 'private' | 'legacy', userFolder: string | null }} kind
 * @param {string} zipPath
 */
async function extractWorkspaceBackup(kind, zipPath) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nas4usb-restore-'));
  try {
    await sevenZipMin.cmd(['x', zipPath, `-o${tmp}`, '-y', '-aoa']);
    await repairExtractedNameTree(tmp);
    const tops = await listExtractTops(tmp);
    const shareFrom =
      (await findExtractedFolder(tmp, 'share')) || (await findExtractedFolder(tmp, SHARED_FOLDER));
    const privateFrom =
      (await findExtractedFolder(tmp, 'private')) || (await findExtractedFolder(tmp, HOMES_FOLDER));

    if (shareFrom) {
      await repairExtractedNameTree(getDataRoot());
      await copyTreeInto(shareFrom, getDataRoot());
      await repairExtractedNameTree(getDataRoot());
    }
    if (privateFrom) {
      await repairExtractedNameTree(getHomesRoot());
      await copyTreeInto(privateFrom, getHomesRoot());
      await repairExtractedNameTree(getHomesRoot());
    }
    if (shareFrom || privateFrom) return;

    if (kind.kind === 'private') {
      const user = kind.userFolder;
      let userFrom = user ? await findExtractedFolder(tmp, user) : null;
      if (!userFrom && tops.length === 1) {
        userFrom = await findExtractedFolder(tmp, tops[0]);
      }
      if (!userFrom) {
        throw new Error('개인폴더 백업에서 사용자 폴더를 찾지 못했습니다.');
      }
      const destUser = path.join(getHomesRoot(), user || path.basename(userFrom));
      await repairExtractedNameTree(destUser);
      await copyTreeInto(userFrom, destUser);
      await repairExtractedNameTree(destUser);
      return;
    }

    await repairExtractedNameTree(getDataRoot());
    await copyTreeInto(tmp, getDataRoot());
    await repairExtractedNameTree(getDataRoot());
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Copy an external NAS4USB document backup ZIP into the configured backup folder.
 * @param {string} zipPath
 */
export async function importWorkspaceBackup(zipPath) {
  const source = path.resolve(String(zipPath ?? '').trim());
  if (!source) {
    throw new Error('가져올 백업 파일을 선택해 주세요.');
  }
  const base = normalizeBackupBaseName(source);
  if (isPcSettingsBackupFileName(base)) {
    throw new Error(
      '이 파일은 PC 설정 백업입니다. 백업 관리 위쪽 「PC 설정 (이사)」의 설정 가져오기를 사용하세요.',
    );
  }

  let destName = base;
  if (!isWorkspaceBackupFileName(base)) {
    const tops = await listZipTopLevelNames(source);
    const guessed = guessKindFromZipTops(tops);
    if (!guessed) {
      throw new Error(
        'NAS4USB 문서 백업 ZIP이 아닙니다. NAS4USB_백업_share_… / NAS4USB_백업_private_… 파일이거나, 공유폴더(share)·개인폴더가 들어 있는 ZIP이어야 합니다.',
      );
    }
    destName = officialBackupFileName(guessed);
  }

  const settings = normalizeWorkspaceBackup((await getAppSettings()).workspaceBackup);
  if (!settings.destPath) {
    throw new Error('백업 폴더를 먼저 지정해 주세요.');
  }
  const destDir = assertBackupDestAllowed(settings.destPath);
  if (isEqualOrInside(source, destDir) && normalizeBackupBaseName(source) === destName) {
    throw new Error('이미 백업 폴더에 있는 파일입니다.');
  }
  try {
    const stat = await fs.stat(source);
    if (!stat.isFile()) throw new Error('백업 파일을 찾을 수 없습니다.');
  } catch (error) {
    if (error instanceof Error && error.message === '백업 파일을 찾을 수 없습니다.') throw error;
    throw new Error('백업 파일을 찾을 수 없습니다.');
  }

  const dayFolder = dayFolderFromBackupName(destName);
  const dayDir = path.join(destDir, dayFolder);
  const destZip = path.join(dayDir, destName);
  if (!isEqualOrInside(destZip, destDir)) {
    throw new Error('잘못된 백업 파일입니다.');
  }
  await fs.mkdir(dayDir, { recursive: true });
  await fs.copyFile(source, destZip);
  return listWorkspaceBackups();
}

/**
 * Extract one listed archive back onto share or private.
 * @param {string} fileName
 */
export async function restoreWorkspaceBackup(fileName) {
  if (running) {
    throw new Error('이미 백업이 진행 중입니다.');
  }
  const { destZip } = await resolveBackupArchive(fileName);
  const kind = parseWorkspaceBackupKind(fileName);
  if (!kind) {
    throw new Error('백업 파일이 아닙니다.');
  }
  try {
    const stat = await fs.stat(destZip);
    if (!stat.isFile()) throw new Error('백업 파일을 찾을 수 없습니다.');
  } catch (error) {
    if (error instanceof Error && error.message === '백업 파일을 찾을 수 없습니다.') throw error;
    throw new Error('백업 파일을 찾을 수 없습니다.');
  }

  running = true;
  try {
    await extractWorkspaceBackup(kind, destZip);
    return {
      fileName,
      kind: kind.kind,
      userFolder: kind.userFolder,
    };
  } finally {
    running = false;
  }
}

/**
 * @param {string} fileName `YYYYMMDD/NAS4USB_백업_….zip`, or a bare name for older archives
 */
export async function deleteWorkspaceBackup(fileName) {
  const { destZip, dayDir, parsed } = await resolveBackupArchive(fileName);
  await fs.rm(destZip);
  if (parsed.dayFolder) await removeEmptyDayFolder(dayDir);

  const relativeName = parsed.dayFolder
    ? `${parsed.dayFolder}/${parsed.fileName}`
    : parsed.fileName;
  if (
    lastResult?.fileName === relativeName ||
    lastResult?.files?.some((item) => item.fileName === relativeName)
  ) {
    lastResult = null;
    const state = await loadState();
    state.last = null;
    await saveState(state);
  }
  return listWorkspaceBackups();
}

/**
 * Delete every archive that belongs to one calendar day (`YYYYMMDD`, or '' for undated).
 * @param {string} dayKey
 */
export async function deleteWorkspaceBackupsByDay(dayKey) {
  const key = String(dayKey ?? '').trim();
  if (key && !isWorkspaceBackupDayFolder(key)) {
    throw new Error('잘못된 백업 일자입니다.');
  }
  const archives = await listWorkspaceBackups();
  const targets = archives.filter((item) => backupArchiveDayKey(item.fileName, item.at) === key);
  for (const item of targets) {
    await deleteWorkspaceBackup(item.fileName);
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
