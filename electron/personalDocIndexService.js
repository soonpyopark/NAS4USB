import fs from 'node:fs/promises';
import path from 'node:path';
import { getWorkspaceRoot, resolvePortablePath } from './appContext.js';
import { getFileAccessMap } from './fileAccessService.js';
import { getEffectiveAccessPermissions } from './settingsService.js';
import { canViewFileEntry } from '../shared/fileAccessVisibility.js';
import { SHARED_FOLDER } from '../shared/constants.js';
import { toCanonicalWorkspacePath } from '../shared/workspacePaths.js';
import {
  getHomeOwnerFolderFromPath,
  isUnderHomesFolder,
  memberHomeRelativePath,
  sanitizeLoginIdForHomeFolder,
} from '../shared/memberHomes.js';
import {
  isPersonalDocIndexFileName,
  isPersonalDocIndexSkipPath,
  PERSONAL_DOC_INDEX_DIR,
  PERSONAL_DOC_INDEX_FORMAT,
  PERSONAL_DOC_SEARCH_LIMIT,
  SHARE_DOC_INDEX_KEY,
} from '../shared/personalDocIndex.js';
import { PersonalDocIndexDatabase } from './personalDocIndex/database.js';
import { compileQuery } from './personalDocIndex/query.js';
import {
  buildPersonalDocIndex,
  reindexOneFile,
  toSourcePath,
} from './personalDocIndex/indexer.js';

/** @type {Map<string, PersonalDocIndexDatabase>} */
const databases = new Map();

/** @type {Map<string, { cancel: boolean, running: Promise<unknown> | null, starting: boolean, progress: Record<string, unknown> | null }>} */
const jobs = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const refreshTimers = new Map();

function requireLoginId(auth) {
  const loginId = String(auth?.loginId ?? '').trim();
  if (!auth?.isLoggedIn || !loginId) {
    const error = new Error('문서 검색은 로그인 후 사용할 수 있습니다.');
    error.statusCode = 401;
    throw error;
  }
  return loginId;
}

function ownerKey(loginId) {
  return sanitizeLoginIdForHomeFolder(loginId);
}

function indexDbPath(key) {
  if (!key) {
    throw new Error('색인 저장 위치를 확인할 수 없습니다.');
  }
  return path.join(getWorkspaceRoot(), ...PERSONAL_DOC_INDEX_DIR.split('/'), `${key}.db`);
}

function homeAbsolute(loginId) {
  const relative = memberHomeRelativePath(loginId);
  if (!relative) {
    throw new Error('개인폴더를 확인할 수 없습니다.');
  }
  return resolvePortablePath(relative);
}

function shareAbsolute() {
  return resolvePortablePath(SHARED_FOLDER);
}

function isShareWorkspacePath(relativePath) {
  const canonical = toCanonicalWorkspacePath(relativePath);
  return canonical === SHARED_FOLDER || canonical.startsWith(`${SHARED_FOLDER}/`);
}

function getJobState(key) {
  let state = jobs.get(key);
  if (!state) {
    state = { cancel: false, running: null, starting: false, progress: null };
    jobs.set(key, state);
  }
  return state;
}

/**
 * @param {string} key
 */
async function openDatabaseByKey(key, { reset = false } = {}) {
  const existing = databases.get(key);
  if (existing && !reset) return existing;

  existing?.close();
  const database = new PersonalDocIndexDatabase(indexDbPath(key));
  await database.open({ reset });
  databases.set(key, database);
  return database;
}

function workspaceRelativeFromHome(loginId, sourcePath) {
  const home = memberHomeRelativePath(loginId);
  const normalized = String(sourcePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!home) return normalized;
  return normalized ? `${home}/${normalized}` : home;
}

