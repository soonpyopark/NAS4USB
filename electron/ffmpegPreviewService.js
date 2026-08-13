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

/** 8-bit 4:2:0 — Chromium H.264 often fails on 10-bit / 4:4:4. */
const CHROMIUM_PIX_FMTS = new Set(['yuv420p', 'yuvj420p']);

/** Audio codecs that can be bitstream-copied into MP4. */
const MP4_AUDIO_COPY = new Set(['aac', 'mp3']);

/** Containers Chromium's <video> can play without remux. */
const CHROMIUM_NATIVE_EXTS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'ogg']);

const MIN_SEGMENT_BYTES = 8 * 1024;
const CACHE_VERSION = 'v6';
const HLS_PLAYLIST = 'index.m3u8';
const HLS_SEGMENT_NAME = /^seg\d{5}\.ts$/;

/**
 * @typedef {{
 *   outPath: string,
 *   finished: Promise<void>,
 *   done: boolean,
 *   error: Error | null,
 * }} LiveTranscodeJob
 */

/** @type {Map<string, Promise<import('./ffmpegPreviewService.js') extends never ? never : object>>} */
const inflightPreviews = new Map();

/** @type {Map<string, LiveTranscodeJob>} */
const liveJobs = new Map();

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
  /** @type {{ streams: Array<{ codec_type?: string, codec_name?: string, index?: number, pix_fmt?: string }>, format?: { format_name?: string } }} */
  const probe = { streams: [], format: {} };
  const fmtMatch = text.match(/Input #\d+,\s*([^\r\n]+?),\s*from\s+'/i);
  if (fmtMatch) {
    probe.format = { format_name: fmtMatch[1].trim() };
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/Stream #(\d+):(\d+).*?:\s*(Video|Audio):\s*([a-zA-Z0-9_]+)(?:[^(\n]*?\(([^)]+)\))?/i);
    if (!match) continue;
    const codecType = match[3].toLowerCase();
    const extra = `${match[5] || ''} ${line}`;
    const pixMatch = extra.match(/\b(yuv\w+)/i);
    probe.streams.push({
      index: Number.parseInt(match[2], 10),
      codec_type: codecType,
      codec_name: match[4].toLowerCase(),
      pix_fmt: pixMatch ? pixMatch[1].toLowerCase() : undefined,
      disposition: /attached\s*pic|cover|thumbnail/i.test(line) ? { attached_pic: 1 } : undefined,
    });
  }
  return probe;
}

/**
 * @param {unknown} stream
 */
function isAttachedPic(stream) {
  const disp = stream && typeof stream === 'object' ? /** @type {{ disposition?: { attached_pic?: number } }} */ (stream).disposition : null;
  return Number(disp?.attached_pic) === 1;
}

/**
 * Chromium plays MP4/WebM/Ogg in <video>; MKV/AVI/MOV need an MP4 remux even when codecs look fine.
 * @param {string} relativePath
 * @param {string} [formatName]
 */
function isChromiumNativeContainer(relativePath, formatName) {
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  if (ext === 'mkv' || ext === 'avi' || ext === 'mov') return false;
  if (CHROMIUM_NATIVE_EXTS.has(ext)) return true;
  const names = String(formatName || '').toLowerCase();
  if (names.includes('matroska') || names.includes('avi') || names.includes('asf')) return false;
  return names.includes('mp4') || names.includes('webm') || names.includes('ogg');
}

/**
 * @param {{ streams?: Array<{ codec_type?: string, codec_name?: string, index?: number, pix_fmt?: string, disposition?: { attached_pic?: number } }>, format?: { format_name?: string } }} probe
 * @param {string} relativePath
 */
