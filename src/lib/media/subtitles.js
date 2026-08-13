import { getParentPath, joinRelativePath } from '../fsPaths.js';
import { base64ToBytes } from '../bytes.js';

/** @typedef {{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string }} SubtitleCandidate */

/**
 * @param {string} videoRelativePath
 * @returns {SubtitleCandidate[]}
 */
export function listSiblingSubtitleCandidates(videoRelativePath) {
  const parent = getParentPath(videoRelativePath);
  const fileName = String(videoRelativePath || '').split('/').pop() || '';
  const stem = fileName.includes('.') ? fileName.replace(/\.[^.]+$/, '') : fileName;
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
 * @returns {Promise<string>} blob: URL for a text/vtt track
 */
export async function loadSubtitleTrackUrl(relativePath, ext) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const bytes = base64ToBytes(base64);
  const text = decodeSubtitleBytes(bytes, ext);
  const vtt = subtitleTextToWebVtt(text, ext);
  const blob = new Blob([vtt], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

/**
 * Resolve existing sibling subtitle files for a video path.
 * @param {string} videoRelativePath
 * @returns {Promise<Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string, src: string }>>}
 */
export async function loadSiblingSubtitleTracks(videoRelativePath) {
  const candidates = listSiblingSubtitleCandidates(videoRelativePath);
  /** @type {Array<{ path: string, ext: 'srt' | 'smi' | 'vtt', label: string, src: string }>} */
  const tracks = [];

  for (const candidate of candidates) {
    try {
      const stat = await window.nas4usb.fs.stat(candidate.path);
      if (!stat || stat.isDirectory) continue;
      const src = await loadSubtitleTrackUrl(candidate.path, candidate.ext);
      tracks.push({
        path: candidate.path,
        ext: candidate.ext,
        label: candidate.label,
        src,
      });
    } catch {
      // missing sibling — ignore
    }
  }

  return tracks;
}
