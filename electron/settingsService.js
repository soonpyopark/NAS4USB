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

const SETTINGS_FILE = '.nas4usb-settings.json';

/**
 * @typedef {{
 *   allowedIpCidrs: Array<{ cidr: string, description?: string }>,
 *   guestPermissions: import('../shared/guestPermissions.js').AccessPermissionFlags,
 *   loggedInPermissions: import('../shared/guestPermissions.js').AccessPermissionFlags,
 * }} AppSettings
 */

/**
 * @returns {AppSettings}
 */
function emptySettings() {
  return {
    allowedIpCidrs: [],
    guestPermissions: { ...DEFAULT_GUEST_PERMISSIONS },
    loggedInPermissions: { ...DEFAULT_LOGGED_IN_PERMISSIONS },
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
 * @param {string} [portableRoot]
 */
export async function getLoggedInPermissions(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return settings.loggedInPermissions;
}

/**
 * @param {boolean} isLoggedIn
 * @param {string} [portableRoot]
 */
export async function getEffectiveAccessPermissions(isLoggedIn, portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return isLoggedIn ? settings.loggedInPermissions : settings.guestPermissions;
}

/**
 * @param {string} [portableRoot]
 */
export async function getAccessPermissionsBundle(portableRoot = getPortableRoot()) {
  const settings = await loadStore(portableRoot);
  return {
    guestPermissions: settings.guestPermissions,
    loggedInPermissions: settings.loggedInPermissions,
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
  await saveStore(portableRoot, settings);
  return settings;
}