function analyzeProbe(probe, relativePath) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videoStreams = streams.filter(
    (s) => String(s.codec_type).toLowerCase() === 'video' && !isAttachedPic(s),
  );
  const audioStreams = streams.filter((s) => String(s.codec_type).toLowerCase() === 'audio');

  const video = videoStreams[0];
  const audio = audioStreams[0];
  const videoCodec = String(video?.codec_name || '').toLowerCase();
  const pixFmt = String(video?.pix_fmt || '').toLowerCase();
  const audioCodecs = audioStreams.map((s) => String(s.codec_name || '').toLowerCase()).filter(Boolean);

  const videoPlayOk = Boolean(videoCodec) && SAFE_VIDEO_PLAY_CODECS.has(videoCodec);
  const pixOk = !pixFmt || CHROMIUM_PIX_FMTS.has(pixFmt);
  const videoCopyOk = Boolean(videoCodec) && SAFE_VIDEO_COPY_TO_MP4.has(videoCodec) && pixOk;
  const hasAudio = audioCodecs.length > 0;
  const audioSafe = !hasAudio || audioCodecs.every((codec) => SAFE_AUDIO_CODECS.has(codec));
  const audioCopyOk = Boolean(audioCodecs[0]) && MP4_AUDIO_COPY.has(audioCodecs[0]);
  const containerOk = isChromiumNativeContainer(relativePath, probe?.format?.format_name);
  const videoIndex = Number.isInteger(video?.index) ? video.index : null;
  const audioIndex = Number.isInteger(audio?.index) ? audio.index : null;

  return {
    videoCodec,
    audioCodecs,
    hasAudio,
    videoCopyOk,
    audioCopyOk,
    audioSafe,
    containerOk,
    pixOk,
    videoIndex,
    audioIndex,
    needsRemux: !containerOk || !videoPlayOk || !audioSafe || !pixOk,
  };
}

/**
 * @param {string} relativePath
 * @param {{ mtimeMs: number, size: number }} stat
 */
function cacheDirPath(relativePath, stat) {
  const key = crypto
    .createHash('sha1')
    .update(`${relativePath}|${stat.mtimeMs}|${stat.size}|${CACHE_VERSION}`)
    .digest('hex');
  return path.join(getTempPath(), 'nas4usb', 'video-preview', key);
}

export function isAllowedHlsFileName(name) {
  return name === HLS_PLAYLIST || HLS_SEGMENT_NAME.test(name);
}

/**
 * Resolve a transcode playlist/segment without probing or starting FFmpeg.
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function resolveVideoPreviewHlsFile(relativePath, fileName) {
  if (!isAllowedHlsFileName(fileName)) {
    const error = new Error('잘못된 HLS 파일 요청입니다.');
    error.statusCode = 400;
    throw error;
  }
  const sourceAbsolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(sourceAbsolute);
  const dir = cacheDirPath(relativePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  const absolutePath = path.resolve(dir, fileName);
  const relative = path.relative(dir, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('잘못된 HLS 파일 요청입니다.');
    error.statusCode = 400;
    throw error;
  }
  return {
    dir,
    absolutePath,
    contentType: fileName === HLS_PLAYLIST ? 'application/vnd.apple.mpegurl' : 'video/MP2T',
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {ReturnType<typeof analyzeProbe>} analysis
 */
function mapStreamArgs(analysis) {
  const videoMap = analysis.videoIndex != null ? `0:${analysis.videoIndex}` : '0:V:0';
  if (!analysis.hasAudio) return ['-map', videoMap];
  const audioMap = analysis.audioIndex != null ? `0:${analysis.audioIndex}` : '0:a:0?';
  return ['-map', videoMap, '-map', audioMap];
}

/**
 * @param {ReturnType<typeof analyzeProbe>} analysis
 * @param {boolean} reencode
 */
function codecArgs(analysis, reencode) {
  const videoArgs =
    analysis.videoCopyOk && !reencode
      ? ['-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb']
      : [
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-profile:v',
          'high',
          '-g',
          '48',
          '-keyint_min',
          '48',
          '-sc_threshold',
          '0',
          '-force_key_frames',
          'expr:gte(t,n_forced*2)',
        ];
  const audioArgs = !analysis.hasAudio
    ? ['-an']
    : analysis.audioCopyOk && !reencode
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-ac', '2', '-b:a', '192k'];
  return { videoArgs, audioArgs };
}

/**
 * @param {ReturnType<typeof analyzeProbe>} analysis
 */
function remuxReason(analysis) {
  if (!analysis.containerOk) return 'container-remuxed';
  if (!analysis.videoPlayOk || !analysis.pixOk || !analysis.videoCopyOk) return 'video-reencoded';
  return 'audio-remuxed';
}

