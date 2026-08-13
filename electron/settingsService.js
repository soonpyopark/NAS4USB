import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import { normalizeAllowedIpCidrs } from './ipAllowlist.js';
import {
  DEFAULT_GUEST_PERMISSIONS,
  DEFAULT_LOGGED_IN_PERMISSIONS,
  normalizeAccessPermissions,
  normalizeAccessPermissionsFromUi,
} from '../shared/guestPermissions.js';
import { getMemberAccessPermissionsByLoginId } from './membersService.js';
import { normalizeWebServerMode, normalizeWebServerPort } from '../shared/webServerConfig.js';
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '../shared/theme.js';
import { normalizeExternalFolders } from '../shared/externalFolders.js';

const SETTINGS_FILE = '.nas4usb-settings.json';

/**
 * `webServerPort` / `webServerMode` are null until an admin saves them in
 * 설정 → 서버 관리; null means "fall back to .env, then the built-in default".
 *
 * @typedef {{
 *   allowedIpCidrs: Array<{ cidr: string, description?: string }>,
 *   guestPermissions: import('../shared/guestPermissions.js').AccessPermissionFlags,
 *   loggedInPermissions: import('../shared/guestPermissions.js').AccessPermissionFlags,
 *   webServerPort: number | null,
 *   webServerMode: import('../shared/webServerConfig.js').WebServerMode | null,
 *   themeAccentColor: string,
 *   dataRoot: string | null,
 *   externalFolders: import('../shared/externalFolders.js').ExternalFolderMount[],
 *   ffmpegPath: string | null,
 *   useLegacyImagePdfViewers: boolean,
 *   spellcheckEnabled: boolean,
 * }} AppSettings
 *
 * @typedef {{ isLoggedIn?: boolean, loginId?: string | null, role?: string | null } | boolean} AccessAuth
 */

/**
 * Empty / whitespace → null (use `{portableRoot}` as workspace root, then `.env`).
 *
 * `dataRoot` in settings is the workspace root directory. Under it the app creates
 * `share/` (공유폴더) and `private/` (개인폴더).
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeConfiguredDataRoot(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Absolute path to a user-provided `ffmpeg` / `ffmpeg.exe` binary (not bundled).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeConfiguredFfmpegPath(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Chromium spellcheck (red underline) in editors. Default off.
 * @param {unknown} value
 */
export function normalizeSpellcheckEnabled(value) {
  return value === true;
}

/**
 * Soft restore: route image/PDF to legacy viewers (see docs/RESTORE-pre-yomikiru-reader.md).
 * @param {unknown} value
 */
export function normalizeUseLegacyImagePdfViewers(value) {
  return value === true;
}

/**
 * @returns {AppSettings}
 */
function emptySettings() {
  return {
    allowedIpCidrs: [],
    guestPermissions: { ...DEFAULT_GUEST_PERMISSIONS },
    loggedInPermissions: { ...DEFAULT_LOGGED_IN_PERMISSIONS },
    webServerPort: null,
    webServerMode: null,
    themeAccentColor: DEFAULT_ACCENT_COLOR,
    dataRoot: null,
    externalFolders: [],
    ffmpegPath: null,
    useLegacyImagePdfViewers: false,
    spellcheckEnabled: false,
  };
}

/**
 * @param {unknown} parsed
 * @param {string} field
 * @param {import('../shared/guestPermissions.js').AccessPermissionFlags} fallbackDefault
 */
function readPermissionField(parsed, field, fallbackDefault) {
  const hasField = parsed && typeof parsed === 'object' && field in parsed;
  if (hasField) {
    return normalizeAccessPermissionsFromUi(parsed[field]);
  }
  return normalizeAccessPermissions(fallbackDefault);
}

/**
 * @param {string} portableRoot
 * @returns {Promise<AppSettings>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, SETTINGS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      allowedIpCidrs: normalizeAllowedIpCidrs(parsed?.allowedIpCidrs ?? []),
      guestPermissions: readPermissionField(parsed, 'guestPermissions', DEFAULT_GUEST_PERMISSIONS),
      loggedInPermissions: readPermissionField(
        parsed,
        'loggedInPermissions',
        DEFAULT_LOGGED_IN_PERMISSIONS,
      ),
      webServerPort: normalizeWebServerPort(parsed?.webServerPort),
      webServerMode: normalizeWebServerMode(parsed?.webServerMode),
      themeAccentColor: normalizeAccentColor(parsed?.themeAccentColor),
      dataRoot: normalizeConfiguredDataRoot(parsed?.dataRoot),
      externalFolders: normalizeExternalFolders(parsed?.externalFolders),
      ffmpegPath: normalizeConfiguredFfmpegPath(parsed?.ffmpegPath),
      useLegacyImagePdfViewers: normalizeUseLegacyImagePdfViewers(parsed?.useLegacyImagePdfViewers),
      spellcheckEnabled: normalizeSpellcheckEnabled(parsed?.spellcheckEnabled),
    };
  } catch {
    return emptySettings();
  }
}

/**
 * @param {string} portableRoot
 * @param {AppSettings} settings
 */
