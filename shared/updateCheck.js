/** GitHub Releases update check (shared types + version helpers). */

export const GITHUB_REPO = 'soonpyopark/NAS4USB';
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const RELEASES_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** major.minor.patch with optional 4th build (e.g. 1.1.8.1). */
const VERSION_RE = /(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/;

/**
 * @typedef {{
 *   ok: boolean,
 *   current: string,
 *   latest?: string | null,
 *   releaseUrl?: string | null,
 *   error?: string | null,
 * }} UpdateCheckResult
 */

/**
 * @param {string} text
 * @returns {number[]}
 */
export function versionTuple(text) {
  const match = VERSION_RE.exec(text.trim());
  if (!match) return [0];
  return match
    .slice(1)
    .filter((part) => part != null)
    .map((part) => Number(part));
}

/**
 * @param {string} tagName
 * @returns {string | null}
 */
export function parseReleaseTag(tagName) {
  const match = VERSION_RE.exec(tagName || '');
  if (!match) return null;
  return match
    .slice(1)
    .filter((part) => part != null)
    .join('.');
}

/**
 * @param {UpdateCheckResult} result
 */
export function isUpdateAvailable(result) {
  if (!result.ok || !result.latest) return false;
  const a = versionTuple(result.latest);
  const b = versionTuple(result.current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

/**
 * @param {string} version
 */
export function versionLabel(version) {
  return version.startsWith('v') ? version : `v${version}`;
}
