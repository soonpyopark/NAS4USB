import { getParentPath, joinRelativePath } from '../fsPaths.js';
import { base64ToBytes } from '../bytes.js';
import { innerFileNameOf } from '../filePassword/secPaths.js';

/** @typedef {{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string }} SubtitleCandidate */

const SUBTITLE_EXTS = new Set(['vtt', 'srt', 'smi']);

/** Trailing tokens that are language / flag tags, not part of the title. */
const SUBTITLE_TAG_ALIASES = {
  en: 'English',
  eng: 'English',
  english: 'English',
  ko: '한국어',
  kor: '한국어',
  kr: '한국어',
  korean: '한국어',
  hangul: '한국어',
  영어: 'English',
  한글: '한국어',
  한국어: '한국어',
  ja: '日本語',
  jp: '日本語',
  jpn: '日本語',
  japanese: '日本語',
  일본어: '日本語',
  zh: '中文',
  chi: '中文',
  chinese: '中文',
  cn: '中文',
  tw: '中文',
  chs: '中文',
  cht: '中文',
  중국어: '中文',
  es: 'Español',
  spa: 'Español',
  spanish: 'Español',
  fr: 'Français',
  fre: 'Français',
  fra: 'Français',
  french: 'Français',
  de: 'Deutsch',
  ger: 'Deutsch',
  deu: 'Deutsch',
  german: 'Deutsch',
  pt: 'Português',
  por: 'Português',
  portuguese: 'Português',
  ru: 'Русский',
  rus: 'Русский',
  russian: 'Русский',
  it: 'Italiano',
  ita: 'Italiano',
  italian: 'Italiano',
  th: 'ไทย',
  tha: 'ไทย',
  thai: 'ไทย',
  vi: 'Tiếng Việt',
  vie: 'Tiếng Việt',
  vietnamese: 'Tiếng Việt',
  sdh: 'SDH',
  cc: 'CC',
  forced: 'Forced',
  default: 'Default',
  utf8: 'UTF-8',
  'utf-8': 'UTF-8',
  자막: '자막',
};

/**
 * @param {string} fileName
 */
export function fileStem(fileName) {
  const name = innerFileNameOf(fileName);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(0, index) : name;
}

/**
 * @param {string | null | undefined} extension
 */
function isSubtitleExtension(extension) {
  return SUBTITLE_EXTS.has(String(extension || '').toLowerCase());
}

/**
 * @param {string} stem
 */
function stripTrailingSubtitleTags(stem) {
  let current = String(stem || '').trim();
  while (current) {
    const match = current.match(/^(.*?)[.\s_-]+([^\s._-]+)$/);
    if (!match) break;
    const tag = match[2].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SUBTITLE_TAG_ALIASES, tag)) break;
    current = match[1].trim();
  }
  return current;
}

/**
 * @param {string} videoStem
 * @param {string} subtitleStem
 */
export function scoreSubtitleStemMatch(videoStem, subtitleStem) {
  const video = String(videoStem || '').trim().toLowerCase();
  const subtitle = String(subtitleStem || '').trim().toLowerCase();
  if (!video || !subtitle) return 0;
  if (video === subtitle) return 100;

  const videoCore = stripTrailingSubtitleTags(video);
  const subtitleCore = stripTrailingSubtitleTags(subtitle);
  if (videoCore && subtitleCore && videoCore === subtitleCore) return 80;

  if (subtitle.startsWith(video) && /[.\s_-]/.test(subtitle.charAt(video.length))) {
    return 50 + Math.min(40, video.length);
  }
  if (video.startsWith(subtitle) && /[.\s_-]/.test(video.charAt(subtitle.length))) {
    return 40;
  }
  return 0;
}

/**
 * @param {string} subtitleStem
 * @param {string} videoStem
 * @param {string} ext
 */
function subtitleTrackLabel(subtitleStem, videoStem, ext) {
  const extra = String(subtitleStem || '').slice(String(videoStem || '').length).replace(/^[.\s_-]+/, '');
  const token = extra.split(/[.\s_-]/).find(Boolean) || String(subtitleStem || '').split(/[.\s_-]/).pop() || '';
  const pretty = SUBTITLE_TAG_ALIASES[token.toLowerCase()];
  if (pretty) return pretty;
  if (extra) return extra;
  return ext.toUpperCase();
}

/**
 * Exact-name candidates (`movie.srt` for `movie.mp4`).
 * @param {string} videoRelativePath
 * @returns {SubtitleCandidate[]}
 */