async function saveStore(portableRoot, settings) {
  const filePath = path.join(portableRoot, SETTINGS_FILE);
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/**
 * @param {AccessAuth} auth
 * @returns {{ isLoggedIn: boolean, loginId: string | null, role: string | null }}
 */
export function resolveAccessAuth(auth) {
  if (typeof auth === 'boolean') {
    return { isLoggedIn: auth, loginId: null, role: null };
  }
  const role =
    auth?.role === 'super_admin' ? 'super_admin' : auth?.role === 'member' ? 'member' : null;
  return {
    isLoggedIn: Boolean(auth?.isLoggedIn),
    loginId: auth?.loginId ? String(auth.loginId) : null,
    role,
  };
}

/**
 * @param {string} [portableRoot]
 */
export async function getAppSettings(portableRoot = getPortableRoot()) {
  return loadStore(portableRoot);
}

/**
 * @param {string} [portableRoot]
 */
export async function getAllowedIpCidrs(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return settings.allowedIpCidrs;
}

/**
 * @param {string} [portableRoot]
 */
export async function getGuestPermissions(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return settings.guestPermissions;
}

/**
 * Readable without authentication: every client needs the accent colour to paint
 * its first frame, including guests and share-link visitors.
 *
 * @param {string} [portableRoot]
 */
export async function getThemeAccentColor(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return settings.themeAccentColor;
}

/**
 * Public UI prefs (no auth): accent colour + editor spellcheck.
 * @param {string} [portableRoot]
 */
export async function getPublicUiPrefs(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return {
    accentColor: settings.themeAccentColor,
    spellcheckEnabled: settings.spellcheckEnabled,
  };
}

/**
 * @param {string} [portableRoot]
 */
export async function getLoggedInPermissions(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return settings.loggedInPermissions;
}

/**
 * Guest → settings.guestPermissions.
 * Logged-in → that member's permissions (fallback: settings.loggedInPermissions).
 *
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function getEffectiveAccessPermissions(auth, portableRoot = getPortableRoot()) {
  const { isLoggedIn, loginId } = resolveAccessAuth(auth);
  const settings = await loadStore(portableRoot);
  if (!isLoggedIn) {
    return settings.guestPermissions;
  }
  if (loginId) {
    const memberPerms = await getMemberAccessPermissionsByLoginId(loginId, portableRoot);
    if (memberPerms) return memberPerms;
  }
  return settings.loggedInPermissions;
}

/**
 * @param {string} [portableRoot]
 * @param {AccessAuth} [auth]
 */
export async function getAccessPermissionsBundle(
  portableRoot = getPortableRoot(),
  auth = false,
) {
  const settings = await loadStore(portableRoot);
  const effectivePermissions = await getEffectiveAccessPermissions(auth, portableRoot);
  return {
    guestPermissions: settings.guestPermissions,
    loggedInPermissions: settings.loggedInPermissions,
    effectivePermissions,
  };
}

/**
 * @param {Partial<AppSettings>} patch
 * @param {string} [portableRoot]
 */
export async function updateAppSettings(patch, portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  if (patch && 'allowedIpCidrs' in patch) {
    settings.allowedIpCidrs = normalizeAllowedIpCidrs(patch.allowedIpCidrs);
  }
  if (patch && 'guestPermissions' in patch) {
    settings.guestPermissions = normalizeAccessPermissionsFromUi(patch.guestPermissions);
  }
  if (patch && 'loggedInPermissions' in patch) {
    settings.loggedInPermissions = normalizeAccessPermissionsFromUi(patch.loggedInPermissions);
  }
  if (patch && 'webServerPort' in patch) {
    settings.webServerPort = normalizeWebServerPort(patch.webServerPort);
  }
  if (patch && 'webServerMode' in patch) {
    settings.webServerMode = normalizeWebServerMode(patch.webServerMode);
  }
  if (patch && 'themeAccentColor' in patch) {
    settings.themeAccentColor = normalizeAccentColor(patch.themeAccentColor);
  }
  if (patch && 'dataRoot' in patch) {
    settings.dataRoot = normalizeConfiguredDataRoot(patch.dataRoot);
  }
  if (patch && 'externalFolders' in patch) {
    settings.externalFolders = normalizeExternalFolders(patch.externalFolders);
  }
  if (patch && 'ffmpegPath' in patch) {
    settings.ffmpegPath = normalizeConfiguredFfmpegPath(patch.ffmpegPath);
  }
  if (patch && 'useLegacyImagePdfViewers' in patch) {
    settings.useLegacyImagePdfViewers = normalizeUseLegacyImagePdfViewers(
      patch.useLegacyImagePdfViewers,
    );
  }
  if (patch && 'spellcheckEnabled' in patch) {
    settings.spellcheckEnabled = normalizeSpellcheckEnabled(patch.spellcheckEnabled);
  }
  await saveStore(portableRoot, settings);
  return settings;
}