function previewResult(absolutePath, remuxed, reason, stage, fullReady, protocol = 'native') {
  const hls = protocol === 'hls';
  return {
    absolutePath,
    contentType: hls
      ? 'application/vnd.apple.mpegurl'
      : remuxed || stage === 'full' || stage === 'streaming'
        ? 'video/mp4'
        : guessSourceContentType(absolutePath),
    remuxed,
    reason,
    stage,
    fullReady,
    protocol,
  };
}

async function readPlaylistText(dir) {
  return fs.readFile(path.join(dir, HLS_PLAYLIST), 'utf8');
}

async function cachedHlsComplete(dir) {
  try {
    const text = await readPlaylistText(dir);
    return text.includes('#EXT-X-ENDLIST') && /seg\d{5}\.ts/.test(text);
  } catch {
    return false;
  }
}

async function hasPlayableSegment(dir) {
  try {
    const text = await readPlaylistText(dir);
    const match = text.match(/seg\d{5}\.ts/);
    if (!match) return false;
    const stat = await fs.stat(path.join(dir, match[0]));
    return stat.isFile() && stat.size >= MIN_SEGMENT_BYTES;
  } catch {
    return false;
  }
}

/**
 * @param {string} dir
 * @param {() => Error | null} getError
 */
async function waitUntilHlsPlayable(dir, getError) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const error = getError();
    if (error) throw error;
    try {
      const text = await readPlaylistText(dir);
      const match = text.match(/seg\d{5}\.ts/);
      if (match) {
        const segmentPath = path.join(dir, match[0]);
        const stat = await fs.stat(segmentPath);
        if (stat.isFile() && stat.size >= MIN_SEGMENT_BYTES) return;
      }
    } catch {
      // playlist or first segment not ready
    }
    await sleep(80);
  }
  throw new Error('호환 변환을 시작하는 데 시간이 너무 오래 걸립니다.');
}

/**
 * HLS event playlist so the player can start at segment 0 while FFmpeg keeps appending.
 * @param {string} ffmpegPath
 * @param {string} sourceAbsolute
 * @param {string} outDir
 * @param {ReturnType<typeof analyzeProbe>} analysis
 * @param {boolean} reencode
 */
function spawnHlsTranscode(ffmpegPath, sourceAbsolute, outDir, analysis, reencode) {
  const { videoArgs, audioArgs } = codecArgs(analysis, reencode);
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-fflags',
    '+genpts',
    '-i',
    sourceAbsolute,
    ...mapStreamArgs(analysis),
    ...videoArgs,
    ...audioArgs,
    '-sn',
    '-dn',
    '-max_muxing_queue_size',
    '2048',
    '-muxpreload',
    '0',
    '-muxdelay',
    '0',
    '-avoid_negative_ts',
    'make_zero',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'event',
    '-hls_flags',
    'independent_segments+temp_file',
    '-hls_segment_filename',
    'seg%05d.ts',
    HLS_PLAYLIST,
  ];

  const child = spawn(ffmpegPath, args, {
    windowsHide: true,
    shell: false,
    cwd: outDir,
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
  });

  /** @type {Promise<number>} */
  const closed = new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });

  return { child, closed, getStderr: () => stderr };
}

/**
 * @param {string} ffmpegPath
 * @param {string} sourceAbsolute
 * @param {string} outPath
 * @param {ReturnType<typeof analyzeProbe>} analysis
 */
