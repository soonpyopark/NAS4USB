import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRenamePreservesExtension } from '../shared/entryNames.js';
import { resolvePortablePath } from './appContext.js';
import { archiveCurrentVersion } from './fileHistoryService.js';

/**
 * @typedef {{
 *   relativePath: string,
 *   sessionDir: string,
 *   workingPath: string,
 *   dirty: boolean,
 *   shareToken?: string,
 * }} WorkspaceSession
 */

/** @type {Map<string, WorkspaceSession>} */
const sessions = new Map();

function getSessionsRoot(tempRoot) {
  return path.join(tempRoot, 'nas4usb', 'sessions');
}

/**
 * @param {string} relativePath
 * @param {string} dataRoot unused — kept for call-site compatibility; paths resolve via workspace model
 * @param {string} tempRoot
 * @param {{ shareToken?: string | null }} [options]
 */
export async function openWorkspace(relativePath, dataRoot, tempRoot, options = {}) {
  void dataRoot;
  const sessionId = crypto.randomUUID();
  const sessionDir = path.join(getSessionsRoot(tempRoot), sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const fileName = path.basename(relativePath);
  const sourcePath = resolvePortablePath(relativePath);
  const workingPath = path.join(sessionDir, fileName);
  const shareToken = String(options.shareToken ?? '').trim() || undefined;

  try {
    await fs.copyFile(sourcePath, workingPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`파일을 찾을 수 없습니다: ${relativePath}`);
    }
    throw error;
  }

  await fs.writeFile(
    path.join(sessionDir, '.meta.json'),
    JSON.stringify({ relativePath, fileName, openedAt: new Date().toISOString() }),
    'utf8',
  );

  sessions.set(sessionId, { relativePath, sessionDir, workingPath, dirty: false, shareToken });

  return { sessionId, fileName };
}

export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Workspace session not found: ${sessionId}`);
  return session;
}

export async function readWorkspaceFile(sessionId) {
  const session = getSession(sessionId);
  const buffer = await fs.readFile(session.workingPath);
  return buffer.toString('base64');
}

export async function writeWorkspaceFile(sessionId, base64) {
  const session = getSession(sessionId);
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(session.workingPath, buffer);
  session.dirty = true;
  return true;
}

export async function commitWorkspace(sessionId, dataRoot) {
  void dataRoot;
  const session = getSession(sessionId);
  const destination = resolvePortablePath(session.relativePath);
  // Archive whatever is currently on disk before it gets overwritten, so it becomes
  // a restorable "이력" entry (no-op for unsupported extensions or first-time saves).
  await archiveCurrentVersion(session.relativePath).catch(() => {});
  const { ensureParentDir } = await import('./fsService.js');
  await ensureParentDir(destination);
  await fs.copyFile(session.workingPath, destination);
  session.dirty = false;
  return { relativePath: session.relativePath };
}

export async function saveWorkspace(sessionId, base64, dataRoot) {
  await writeWorkspaceFile(sessionId, base64);
  return commitWorkspace(sessionId, dataRoot);
}

export async function renameWorkspace(sessionId, newRelativePath, dataRoot) {
  void dataRoot;
  const session = getSession(sessionId);
  const normalized = newRelativePath.replace(/\\/g, '/');

  if (session.relativePath === normalized) {
    return {
      relativePath: session.relativePath,
      fileName: path.basename(session.relativePath),
    };
  }

  const oldDestination = resolvePortablePath(session.relativePath);
  const newDestination = resolvePortablePath(normalized);
  const { ensureParentDir } = await import('./fsService.js');
  await ensureParentDir(newDestination);
  await fs.copyFile(session.workingPath, newDestination);

  try {
    await fs.unlink(oldDestination);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  const newFileName = path.basename(normalized);
  assertRenamePreservesExtension(path.basename(session.relativePath), newFileName, false);
  const newWorkingPath = path.join(session.sessionDir, newFileName);
  if (session.workingPath !== newWorkingPath) {
    await fs.rename(session.workingPath, newWorkingPath);
    session.workingPath = newWorkingPath;
  }

  session.relativePath = normalized;
  session.dirty = false;

  await fs.writeFile(
    path.join(session.sessionDir, '.meta.json'),
    JSON.stringify({
      relativePath: normalized,
      fileName: newFileName,
      openedAt: new Date().toISOString(),
    }),
    'utf8',
  );

  return { relativePath: normalized, fileName: newFileName };
}

export async function closeWorkspace(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  await fs.rm(session.sessionDir, { recursive: true, force: true });
  sessions.delete(sessionId);
  return true;
}

export async function cleanupAllSessions(tempRoot) {
  const root = getSessionsRoot(tempRoot);
  sessions.clear();
  await fs.rm(root, { recursive: true, force: true });
}
