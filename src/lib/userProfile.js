export const USER_PROFILE_PATH = '.nas4usb/profile.json';
export const USER_DISPLAY_NAME_STORAGE_KEY = 'nas4usb.userDisplayName';

export const USER_NAME_PREFIX = '사용자';
const USER_NAME_PATTERN = /^사용자(\d{1,3})$/;

/**
 * @returns {string}
 */
export function createDefaultDisplayName() {
  const num = Math.floor(Math.random() * 999) + 1;
  return `${USER_NAME_PREFIX}${String(num).padStart(3, '0')}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function normalizeDisplayName(name) {
  const trimmed = name.trim();
  const match = USER_NAME_PATTERN.exec(trimmed);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    if (num >= 1 && num <= 999) {
      return `${USER_NAME_PREFIX}${String(num).padStart(3, '0')}`;
    }
  }

  const digits = trimmed.replace(/\D/g, '').slice(0, 3);
  if (digits) {
    const num = Number.parseInt(digits, 10);
    if (num >= 1 && num <= 999) {
      return `${USER_NAME_PREFIX}${String(num).padStart(3, '0')}`;
    }
  }

  if (trimmed.startsWith(USER_NAME_PREFIX)) {
    return trimmed;
  }

  if (trimmed) return trimmed;
  return createDefaultDisplayName();
}

/**
 * @param {string} value
 * @returns {string}
 */
export function formatUserDisplayNameInput(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === USER_NAME_PREFIX) {
    return USER_NAME_PREFIX;
  }

  if (!trimmed.startsWith(USER_NAME_PREFIX)) {
    const digits = trimmed.replace(/\D/g, '').slice(0, 3);
    return digits ? `${USER_NAME_PREFIX}${digits}` : USER_NAME_PREFIX;
  }

  const suffix = trimmed.slice(USER_NAME_PREFIX.length).replace(/\D/g, '').slice(0, 3);
  return suffix ? `${USER_NAME_PREFIX}${suffix}` : USER_NAME_PREFIX;
}

/**
 * @param {string} text
 */
export function encodeTextToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * @param {string} base64
 */
export function decodeBase64ToText(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @returns {string | null}
 */
function readStoredDisplayName() {
  try {
    const saved = localStorage.getItem(USER_DISPLAY_NAME_STORAGE_KEY);
    return typeof saved === 'string' && saved.trim() ? saved.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} displayName
 */
function writeStoredDisplayName(displayName) {
  try {
    localStorage.setItem(USER_DISPLAY_NAME_STORAGE_KEY, displayName);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @returns {Promise<string>}
 */
export async function loadUserDisplayName() {
  const stored = readStoredDisplayName();
  if (stored) {
    return normalizeDisplayName(stored);
  }

  const defaultName = createDefaultDisplayName();
  writeStoredDisplayName(defaultName);
  return defaultName;
}

/**
 * @param {string} displayName
 */
export async function saveUserDisplayName(displayName) {
  const normalized = normalizeDisplayName(displayName);
  writeStoredDisplayName(normalized);
}