function workspaceRelativeFromShare(sourcePath) {
  const normalized = String(sourcePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized ? `${SHARED_FOLDER}/${normalized}` : SHARED_FOLDER;
}

/**
 * @param {string} key
 */
async function readScopeStatus(key) {
  const database = await openDatabaseByKey(key);
  const files = database.countFiles();
  const job = database.getJob();
  const state = getJobState(key);
  const formatOk = database.getFormatVersion() === PERSONAL_DOC_INDEX_FORMAT;
  return {
    ready: Boolean(job) && formatOk,
    status: state.running ? 'running' : job?.status ?? 'idle',
    rowCount: database.countRows(),
    folderCount: database.countFolders(),
    fileCount: files.done,
    errorCount: files.error,
    progress: state.progress,
    running: Boolean(state.running),
    job: job
      ? {
          status: job.status,
          startedAt: job.started_at,
          updatedAt: job.updated_at,
        }
      : null,
  };
}

function laterIso(left, right) {
  const a = left ? Date.parse(left) : NaN;
  const b = right ? Date.parse(right) : NaN;
  if (Number.isNaN(a)) return right || '';
  if (Number.isNaN(b)) return left || '';
  return a >= b ? left : right;
}

function mergeProgress(personal, share) {
  if (personal.running && share.running) {
    return {
      current: Number(personal.progress?.current ?? 0) + Number(share.progress?.current ?? 0),
      total: Number(personal.progress?.total ?? 0) + Number(share.progress?.total ?? 0),
      fileName: share.progress?.fileName || personal.progress?.fileName || '',
    };
  }
  if (share.running) return share.progress;
  if (personal.running) return personal.progress;
  return personal.progress || share.progress;
}

/**
 * @param {{ isLoggedIn?: boolean, loginId?: string | null }} auth
 */
export async function getPersonalDocIndexStatus(auth) {
  const loginId = requireLoginId(auth);
  const personal = await readScopeStatus(ownerKey(loginId));
  const share = await readScopeStatus(SHARE_DOC_INDEX_KEY);
  const running = personal.running || share.running;
  return {
    loginId,
    ready: personal.ready && share.ready,
    status: running ? 'running' : personal.status === 'done' && share.status === 'done' ? 'done' : personal.status,
    rowCount: personal.rowCount + share.rowCount,
    fileCount: personal.fileCount + share.fileCount,
    errorCount: personal.errorCount + share.errorCount,
    progress: mergeProgress(personal, share),
    builtAt: laterIso(personal.job?.updatedAt, share.job?.updatedAt),
    job: {
      status: running ? 'running' : 'done',
      startedAt: personal.job?.startedAt || share.job?.startedAt,
      updatedAt: laterIso(personal.job?.updatedAt, share.job?.updatedAt),
    },
    scopes: { personal, share },
  };
}

function isoFromIndexMtime(mtime) {
  const value = Number(mtime);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function mapRows(rows, toRelativePath) {
  return rows.map((row) => ({
    docType: row.doc_type,
    folderPath: row.folder_path || '',
    fileName: row.file_name,
    location: row.location_label,
    content: row.content,
    relativePath: toRelativePath(row.source_path),
    size: Number(row.file_size) || 0,
    modifiedAt: isoFromIndexMtime(row.file_mtime),
  }));
}

/**
 * @param {{ isLoggedIn?: boolean, loginId?: string | null, role?: string | null }} auth
 * @param {string} query
 */
export async function searchPersonalDocIndex(auth, query) {
  const loginId = requireLoginId(auth);
  const compiled = compileQuery(query);
  if (!compiled) {
    return { results: [], truncated: false, query: '' };
  }

  const personalDb = await openDatabaseByKey(ownerKey(loginId));
  const shareDb = await openDatabaseByKey(SHARE_DOC_INDEX_KEY);
  const limit = PERSONAL_DOC_SEARCH_LIMIT + 1;
  const personalRows = personalDb.search(compiled.sql, compiled.params, limit);
  const shareRows = shareDb.search(compiled.sql, compiled.params, limit);

  const [accessMap, permissions] = await Promise.all([
    getFileAccessMap(),
    getEffectiveAccessPermissions(auth),
  ]);
  const elevated = Boolean(permissions?.write) || auth?.role === 'super_admin';
  const personalHits = mapRows(personalRows, (sourcePath) => workspaceRelativeFromHome(loginId, sourcePath));
  const shareHits = mapRows(shareRows, workspaceRelativeFromShare).filter((hit) =>
    canViewFileEntry(hit.relativePath, accessMap, elevated),
  );

  const merged = [...personalHits, ...shareHits];
  const truncated =
    personalRows.length > PERSONAL_DOC_SEARCH_LIMIT ||
    shareRows.length > PERSONAL_DOC_SEARCH_LIMIT ||
    merged.length > PERSONAL_DOC_SEARCH_LIMIT;
  return {
    query: String(query ?? '').trim(),
    truncated,
    results: merged.slice(0, PERSONAL_DOC_SEARCH_LIMIT),
  };
}

/**
 * @param {string} key
 * @param {string} root
 * @param {{ reset?: boolean }} [options]
 */
async function startScopeIndex(key, root, { reset = false } = {}) {
  const state = getJobState(key);
  if (state.starting) return;
  if (state.running) {
    if (!reset) return;
    state.cancel = true;
    try {
      await state.running;
    } catch {
      // previous run was cancelled or failed
    }
    if (state.running || state.starting) return;
  }

  state.starting = true;
  state.cancel = false;
  state.progress = { current: 0, total: 0, percent: 0, fileName: '' };
  const current = await openDatabaseByKey(key, { reset: false });
  const stale = current.getFormatVersion() !== PERSONAL_DOC_INDEX_FORMAT;
  const database = await openDatabaseByKey(key, { reset: reset || stale });
  database.setFormatVersion(PERSONAL_DOC_INDEX_FORMAT);
  database.save();

  try {
    await fs.mkdir(root, { recursive: true });
  } catch {
    // indexing empty folder is fine
  }

  try {
    state.running = buildPersonalDocIndex({
      root,
      database,
      mode: reset || stale ? 'reset' : 'resume',
      shouldCancel: () => state.cancel,
      onProgress: (progress) => {
        state.progress = progress;
      },
    })
      .catch((error) => {
        state.progress = {
          ...(state.progress ?? {}),
          error: error instanceof Error ? error.message : String(error),
          done: true,
        };
      })
      .finally(() => {
        state.running = null;
      });
  } finally {
    state.starting = false;
  }
}

/**
 * @param {{ isLoggedIn?: boolean, loginId?: string | null }} auth
 * @param {{ reset?: boolean }} [options]
 */
export async function startPersonalDocIndex(auth, { reset = false } = {}) {
  const loginId = requireLoginId(auth);
  await Promise.all([
    startScopeIndex(ownerKey(loginId), homeAbsolute(loginId), { reset }),
    startScopeIndex(SHARE_DOC_INDEX_KEY, shareAbsolute(), { reset }),
  ]);
  return getPersonalDocIndexStatus(auth);
}

/**
 * @param {{ isLoggedIn?: boolean, loginId?: string | null }} auth
 */
export async function stopPersonalDocIndex(auth) {
  const loginId = requireLoginId(auth);
  getJobState(ownerKey(loginId)).cancel = true;
  getJobState(SHARE_DOC_INDEX_KEY).cancel = true;
  return getPersonalDocIndexStatus(auth);
}

/**
 * @param {string} key
 * @param {() => Promise<void>} work
 */
function scheduleScopeRefresh(key, work) {
  const previous = refreshTimers.get(key);
  if (previous) clearTimeout(previous);
  refreshTimers.set(
    key,
    setTimeout(() => {
      refreshTimers.delete(key);
      work().catch(() => {});
    }, 1500),
  );
}

/**
 * @param {string | string[]} paths
 */
export function schedulePersonalDocIndexRefresh(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  const byOwner = new Map();
  const sharePaths = [];

  for (const relativePath of list) {
    const normalized = String(relativePath ?? '').replace(/\\/g, '/');
    if (!normalized || isPersonalDocIndexSkipPath(normalized)) continue;
    if (isShareWorkspacePath(normalized)) {
      sharePaths.push(toCanonicalWorkspacePath(normalized));
      continue;
    }
    if (!isUnderHomesFolder(normalized)) continue;
    const owner = getHomeOwnerFolderFromPath(normalized);
    if (!owner) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(normalized);
  }

  for (const [owner, ownerPaths] of byOwner) {
    scheduleScopeRefresh(owner, () => refreshOwnerPaths(owner, ownerPaths));
  }
  if (sharePaths.length) {
    scheduleScopeRefresh(SHARE_DOC_INDEX_KEY, () => refreshSharePaths(sharePaths));
  }
}

/**
 * @param {string} owner
 * @param {string[]} relativePaths
 */
async function refreshOwnerPaths(owner, relativePaths) {
  const state = getJobState(owner);
  if (state.running) return;

  const database = await openDatabaseByKey(owner);
  const root = homeAbsolute(owner);
  const homeRel = memberHomeRelativePath(owner);
  if (!homeRel) return;
  let needResume = false;

  for (const relativePath of relativePaths) {
    let rest = relativePath;
    if (rest.startsWith(`${homeRel}/`)) {
      rest = rest.slice(homeRel.length + 1);
    } else {
      const parts = rest.split('/');
      parts.splice(0, 2);
      rest = parts.join('/');
    }
    if (isPersonalDocIndexSkipPath(rest)) {
      if (rest) {
        database.deleteRecordsBySourcePrefix(rest);
        database.save();
      }
      continue;
    }

    const absolute = rest ? path.join(root, rest) : root;
    let stats = null;
    try {
      stats = await fs.stat(absolute);
    } catch {
      if (rest) {
        if (isPersonalDocIndexFileName(path.basename(rest))) {
          database.deleteRecordsBySource(rest);
        } else {
          database.deleteRecordsBySourcePrefix(rest);
        }
        database.save();
      }
      continue;
    }

    if (stats.isDirectory()) {
      needResume = true;
      continue;
    }

    if (!isPersonalDocIndexFileName(path.basename(absolute))) continue;
    try {
      await reindexOneFile(absolute, root, database);
    } catch (error) {
      database.upsertFile({
        sourcePath: toSourcePath(root, absolute),
        size: stats.size,
        mtime: stats.mtimeMs,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        recordCount: 0,
      });
      database.save();
    }
  }

  if (needResume) {
    await startScopeIndex(owner, root, { reset: false });
  }
}

/**
 * @param {string[]} relativePaths
 */
async function refreshSharePaths(relativePaths) {
  const state = getJobState(SHARE_DOC_INDEX_KEY);
  if (state.running) return;

  const database = await openDatabaseByKey(SHARE_DOC_INDEX_KEY);
  const root = shareAbsolute();
  let needResume = false;

  for (const relativePath of relativePaths) {
    const canonical = toCanonicalWorkspacePath(relativePath);
    const rest =
      canonical === SHARED_FOLDER
        ? ''
        : canonical.startsWith(`${SHARED_FOLDER}/`)
          ? canonical.slice(SHARED_FOLDER.length + 1)
          : '';
    if (isPersonalDocIndexSkipPath(rest) || isPersonalDocIndexSkipPath(canonical)) {
      if (rest) {
        database.deleteRecordsBySourcePrefix(rest);
        database.save();
      }
      continue;
    }
    const absolute = rest ? path.join(root, rest) : root;
    let stats = null;
    try {
      stats = await fs.stat(absolute);
    } catch {
      if (rest) {
        if (isPersonalDocIndexFileName(path.basename(rest))) {
          database.deleteRecordsBySource(rest);
        } else {
          database.deleteRecordsBySourcePrefix(rest);
        }
        database.save();
      }
      continue;
    }

    if (stats.isDirectory()) {
      needResume = true;
      continue;
    }

    if (!isPersonalDocIndexFileName(path.basename(absolute))) continue;
    try {
      await reindexOneFile(absolute, root, database);
    } catch (error) {
      database.upsertFile({
        sourcePath: toSourcePath(root, absolute),
        size: stats.size,
        mtime: stats.mtimeMs,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        recordCount: 0,
      });
      database.save();
    }
  }

  if (needResume) {
    await startScopeIndex(SHARE_DOC_INDEX_KEY, root, { reset: false });
  }
}
