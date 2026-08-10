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
 * 데이터 루트 경로를 해석합니다.
 * - 설정 UI (`settings.dataRoot`)가 있으면 최우선
 * - 그다음 `.env` / 환경변수 `DATA_ROOT`·`DATA_PATH`
 * - 기본값: `{portableRoot}/data`
 *
 * @param {string} portableRoot
 * @param {string | null | undefined} [settingsDataRoot]
 */
export function resolveDataRoot(portableRoot, settingsDataRoot = null) {
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
