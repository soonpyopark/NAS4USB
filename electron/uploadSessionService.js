import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTempPath } from './appContext.js';
import { copyAbsoluteToRelative, replaceFileFromAbsolute } from './fsService.js';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PART_BYTES,
  UPLOAD_SESSION_TTL_MS,
} from '../shared/chunkedUpload.js';

/**
 * @typedef {{
 *   uploadId: string,
 *   relativePath: string,
 *   size: number,
 *   received: number,
 *   tempPath: string,
 *   createdAt: number,
 *   touchedAt: number,
 * }} UploadSession
 */

/** @type {Map<string, UploadSession>} */
const sessions = new Map();

function uploadsDir() {
  return path.join(getTempPath(), 'uploads');
}

/**
 * @param {string} uploadId
 * @returns {UploadSession}
 */
function requireSession(uploadId) {
  const session = sessions.get(String(uploadId ?? ''));
  if (!session) {
    throw new Error('업로드 세션이 없거나 만료되었습니다. 다시 올려 주세요.');
  }
  if (Date.now() - session.touchedAt > UPLOAD_SESSION_TTL_MS) {
    void abortUpload(session.uploadId);
    throw new Error('업로드 세션이 만료되었습니다. 다시 올려 주세요.');
  }
  return session;
}

async function removeTemp(tempPath) {
  try {
    await fs.unlink(tempPath);
  } catch {
    // already gone
  }
}

export async function sweepExpiredUploads() {
  const now = Date.now();
  for (const session of [...sessions.values()]) {
    if (now - session.touchedAt > UPLOAD_SESSION_TTL_MS) {
      sessions.delete(session.uploadId);
      await removeTemp(session.tempPath);
    }
  }
}

/**
 * @param {{ relativePath: string, size?: number }} options
 */
export async function initUpload({ relativePath, size = 0 }) {
  await sweepExpiredUploads();
  const declared = Number(size) || 0;
  if (declared < 0 || declared > MAX_UPLOAD_BYTES) {
    throw new Error('업로드할 수 있는 파일 크기를 넘었습니다.');
  }

  const uploadId = crypto.randomUUID();
  const dir = uploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `${uploadId}.part`);
  await fs.writeFile(tempPath, Buffer.alloc(0));

  const now = Date.now();
  sessions.set(uploadId, {
    uploadId,
    relativePath: String(relativePath ?? ''),
    size: declared,
    received: 0,
    tempPath,
    createdAt: now,
    touchedAt: now,
  });

  return { uploadId, received: 0, size: declared };
}

/**
 * @param {string} uploadId
 * @param {number} offset
 * @param {Buffer | Uint8Array} data
 */
export async function writeUploadPart(uploadId, offset, data) {
  const session = requireSession(uploadId);
  const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
  if (chunk.length > MAX_UPLOAD_PART_BYTES) {
    throw new Error('업로드 조각이 너무 큽니다.');
  }

  const start = Number(offset);
  if (!Number.isFinite(start) || start < 0) {
    throw new Error('업로드 위치가 올바르지 않습니다.');
  }
  if (start + chunk.length <= session.received) {
    session.touchedAt = Date.now();
    return { uploadId: session.uploadId, received: session.received, size: session.size };
  }
  if (start !== session.received) {
    throw new Error(`업로드 위치가 맞지 않습니다. (${start} ≠ ${session.received})`);
  }
  if (session.size && session.received + chunk.length > session.size) {
    throw new Error('업로드 크기가 선언한 용량을 초과합니다.');
  }

  const handle = await fs.open(session.tempPath, 'a');
  try {
    await handle.write(chunk);
  } finally {
    await handle.close();
  }

  session.received += chunk.length;
  session.touchedAt = Date.now();
  return { uploadId: session.uploadId, received: session.received, size: session.size };
}

/**
 * @param {string} uploadId
 */
export async function commitUpload(uploadId) {
  const session = requireSession(uploadId);
  if (session.size && session.received !== session.size) {
    throw new Error(`업로드가 끝나지 않았습니다. (${session.received}/${session.size})`);
  }
  await replaceFileFromAbsolute(session.relativePath, session.tempPath);
  sessions.delete(session.uploadId);
  return { ok: true, path: session.relativePath, size: session.received };
}

/**
 * @param {string} uploadId
 */
export async function abortUpload(uploadId) {
  const session = sessions.get(String(uploadId ?? ''));
  if (!session) return { ok: true };
  sessions.delete(session.uploadId);
  await removeTemp(session.tempPath);
  return { ok: true };
}

/**
 * Copy a local host file into the workspace (Electron file.path).
 * @param {string} relativePath
 * @param {string} sourceAbsolute
 */
export async function importLocalFile(relativePath, sourceAbsolute) {
  const source = String(sourceAbsolute ?? '').trim();
  if (!source) {
    throw new Error('가져올 파일 경로가 없습니다.');
  }
  const stat = await fs.stat(source);
  if (!stat.isFile()) {
    throw new Error('파일이 아닙니다.');
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error('업로드할 수 있는 파일 크기를 넘었습니다.');
  }
  return copyAbsoluteToRelative(relativePath, source);
}
