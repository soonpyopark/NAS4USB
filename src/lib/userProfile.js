export const USER_PROFILE_PATH = '.educowork/profile.json';

/**
 * @returns {string}
 */
export function createDefaultDisplayName() {
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `사용자${suffix}`;
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
 * @returns {Promise<string>}
 */
export async function loadUserDisplayName() {
  if (!window.educowork?.fs?.readFile) {
    return createDefaultDisplayName();
  }

  try {
    const exists = await window.educowork.fs.exists(USER_PROFILE_PATH);
    if (exists) {
      const base64 = await window.educowork.fs.readFile(USER_PROFILE_PATH);
      const profile = JSON.parse(decodeBase64ToText(base64));
      const savedName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
      if (savedName) return savedName;
    }

    const defaultName = createDefaultDisplayName();
    await saveUserDisplayName(defaultName);
    return defaultName;
  } catch {
    return createDefaultDisplayName();
  }
}

/**
 * @param {string} displayName
 */
export async function saveUserDisplayName(displayName) {
  if (!window.educowork?.fs?.writeFile) return;

  const trimmed = displayName.trim();
  const payload = JSON.stringify({ displayName: trimmed }, null, 2);
  await window.educowork.fs.writeFile(USER_PROFILE_PATH, encodeTextToBase64(payload));
}
