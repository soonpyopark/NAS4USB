/** @type {Map<string, string>} */
const passwords = new Map();

/**
 * @param {string} relativePath
 */
function keyOf(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 * @param {string} password
 */
export function rememberFilePassword(relativePath, password) {
  const key = keyOf(relativePath);
  if (!key || !password) return;
  passwords.set(key, password);
}

/**
 * @param {string} relativePath
 */
export function getFilePassword(relativePath) {
  return passwords.get(keyOf(relativePath)) ?? '';
}

/**
 * @param {string} relativePath
 */
export function forgetFilePassword(relativePath) {
  passwords.delete(keyOf(relativePath));
}

/**
 * @param {string} fromPath
 * @param {string} toPath
 */
export function moveFilePassword(fromPath, toPath) {
  const password = getFilePassword(fromPath);
  if (!password) return;
  rememberFilePassword(toPath, password);
  forgetFilePassword(fromPath);
}
