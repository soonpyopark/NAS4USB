import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getTempPath, resolvePortablePath } from './appContext.js';
import { getAppSettings } from './settingsService.js';

/** Chromium-friendly audio codecs (lowercase, without trailing dots). */
const SAFE_AUDIO_CODECS = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
  'pcm_s16le',
  'pcm_f32le',
]);

/** Chromium can usually play these video codecs (container permitting). */
const SAFE_VIDEO_PLAY_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1']);

/** Codecs safe to bitstream-copy into an MP4 container for Chromium. */
const SAFE_VIDEO_COPY_TO_MP4 = new Set(['h264', 'avc1']);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeFfmpegPath(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runProcess(cmd, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish({
        code: 1,
        stdout,
        stderr: `${stderr}\nFFmpeg timed out after ${timeoutMs}ms`.trim(),
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({
        code: 1,
        stdout,
        stderr: `${stderr}\n${err instanceof Error ? err.message : String(err)}`.trim(),
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * @param {string} ffmpegPath
 */
function resolveFfprobePath(ffmpegPath) {
  const dir = path.dirname(ffmpegPath);
  const base = path.basename(ffmpegPath).toLowerCase();
  if (base === 'ffprobe' || base === 'ffprobe.exe') return ffmpegPath;
  const candidate = path.join(dir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  return candidate;
}

/**
 * @param {string} [portableRoot]
 * @returns {Promise<string | null>}
 */
export async function getConfiguredFfmpegPath(portableRoot) {
  const settings = await getAppSettings(portableRoot);
  const configured = normalizeFfmpegPath(settings.ffmpegPath);
  if (!configured) return null;
  try {
    await fs.access(configured);
    return configured;
  } catch {
    return null;
  }
}

/**
 * @param {string} [portableRoot]
 */
export async function getFfmpegStatus(portableRoot) {
  const settings = await getAppSettings(portableRoot);
  const configured = normalizeFfmpegPath(settings.ffmpegPath);
  if (!configured) {
    return { configured: false, path: null, available: false, version: null };
  }
  try {
    await fs.access(configured);
  } catch {
    return { configured: true, path: configured, available: false, version: null };
  }
  const probed = await runProcess(configured, ['-version'], { timeoutMs: 8000 });
  const firstLine = String(probed.stdout || probed.stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return {
    configured: true,
    path: configured,
    available: probed.code === 0,
    version: firstLine || null,
  };
}

/**
 * @param {string} absolutePath
 * @param {string} ffmpegPath
 */
async function probeMedia(absolutePath, ffmpegPath) {
  const ffprobe = resolveFfprobePath(ffmpegPath);
  let useFfprobe = true;
  try {
    await fs.access(ffprobe);
  } catch {
    useFfprobe = false;
  }

  if (useFfprobe) {
    const result = await runProcess(
      ffprobe,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        absolutePath,
      ],
      { timeoutMs: 60_000 },
    );
    if (result.code === 0) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        // fall through
      }
    }
  }

  // Fallback: ffmpeg -i prints stream info to stderr.
  const result = await runProcess(ffmpegPath, ['-hide_banner', '-i', absolutePath], {
    timeoutMs: 60_000,
  });
  const text = `${result.stderr}\n${result.stdout}`;
  /** @type {{ streams: Array<{ codec_type?: string, codec_name?: string }> }} */
  const probe = { streams: [] };
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/Stream #\d+:\d+.*?:\s*(Video|Audio):\s*([a-zA-Z0-9_]+)/i);
    if (!match) continue;
    probe.streams.push({
      codec_type: match[1].toLowerCase(),
      codec_name: match[2].toLowerCase(),
    });
  }
  return probe;
}

/**
 * @param {{ streams?: Array<{ codec_type?: string, codec_name?: string }> }} probe
 */
function analyzeProbe(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videoStreams = streams.filter((s) => String(s.codec_type).toLowerCase() === 'video');
  const audioStreams = streams.filter((s) => String(s.codec_type).toLowerCase() === 'audio');

  const videoCodec = String(videoStreams[0]?.codec_name || '').toLowerCase();
  const audioCodecs = audioStreams.map((s) => String(s.codec_name || '').toLowerCase()).filter(Boolean);

  const videoPlayOk = Boolean(videoCodec) && SAFE_VIDEO_PLAY_CODECS.has(videoCodec);
  const videoCopyOk = Boolean(videoCodec) && SAFE_VIDEO_COPY_TO_MP4.has(videoCodec);
  const hasAudio = audioCodecs.length > 0;
  const audioSafe = !hasAudio || audioCodecs.every((codec) => SAFE_AUDIO_CODECS.has(codec));

  return {
    videoCodec,
    audioCodecs,
    hasAudio,
    videoCopyOk,
    audioSafe,
    needsRemux: !videoPlayOk || !audioSafe,
  };
}

/**
 * @param {string} relativePath
 * @param {{ mtimeMs: number, size: number }} stat
 */
function cacheFilePath(relativePath, stat) {
  const key = crypto
    .createHash('sha1')
    .update(`${relativePath}|${stat.mtimeMs}|${stat.size}|v1`)
    .digest('hex');
  return path.join(getTempPath(), 'nas4usb', 'video-preview', `${key}.mp4`);
}

/**
 * Ensure a Chromium-playable preview file exists when FFmpeg is configured.
 * @param {string} relativePath
 * @param {string} [portableRoot]
 * @returns {Promise<{ absolutePath: string, contentType: string, remuxed: boolean, reason: string }>}
 */
export async function ensureVideoPreview(relativePath, portableRoot) {
  const ffmpegPath = await getConfiguredFfmpegPath(portableRoot);
  const sourceAbsolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(sourceAbsolute);

  if (!ffmpegPath) {
    return {
      absolutePath: sourceAbsolute,
      contentType: guessSourceContentType(relativePath),
      remuxed: false,
      reason: 'ffmpeg-not-configured',
    };
  }

  const probe = await probeMedia(sourceAbsolute, ffmpegPath);
  const analysis = analyzeProbe(probe);

  if (!analysis.needsRemux) {
    return {
      absolutePath: sourceAbsolute,
      contentType: guessSourceContentType(relativePath),
      remuxed: false,
      reason: 'already-compatible',
    };
  }

  const outPath = cacheFilePath(relativePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  try {
    const existing = await fs.stat(outPath);
    if (existing.isFile() && existing.size > 0) {
      return {
        absolutePath: outPath,
        contentType: 'video/mp4',
        remuxed: true,
        reason: 'cache-hit',
      };
    }
  } catch {
    // create
  }

  const videoArgs = analysis.videoCopyOk
    ? ['-c:v', 'copy']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];

  const audioArgs = analysis.hasAudio
    ? ['-c:a', 'aac', '-ac', '2', '-b:a', '192k']
    : ['-an'];

  const args = [
    '-y',
    '-i',
    sourceAbsolute,
    '-map',
    '0:v:0',
    ...(analysis.hasAudio ? ['-map', '0:a:0?'] : []),
    ...videoArgs,
    ...audioArgs,
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outPath,
  ];

  const result = await runProcess(ffmpegPath, args, { timeoutMs: 45 * 60 * 1000 });
  if (result.code !== 0) {
    await fs.rm(outPath, { force: true }).catch(() => {});
    const detail = (result.stderr || result.stdout || '').trim().slice(-800);
    throw new Error(
      `FFmpeg 호환 변환에 실패했습니다.${detail ? `\n${detail}` : ''}`,
    );
  }

  return {
    absolutePath: outPath,
    contentType: 'video/mp4',
    remuxed: true,
    reason: analysis.audioSafe ? 'video-reencoded' : 'audio-remuxed',
  };
}

/**
 * @param {string} relativePath
 */
function guessSourceContentType(relativePath) {
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  if (ext === 'webm') return 'video/webm';
  if (ext === 'ogv' || ext === 'ogg') return 'video/ogg';
  if (ext === 'mkv') return 'video/x-matroska';
  return 'video/mp4';
}
