/** Trailing episode number: ` 01`, `-02`, `_3`, `(4)`. */
const TRAILING_EPISODE = /[\s._-]*\(?\d+\)?$/;
/** `[S01.E01] 종이의 집 - 1화.English` */
const BRACKET_SEASON_EPISODE = /^\[S(\d+)\.E(\d+)\]\s*(.*)$/i;

/**
 * @param {string} fileName
 */
export function fileStem(fileName) {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Shared series key. Same-season `[S01.E01]` files group together; otherwise
 * trailing numbers (`파이터 01.mp4`) share the title prefix.
 * @param {string} fileName
 * @returns {string | null}
 */
export function videoSeriesPrefix(fileName) {
  const stem = fileStem(fileName);
  const seasonEpisode = stem.match(BRACKET_SEASON_EPISODE);
  if (seasonEpisode) {
    const title = String(seasonEpisode[3] || '')
      .split(/\s+-\s+/)[0]
      .trim();
    if (!title) return `s${seasonEpisode[1]}`;
    return `s${seasonEpisode[1]}:${title}`;
  }
  const stripped = stem.replace(TRAILING_EPISODE, '').trim();
  if (!stripped || stripped === stem) return null;
  return stripped;
}

/**
 * @param {string} fileName
 * @param {string} prefix
 */
export function isVideoInSeries(fileName, prefix) {
  if (!prefix) return false;
  return videoSeriesPrefix(fileName) === prefix;
}

/**
 * @param {string} fileName
 */
export function videoSeriesEpisodeNumber(fileName) {
  const stem = fileStem(fileName);
  const seasonEpisode = stem.match(BRACKET_SEASON_EPISODE);
  if (seasonEpisode) return Number.parseInt(seasonEpisode[2], 10);
  const match = stem.match(/(\d+)\)?$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number.parseInt(match[1], 10);
}

/**
 * @param {import('../../types/nas4usb.d.ts').FsEntry} left
 * @param {import('../../types/nas4usb.d.ts').FsEntry} right
 */
export function compareVideoSeriesEntries(left, right) {
  const episodeDelta = videoSeriesEpisodeNumber(left.name) - videoSeriesEpisodeNumber(right.name);
  if (episodeDelta !== 0) return episodeDelta;
  return String(left.name).localeCompare(String(right.name), 'ko', { numeric: true });
}
