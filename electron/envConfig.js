import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DATA_DIR, DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW } from '../shared/constants.js';

/**
 * @param {string} envDir
 * @returns {Record<string, string>}
 */
export function readEnvFile(envDir) {
  const envPath = path.join(envDir, '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  /** @type {Record<string, string>} */
  const vars = {};
  const content = fs.readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }

  return vars;
}

/**
 * Raw `.env` server values, before the stored 서버 관리 settings are layered on top.
 *
 * @param {string} portableRoot
 * @param {boolean} isDev
 */
export function readServerEnvRaw(portableRoot, isDev) {
  const fileEnv = readEnvFile(portableRoot);
  const hostname =
    fileEnv.HOSTNAME ?? process.env.HOSTNAME ?? (isDev ? '0.0.0.0' : '127.0.0.1');

  return {
    portRaw: fileEnv.PORT ?? process.env.PORT ?? null,
    hostname: hostname || '127.0.0.1',
  };
}

/**
 * Resolve configured path string (settings / env) to an absolute path, or null.
 * @param {string} portableRoot
 * @param {string | null | undefined} settingsDataRoot
 * @returns {string | null}
 */
function readConfiguredWorkspacePath(portableRoot, settingsDataRoot = null) {
  const fromSettings =
    settingsDataRoot != null && String(settingsDataRoot).trim()
      ? String(settingsDataRoot).trim()
      : null;
  const fileEnv = readEnvFile(portableRoot);
  const configured =
    fromSettings ??
    fileEnv.DATA_ROOT ??
    fileEnv.DATA_PATH ??
    process.env.DATA_ROOT ??
    process.env.DATA_PATH;

  if (!configured || !String(configured).trim()) return null;

  const trimmed = String(configured).trim();
  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(portableRoot, trimmed);
}

/**
 * Workspace root (설정/DATA_ROOT). Under it: `share/` + `private/`.
 * Default: `{portableRoot}`.
 *
 * @param {string} portableRoot
 * @param {string | null | undefined} [settingsDataRoot]
 */
export function resolveWorkspaceRoot(portableRoot, settingsDataRoot = null) {
  const configured = readConfiguredWorkspacePath(portableRoot, settingsDataRoot);
  if (!configured) return path.resolve(portableRoot);
  return configured;
}

/**
 * Shared documents folder = `{workspaceRoot}/share`.
 * Kept as `resolveDataRoot` for call-site compatibility.
 *
 * @param {string} portableRoot
 * @param {string | null | undefined} [settingsDataRoot]
 */
export function resolveDataRoot(portableRoot, settingsDataRoot = null) {
  return path.join(resolveWorkspaceRoot(portableRoot, settingsDataRoot), DEFAULT_DATA_DIR);
}

/**
 * @param {string} sharedRoot absolute path of the share/ folder
 * @param {string} portableRoot
 */
export function isDefaultDataRoot(sharedRoot, portableRoot) {
  return (
    path.resolve(sharedRoot) ===
    path.resolve(path.join(portableRoot, DEFAULT_DATA_DIR))
  );
}

/**
 * @param {string} workspaceRoot
 * @param {string} portableRoot
 */
export function isDefaultWorkspaceRoot(workspaceRoot, portableRoot) {
  return path.resolve(workspaceRoot) === path.resolve(portableRoot);
}

/**
 * @param {string} portableRoot
 */
export function resolveAdminCredentials(portableRoot) {
  const fileEnv = readEnvFile(portableRoot);
  const adminId =
    fileEnv.ADMIN_ID ?? process.env.ADMIN_ID ?? DEFAULT_ADMIN_ID;
  const adminPassword =
    fileEnv.ADMIN_PW ?? fileEnv.ADMIN_PASSWORD ?? process.env.ADMIN_PW ?? process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PW;

  return {
    adminId: String(adminId).trim() || DEFAULT_ADMIN_ID,
    adminPassword: String(adminPassword) || DEFAULT_ADMIN_PW,
  };
}
