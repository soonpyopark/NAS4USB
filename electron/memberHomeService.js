import fs from 'node:fs/promises';
import path from 'node:path';
import { getHomesRoot } from './appContext.js';
import {
  HOMES_FOLDER,
  memberHomeRelativePath,
  sanitizeLoginIdForHomeFolder,
} from '../shared/memberHomes.js';
import { listMembers } from './membersService.js';

/**
 * @param {string} loginId
 * @returns {Promise<{ ok: boolean, relativePath: string | null, created: boolean }>}
 */
export async function ensureMemberHome(loginId) {
  const relativePath = memberHomeRelativePath(loginId);
  const folder = sanitizeLoginIdForHomeFolder(loginId);
  if (!relativePath || !folder) {
    return { ok: false, relativePath: null, created: false };
  }

  const absolute = path.join(getHomesRoot(), folder);
  let created = false;
  try {
    await fs.access(absolute);
  } catch {
    await fs.mkdir(absolute, { recursive: true });
    created = true;
  }
  return { ok: true, relativePath, created };
}

/**
 * @param {string} relativePath
 */
async function purgeHomeRooms(relativePath) {
  try {
    const { purgeYjsRoomsForPathTree } = await import('./yjsRoomTree.js');
    await purgeYjsRoomsForPathTree(relativePath).catch(() => {});
  } catch {
    // optional cleanup
  }
}

/**
 * Remove personal folders under `private/` that do not match any member loginId.
 * Inactive members still keep their folder; only true orphans are removed.
 *
 * @param {string} [portableRoot]
 * @param {{ loginIds?: Iterable<string> }} [options] known members (skips listMembers)
 * @returns {Promise<{ deleted: string[] }>}
 */
export async function pruneOrphanMemberHomes(portableRoot, options = {}) {
  const homesRoot = getHomesRoot();
  await fs.mkdir(homesRoot, { recursive: true });

  /** @type {Set<string>} */
  const keep = new Set();
  if (options.loginIds) {
    for (const loginId of options.loginIds) {
      const folder = sanitizeLoginIdForHomeFolder(loginId);
      if (folder) keep.add(folder.toLowerCase());
    }
  } else {
    const listed = await listMembers(portableRoot);
    const members = Array.isArray(listed) ? listed : listed?.members ?? [];
    for (const member of members) {
      const loginId = String(member?.loginId ?? '').trim();
      const folder = sanitizeLoginIdForHomeFolder(loginId);
      if (folder) keep.add(folder.toLowerCase());
    }
  }

  /** @type {string[]} */
  const deleted = [];
  const entries = await fs.readdir(homesRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (!name || name === '.' || name === '..') continue;
    if (keep.has(name.toLowerCase())) continue;

    const absolute = path.join(homesRoot, name);
    const relativePath = `${HOMES_FOLDER}/${name}`;
    await purgeHomeRooms(relativePath);
    await fs.rm(absolute, { recursive: true, force: true });
    deleted.push(relativePath);
    console.log(`[members] removed orphan home: ${relativePath}`);
  }

  return { deleted };
}

/**
 * Ensure a home folder for every active member (not guests), then drop orphans.
 * @param {string} [portableRoot]
 */
export async function ensureAllMemberHomes(portableRoot) {
  await fs.mkdir(getHomesRoot(), { recursive: true });
  const listed = await listMembers(portableRoot);
  const members = Array.isArray(listed) ? listed : listed?.members ?? [];
  /** @type {string[]} */
  const created = [];
  /** @type {string[]} */
  const keepLoginIds = [];
  for (const member of members) {
    const loginId = String(member?.loginId ?? '').trim();
    if (!loginId || !sanitizeLoginIdForHomeFolder(loginId)) continue;
    keepLoginIds.push(loginId);
    if (!member?.active) continue;
    const result = await ensureMemberHome(loginId);
    if (result.created && result.relativePath) created.push(result.relativePath);
  }
  const { deleted } = await pruneOrphanMemberHomes(portableRoot, {
    loginIds: keepLoginIds,
  });
  return { created, deleted };
}

/**
 * Permanently delete a member's personal folder and all contents.
 * @param {string} loginId
 * @returns {Promise<{ ok: boolean, relativePath: string | null, deleted: boolean }>}
 */
export async function deleteMemberHome(loginId) {
  const relativePath = memberHomeRelativePath(loginId);
  const folder = sanitizeLoginIdForHomeFolder(loginId);
  if (!relativePath || !folder) {
    return { ok: false, relativePath: null, deleted: false };
  }

  const absolute = path.join(getHomesRoot(), folder);
  try {
    await fs.access(absolute);
  } catch {
    return { ok: true, relativePath, deleted: false };
  }

  await purgeHomeRooms(relativePath);
  await fs.rm(absolute, { recursive: true, force: true });
  return { ok: true, relativePath, deleted: true };
}

/**
 * When a member's loginId changes, rename their home folder if possible.
 * @param {string} fromLoginId
 * @param {string} toLoginId
 */
export async function renameMemberHomeIfNeeded(fromLoginId, toLoginId) {
  const fromPath = memberHomeRelativePath(fromLoginId);
  const toPath = memberHomeRelativePath(toLoginId);
  const fromFolder = sanitizeLoginIdForHomeFolder(fromLoginId);
  const toFolder = sanitizeLoginIdForHomeFolder(toLoginId);
  if (!fromPath || !toPath || !fromFolder || !toFolder || fromPath === toPath) {
    return { renamed: false };
  }

  const homesRoot = getHomesRoot();
  const fromAbs = path.join(homesRoot, fromFolder);
  const toAbs = path.join(homesRoot, toFolder);
  try {
    await fs.access(fromAbs);
  } catch {
    return { renamed: false };
  }
  try {
    await fs.access(toAbs);
    return { renamed: false, reason: 'destination-exists' };
  } catch {
    // ok
  }
  await fs.mkdir(homesRoot, { recursive: true });
  await fs.rename(fromAbs, toAbs);
  return { renamed: true, fromPath, toPath };
}