export function listSiblingSubtitleCandidates(videoRelativePath) {
  const parent = getParentPath(videoRelativePath);
  const fileName = String(videoRelativePath || '').split('/').pop() || '';
  const stem = fileStem(fileName);
  if (!stem) return [];

  /** @type {Array<{ ext: 'srt' | 'smi' | 'vtt', label: string }>} */
  const kinds = [
    { ext: 'vtt', label: 'WebVTT' },
    { ext: 'srt', label: 'SRT' },
    { ext: 'smi', label: 'SMI' },
  ];

  return kinds.map(({ ext, label }) => ({
    path: parent === '.' ? `${stem}.${ext}` : joinRelativePath(parent, `${stem}.${ext}`),
    ext,
    label,
  }));
}

/**
 * @param {number} totalMs
 */
function msToVttTimestamp(totalMs) {
  const ms = Math.max(0, Math.round(Number(totalMs) || 0));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * @param {string} value
 */
function vttClockToMs(value) {
  const match = String(value)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!match) return Number.NaN;
  const hours = match[1] != null ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(String(match[4]).padEnd(3, '0').slice(0, 3));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/**
 * Shift cue times so they line up when playback starts at `offsetSeconds`
 * (mid-file remux). Cues that end before the offset are dropped.
 * @param {string} vtt
 * @param {number} offsetSeconds
 */
export function shiftWebVttCues(vtt, offsetSeconds) {
  const offsetMs = Math.round((Number(offsetSeconds) || 0) * 1000);
  const text = String(vtt ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!offsetMs) return text.endsWith('\n') ? text : `${text}\n`;

  const blocks = text.split(/\n\n+/);
  /** @type {string[]} */
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((line) => /\s-->\s/.test(line));
    if (timeIdx < 0) {
      if (block.trim()) out.push(block);
      continue;
    }
    const match = lines[timeIdx].match(
      /^((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})(.*)$/,
    );
    if (!match) {
      out.push(block);
      continue;
    }
    const startMs = vttClockToMs(match[1]) - offsetMs;
    const endMs = vttClockToMs(match[2]) - offsetMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= 0) continue;
    lines[timeIdx] = `${msToVttTimestamp(Math.max(0, startMs))} --> ${msToVttTimestamp(endMs)}${match[3]}`;
    out.push(lines.join('\n'));
  }
  return `${out.join('\n\n')}\n`;
}

/**
 * @param {string} vtt
 */
export function vttToTrackUrl(vtt) {
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
}

/**
 * @param {string} value
 */
function escapeVttText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} html
 */
function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();
}

/**
 * @param {string} srt
 */
