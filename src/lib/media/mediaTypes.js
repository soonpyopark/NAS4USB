/** @type {Record<string, string>} */
export const AUDIO_MIME_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  weba: 'audio/webm',
};

/** @type {Record<string, string>} */
export const VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  avi: 'video/x-msvideo',
};

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIME_TYPES);
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_TYPES);

/**
 * @param {string | null | undefined} extension
 */
export function getAudioMimeType(extension) {
  if (!extension) return 'audio/mpeg';
  return AUDIO_MIME_TYPES[extension.toLowerCase()] ?? 'audio/mpeg';
}

/**
 * @param {string | null | undefined} extension
 */
export function getVideoMimeType(extension) {
  if (!extension) return 'video/mp4';
  return VIDEO_MIME_TYPES[extension.toLowerCase()] ?? 'video/mp4';
}

/**
 * @param {string | null | undefined} extension
 */
export function isAudioExtension(extension) {
  return Boolean(extension && AUDIO_MIME_TYPES[extension.toLowerCase()]);
}

/**
 * @param {string | null | undefined} extension
 */
export function isVideoExtension(extension) {
  return Boolean(extension && VIDEO_MIME_TYPES[extension.toLowerCase()]);
}
