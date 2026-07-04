import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** @type {Map<string, { relativePath: string, sessionDir: string, workingPath: string, dirty: boolean }>} */
const sessions = new Map();

function getSessionsRoot(tempRoot) {
  return path.join(tempRoot, 'educowork', 'sessions');
}

export async function openWorkspace(relativePath, dataRoot, tempRoot) {
  const sessionId = crypto.randomUUID();
  const sessionDir = path.join(getSessionsRoot(tempRoot), sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const fileName = path.basename(relativePath);
  const sourcePath = path.join(dataRoot, relativePath);
  const workingPath = path.join(sessionDir, fileName);

  try {
    await fs.copyFile(sourcePath, workingPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      await fs.writeFile(workingPath, '');
    } else {
      throw error;
    }
  }

  await fs.writeFile(
    path.join(sessionDir, '.meta.json'),
    JSON.stringify({ relativePath, fileName, openedAt: new Date().toISOString() }),
    'utf8',
  );

  sessions.set(sessionId, { relativePath, sessionDir, workingPath, dirty: false });

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
  const session = getSession(sessionId);
  const destination = path.join(dataRoot, session.relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(session.workingPath, destination);
  session.dirty = false;
  return { relativePath: session.relativePath };
}

export async function renameWorkspace(sessionId, newRelativePath, dataRoot) {
  const session = getSession(sessionId);
  const normalized = newRelativePath.replace(/\\/g, '/');

  if (session.relativePath === normalized) {
    return {
      relativePath: session.relativePath,
      fileName: path.basename(session.relativePath),
    };
  }

  const oldDestination = path.join(dataRoot, session.relativePath);
  const newDestination = path.join(dataRoot, normalized);
  await fs.mkdir(path.dirname(newDestination), { recursive: true });
  await fs.copyFile(session.workingPath, newDestination);

  try {
    await fs.unlink(oldDestination);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  const newFileName = path.basename(normalized);
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
