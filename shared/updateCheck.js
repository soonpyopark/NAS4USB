/** GitHub Releases update check (shared types + version helpers). */

export const GITHUB_REPO = 'soonpyopark/NAS4USB';
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const RELEASES_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** major.minor.patch with optional 4th build (e.g. 1.1.8.1). */
const VERSION_RE = /(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/;
/** MSI/portable build id embedded in asset names: …_YYMMDD_HHMMSS(.msi|_portable.zip) */
const BUILD_STAMP_RE = /(\d{6}_\d{6})/;

/**
 * @typedef {{
 *   ok: boolean,
 *   current: string,
 *   currentBuildStamp?: string,
 *   latest?: string | null,
 *   latestBuildStamp?: string | null,
 *   releaseUpdatedAt?: string | null,
 *   releaseUrl?: string | null,
 *   error?: string | null,
 *   updateKind?: 'version' | 'build' | null,
 *   platformAssetsFound?: boolean,
 * }} UpdateCheckResult
 */

/**
 * @param {string} [platform]
 * @returns {'darwin' | 'win32' | ''}
 */
export function detectUpdatePlatform(platform) {
  const raw = String(platform || '').trim();
  if (raw === 'darwin' || raw === 'win32') return raw;
  if (typeof process !== 'undefined' && (process.platform === 'darwin' || process.platform === 'win32')) {
    return process.platform;
  }
  const hint =
    typeof navigator !== 'undefined'
      ? `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`
      : '';
  if (/mac/i.test(hint)) return 'darwin';
  if (/win/i.test(hint)) return 'win32';
  return '';
}

/**
 * Keep release assets that match this OS so a Windows republish does not
 * look newer than the Mac build (Tiny PDF Editor does the same).
 *
 * @param {string[]} names
 * @param {string} [platform]
 */
export function filterAssetsForPlatform(names, platform) {
  const list = Array.isArray(names) ? names : [];
  const plat = detectUpdatePlatform(platform);
  if (plat === 'darwin') {
    return list.filter((name) => /macos|\.dmg$/i.test(name));
  }
  if (plat === 'win32') {
    return list.filter(
      (name) => !/macos/i.test(name) && (/\.msi$/i.test(name) || /portable\.zip$/i.test(name)),
    );
  }
  return list;
}

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
 * Extract YYMMDD_HHMMSS from a release asset / package file name.
 * @param {string} name
 * @returns {string | null}
 */
export function parseBuildStamp(name) {
  const match = BUILD_STAMP_RE.exec(String(name || ''));
  return match?.[1] ?? null;
}

/**
 * @param {string[]} names
 * @returns {string | null}
 */
export function maxBuildStamp(names) {
  let best = /** @type {string | null} */ (null);
  for (const name of names) {
    const stamp = parseBuildStamp(name);
    if (!stamp) continue;
    if (!best || stamp > best) best = stamp;
  }
  return best;
}

/**
 * Compare semver-like tuples: positive if a > b.
 * @param {number[]} a
 * @param {number[]} b
 */
export function compareVersionTuples(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

/**
 * Update if remote version is newer, or same version with a newer package build stamp
 * (same tag / MSI-only republish).
 * @param {UpdateCheckResult} result
 */
export function isUpdateAvailable(result) {
  return resolveUpdateKind(result) != null;
}

/**
 * @param {UpdateCheckResult} result
 * @returns {'version' | 'build' | null}
 */
export function resolveUpdateKind(result) {
  if (!result.ok || !result.latest) return null;
  const cmp = compareVersionTuples(versionTuple(result.latest), versionTuple(result.current));
  if (cmp > 0) return 'version';
  if (cmp < 0) return null;

  // Same tag: only compare build stamps for this platform's packages.
  if (result.platformAssetsFound === false) return null;

  const local = String(result.currentBuildStamp || '').trim();
  const remote = String(result.latestBuildStamp || '').trim();
  if (local && remote && remote > local) return 'build';

  // Fallback: same version, no asset stamps — use release updated_at vs local stamp time.
  if (local && result.releaseUpdatedAt && !remote) {
    const localAt = buildStampToMs(local);
    const remoteAt = Date.parse(result.releaseUpdatedAt);
    if (localAt != null && Number.isFinite(remoteAt) && remoteAt > localAt) return 'build';
  }
  return null;
}

/**
 * YYMMDD_HHMMSS → epoch ms (assume 20xx).
 * @param {string} stamp
 * @returns {number | null}
 */
export function buildStampToMs(stamp) {
  const match = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(stamp.trim());
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ms = Date.UTC(year, month, day, hour, minute, second);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {string} version
 */
export function versionLabel(version) {
  return version.startsWith('v') ? version : `v${version}`;
}