export function srtToWebVtt(srt) {
  const body = String(srt ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // SRT uses comma for milliseconds; WebVTT uses a dot.
    .replace(
      /(\d{2}:\d{2}:\d{2}),(\d{1,3})/g,
      (_, time, frac) => `${time}.${String(frac).padEnd(3, '0').slice(0, 3)}`,
    )
    .trim();

  if (!body) return 'WEBVTT\n\n';
  if (/^WEBVTT\b/i.test(body)) return body.endsWith('\n') ? body : `${body}\n`;
  return `WEBVTT\n\n${body}\n`;
}

/**
 * Minimal SAMI (.smi) → WebVTT. Handles common KR sync blocks.
 * @param {string} smi
 */
export function smiToWebVtt(smi) {
  const source = String(smi ?? '').replace(/^\uFEFF/, '');
  const syncRe = /<sync\b[^>]*\bstart\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<sync\b|$)/gi;
  /** @type {{ start: number, text: string }[]} */
  const cues = [];
  let match;
  while ((match = syncRe.exec(source))) {
    const start = Number(match[1]);
    const text = stripHtml(match[2]);
    if (!Number.isFinite(start)) continue;
    cues.push({ start, text });
  }

  if (cues.length === 0) {
    return 'WEBVTT\n\n';
  }

  const lines = ['WEBVTT', ''];
  for (let i = 0; i < cues.length; i += 1) {
    const current = cues[i];
    if (!current.text) continue;
    const next = cues[i + 1];
    const end = next ? Math.max(current.start + 1, next.start) : current.start + 3000;
    lines.push(`${msToVttTimestamp(current.start)} --> ${msToVttTimestamp(end)}`);
    lines.push(escapeVttText(current.text).split('\n').join('\n'));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} text
 * @param {'srt' | 'smi' | 'vtt'} ext
 */
export function subtitleTextToWebVtt(text, ext) {
  if (ext === 'vtt') {
    const body = String(text ?? '').replace(/^\uFEFF/, '').trim();
    if (!body) return 'WEBVTT\n\n';
    return /^WEBVTT\b/i.test(body) ? (body.endsWith('\n') ? body : `${body}\n`) : `WEBVTT\n\n${body}\n`;
  }
  if (ext === 'smi') return smiToWebVtt(text);
  return srtToWebVtt(text);
}

/**
 * Decode subtitle bytes (UTF-8 first, then EUC-KR for legacy Korean SMI/SRT).
 * @param {Uint8Array} bytes
 * @param {'srt' | 'smi' | 'vtt'} ext
 */
export function decodeSubtitleBytes(bytes, ext) {
  const encodings = ext === 'smi' ? ['utf-8', 'euc-kr'] : ['utf-8', 'euc-kr'];
  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(bytes);
      if (text && !text.includes('\uFFFD')) return text;
      if (encoding !== 'utf-8') return text;
    } catch {
      // try next
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * @param {string} relativePath
 * @param {'srt' | 'smi' | 'vtt'} ext
 */
export async function loadSubtitleVtt(relativePath, ext) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const bytes = base64ToBytes(base64);
  const text = decodeSubtitleBytes(bytes, ext);
  return subtitleTextToWebVtt(text, ext);
}

/**
 * @param {string} relativePath
 * @param {'srt' | 'smi' | 'vtt'} ext
 * @returns {Promise<string>} blob: URL for a text/vtt track
 */
export async function loadSubtitleTrackUrl(relativePath, ext) {
  return vttToTrackUrl(await loadSubtitleVtt(relativePath, ext));
}

/**
 * @param {string} videoRelativePath
 * @param {import('../../types/nas4usb.d.ts').FsEntry[]} entries
 */
export function pickSiblingSubtitleEntries(videoRelativePath, entries) {
  const videoName = String(videoRelativePath || '').split('/').pop() || '';
  const videoStem = fileStem(videoName);
  const list = Array.isArray(entries) ? entries : [];
  const videoStems = list
    .filter((entry) => !entry.isDirectory && !isSubtitleExtension(entry.extension))
    .map((entry) => fileStem(entry.name).toLowerCase())
    .filter(Boolean);

  /** @type {Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string, score: number }>} */
  const picked = [];
  for (const entry of list) {
    if (entry.isDirectory || !isSubtitleExtension(entry.extension)) continue;
    const subStem = fileStem(entry.name);
    const score = scoreSubtitleStemMatch(videoStem, subStem);
    if (score <= 0) continue;
    const claimedByCloserVideo = videoStems.some((otherStem) => {
      if (otherStem === videoStem.toLowerCase()) return false;
      return scoreSubtitleStemMatch(otherStem, subStem) > score;
    });
    if (claimedByCloserVideo) continue;
    const ext = /** @type {'srt' | 'smi' | 'vtt'} */ (String(entry.extension).toLowerCase());
    picked.push({
      path: entry.relativePath,
      ext,
      label: subtitleTrackLabel(subStem, videoStem, ext),
      score,
    });
  }

  picked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, 'ko'));
  return picked;
}

/**
 * Resolve existing sibling subtitle files for a video path.
 * Matches exact names and close variants (`a.mp4` + `a.english.srt`).
 * @param {string} videoRelativePath
 * @returns {Promise<Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string, vtt: string }>>}
 */
export async function loadSiblingSubtitleTracks(videoRelativePath) {
  /** @type {Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string }>} */
  let candidates = [];
  try {
    const parent = getParentPath(videoRelativePath);
    const entries = await window.nas4usb.fs.readDir(parent);
    candidates = pickSiblingSubtitleEntries(videoRelativePath, Array.isArray(entries) ? entries : []);
  } catch {
    candidates = listSiblingSubtitleCandidates(videoRelativePath);
  }

  if (candidates.length === 0) {
    candidates = listSiblingSubtitleCandidates(videoRelativePath);
  }

  /** @type {Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string, vtt: string }>} */
  const tracks = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    try {
      const stat = await window.nas4usb.fs.stat(candidate.path);
      if (!stat || stat.isDirectory) continue;
      const vtt = await loadSubtitleVtt(candidate.path, candidate.ext);
      tracks.push({
        path: candidate.path,
        ext: candidate.ext,
        label: candidate.label,
        vtt,
      });
    } catch {
      // missing sibling — ignore
    }
  }

  return tracks;
}