function startLiveTranscode(ffmpegPath, sourceAbsolute, outDir, analysis) {
  const existing = liveJobs.get(outDir);
  if (existing && !existing.done) return existing;

  /** @type {LiveTranscodeJob} */
  const job = {
    outPath: outDir,
    done: false,
    error: null,
    finished: Promise.resolve(),
  };
  liveJobs.set(outDir, job);

  job.finished = (async () => {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(outDir, { recursive: true });
    let session = spawnHlsTranscode(ffmpegPath, sourceAbsolute, outDir, analysis, false);
    let code = await session.closed;
    if (code !== 0 && (analysis.videoCopyOk || analysis.audioCopyOk) && !(await hasPlayableSegment(outDir))) {
      await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(outDir, { recursive: true });
      session = spawnHlsTranscode(ffmpegPath, sourceAbsolute, outDir, analysis, true);
      code = await session.closed;
    }
    if (code !== 0) {
      if (await hasPlayableSegment(outDir)) return;
      await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
      const detail = session.getStderr().trim().slice(-800);
      throw new Error(`FFmpeg 호환 변환에 실패했습니다.${detail ? `\n${detail}` : ''}`);
    }
  })();

  job.finished
    .catch((error) => {
      job.error = error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => {
      job.done = true;
    });

  return job;
}

/**
 * True while FFmpeg is still appending fragments to this preview file.
 * @param {string} absolutePath
 */
export function isVideoPreviewGrowing(absolutePath) {
  const job = liveJobs.get(absolutePath);
  return Boolean(job && !job.done);
}

/**
 * Lightweight status for an already-started transcode. Does not probe or start FFmpeg.
 * @param {string} relativePath
 */
export async function getVideoPreviewStatus(relativePath) {
  const sourceAbsolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(sourceAbsolute);
  const dir = cacheDirPath(relativePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  const growing = isVideoPreviewGrowing(dir);
  const complete = await cachedHlsComplete(dir);
  const playable = complete || (await hasPlayableSegment(dir));
  return {
    ok: true,
    remuxed: playable,
    stage: complete ? 'full' : growing || playable ? 'streaming' : 'source',
    fullReady: complete,
    protocol: playable || growing ? 'hls' : 'native',
  };
}

/**
 * Ensure a Chromium-playable preview exists. Starts fragmented transcode and
 * returns as soon as the first bytes can be streamed.
 * @param {string} relativePath
 * @param {string} [portableRoot]
 * @param {{ force?: boolean, waitForFull?: boolean }} [options]
 */
export async function ensureVideoPreview(relativePath, portableRoot, options = {}) {
  const force = Boolean(options.force);
  const waitForFull = Boolean(options.waitForFull) || force;
  const sourceAbsolute = resolvePortablePath(relativePath);
  const lockKey = `${sourceAbsolute}|${force ? 'force' : 'auto'}|${waitForFull ? 'full' : 'live'}`;
  const pending = inflightPreviews.get(lockKey);
  if (pending) return pending;

  const promise = ensureVideoPreviewUnlocked(relativePath, portableRoot, { force, waitForFull }).finally(
    () => {
      inflightPreviews.delete(lockKey);
    },
  );
  inflightPreviews.set(lockKey, promise);
  return promise;
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 * @param {{ force?: boolean, waitForFull?: boolean }} options
 */
async function ensureVideoPreviewUnlocked(relativePath, portableRoot, options) {
  const ffmpegPath = await getConfiguredFfmpegPath(portableRoot);
  const sourceAbsolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(sourceAbsolute);

  if (!ffmpegPath) {
    return previewResult(sourceAbsolute, false, 'ffmpeg-not-configured', 'source', true, 'native');
  }

  const probe = await probeMedia(sourceAbsolute, ffmpegPath);
  const analysis = analyzeProbe(probe, relativePath);

  if (!analysis.needsRemux && !options.force) {
    return previewResult(sourceAbsolute, false, 'already-compatible', 'source', true, 'native');
  }

  const outDir = cacheDirPath(relativePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  await fs.mkdir(outDir, { recursive: true });
  const reason = remuxReason(analysis);

  if (options.force && !isVideoPreviewGrowing(outDir)) {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(outDir, { recursive: true });
  }

  if (!options.force && (await cachedHlsComplete(outDir)) && !isVideoPreviewGrowing(outDir)) {
    return previewResult(outDir, true, 'cache-hit', 'full', true, 'hls');
  }

  const job = startLiveTranscode(ffmpegPath, sourceAbsolute, outDir, analysis);
  if (options.waitForFull) {
    await job.finished;
    if (job.error) throw job.error;
    return previewResult(outDir, true, reason, 'full', true, 'hls');
  }

  await waitUntilHlsPlayable(outDir, () => job.error);
  if (job.done) {
    if (job.error) throw job.error;
    return previewResult(outDir, true, reason, 'full', true, 'hls');
  }
  return previewResult(outDir, true, reason, 'streaming', false, 'hls');
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
