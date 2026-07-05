import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DATA_DIR, DEFAULT_SYNC_PORT, DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW } from '../shared/constants.js';

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
 * @param {string} portableRoot
 * @param {boolean} isDev
 */
export function resolveServerEnv(portableRoot, isDev) {
  const fileEnv = readEnvFile(portableRoot);
  const portRaw = fileEnv.PORT ?? process.env.PORT;
  const parsedPort = Number(portRaw ?? DEFAULT_SYNC_PORT);
  const hostname =
    fileEnv.HOSTNAME ??
    process.env.HOSTNAME ??
    (isDev ? '0.0.0.0' : '127.0.0.1');

  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_SYNC_PORT,
    hostname: hostname || '127.0.0.1',
  };
}

/**
 * 데이터 루트 경로를 해석합니다.
 * - 기본값: `{portableRoot}/data`
 * - `.env` `DATA_ROOT`: exe/프로젝트 기준 상대 경로 또는 절대 경로
 *
 * @param {string} portableRoot
 */
export function resolveDataRoot(portableRoot) {
  const fileEnv = readEnvFile(portableRoot);
  const configured =
    fileEnv.DATA_ROOT ??
    fileEnv.DATA_PATH ??
    process.env.DATA_ROOT ??
    process.env.DATA_PATH;

  if (!configured || !String(configured).trim()) {
    return path.join(portableRoot, DEFAULT_DATA_DIR);
  }

  const trimmed = String(configured).trim();
  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(portableRoot, trimmed);
}

/**
 * @param {string} dataRoot
 * @param {string} portableRoot
 */
export function isDefaultDataRoot(dataRoot, portableRoot) {
  return path.resolve(dataRoot) === path.resolve(portableRoot, DEFAULT_DATA_DIR);
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
