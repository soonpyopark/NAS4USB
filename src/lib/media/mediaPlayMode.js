/** @typedef {'series' | 'random' | 'one' | 'off'} MediaPlayMode */

/** @type {MediaPlayMode[]} */
export const MEDIA_PLAY_MODE_ORDER = ['series', 'random', 'one', 'off'];

export const MEDIA_PLAY_MODE_LABEL = {
  series: '연속',
  random: '랜덤',
  one: '한곡',
  off: '안함',
};

/**
 * @param {string} storageKey
 * @param {string} [legacyKey]
 * @returns {MediaPlayMode}
 */
export function loadMediaPlayMode(storageKey, legacyKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === 'series' || raw === 'random' || raw === 'one' || raw === 'off') return raw;
    if (legacyKey && localStorage.getItem(legacyKey) === '1') return 'series';
  } catch {
    // ignore
  }
  return 'off';
}

/**
 * @param {string} storageKey
 * @param {MediaPlayMode} mode
 * @param {string} [legacyKey]
 */
export function storeMediaPlayMode(storageKey, mode, legacyKey) {
  try {
    localStorage.setItem(storageKey, mode);
    if (legacyKey) localStorage.removeItem(legacyKey);
  } catch {
    // ignore
  }
}

/**
 * @param {import('../../types/nas4usb.d.ts').FsEntry[]} siblings
 * @param {string} currentPath
 */
export function pickRandomSibling(siblings, currentPath) {
  const others = siblings.filter((entry) => entry.relativePath !== currentPath);
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)] ?? null;
}

/**
 * @param {MediaPlayMode} mode
 * @param {'video' | 'audio'} kind
 */
export function mediaPlayModeTitle(mode, kind = 'video') {
  const unit = kind === 'audio' ? '음원' : '영상';
  return {
    series: `연속: 폴더 순서로 다음 ${unit} (클릭하면 랜덤)`,
    random: `랜덤: 같은 폴더에서 임의 재생 (클릭하면 한곡)`,
    one: `한곡: 현재 ${unit} 반복 (클릭하면 안함)`,
    off: '안함: 끝나면 정지 (클릭하면 연속)',
  }[mode];
}
