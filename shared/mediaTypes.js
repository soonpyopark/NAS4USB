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

/**
 * `.ts` is an MPEG transport stream (video), not TypeScript — Chromium cannot
 * demux it, so it plays through the FFmpeg remux path like MKV/AVI.
 * @type {Record<string, string>}
 */
export const VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
};

/** @type {Record<string, string>} */
export const IMAGE_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  apng: 'image/apng',
};

export const PDF_MIME_TYPE = 'application/pdf';
export const HTML_MIME_TYPE = 'text/html; charset=utf-8';
export const EPUB_MIME_TYPE = 'application/epub+zip';

/** Comic / novel reader archives (Yomikiru-compatible openables). */
export const ARCHIVE_MIME_TYPES = {
  zip: 'application/zip',
  cbz: 'application/vnd.comicbook+zip',
  rar: 'application/vnd.rar',
  cbr: 'application/vnd.comicbook-rar',
  '7z': 'application/x-7z-compressed',
};

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIME_TYPES);
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_TYPES);
export const IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME_TYPES);
export const PDF_EXTENSIONS = ['pdf'];
export const HTML_EXTENSIONS = ['html', 'htm'];
export const EPUB_EXTENSIONS = ['epub'];
export const ARCHIVE_EXTENSIONS = Object.keys(ARCHIVE_MIME_TYPES);
/** Formats opened by ComicReaderShell (image/pdf/archives/epub). */
export const READER_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...EPUB_EXTENSIONS,
];

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

/**
 * @param {string | null | undefined} extension
 */
export function getImageMimeType(extension) {
  if (!extension) return 'application/octet-stream';
  return IMAGE_MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * @param {string | null | undefined} extension
 */
export function isImageExtension(extension) {
  return Boolean(extension && IMAGE_MIME_TYPES[extension.toLowerCase()]);
}

/**
 * @param {string | null | undefined} extension
 */
export function isPdfExtension(extension) {
  return Boolean(extension && extension.toLowerCase() === 'pdf');
}

/**
 * @param {string | null | undefined} [_extension]
 */
export function getPdfMimeType(_extension) {
  return PDF_MIME_TYPE;
}

/**
 * @param {string | null | undefined} extension
 */
export function isHtmlExtension(extension) {
  return Boolean(extension && HTML_EXTENSIONS.includes(extension.toLowerCase()));
}

/**
 * @param {string | null | undefined} [_extension]
 */
export function getHtmlMimeType(_extension) {
  return HTML_MIME_TYPE;
}

/**
 * @param {string | null | undefined} extension
 */
export function isEpubExtension(extension) {
  return Boolean(extension && extension.toLowerCase() === 'epub');
}

/**
 * @param {string | null | undefined} [_extension]
 */
export function getEpubMimeType(_extension) {
  return EPUB_MIME_TYPE;
}

/**
 * @param {string | null | undefined} extension
 */
export function isArchiveExtension(extension) {
  return Boolean(extension && ARCHIVE_MIME_TYPES[extension.toLowerCase()]);
}

/**
 * @param {string | null | undefined} extension
 */
export function getArchiveMimeType(extension) {
  if (!extension) return 'application/octet-stream';
  return ARCHIVE_MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * @param {string | null | undefined} extension
 */
export function isReaderExtension(extension) {
  const ext = String(extension ?? '').toLowerCase();
  return (
    isImageExtension(ext) ||
    isPdfExtension(ext) ||
    isArchiveExtension(ext) ||
    isEpubExtension(ext)
  );
}

/**
 * Content-Type for `/api/fs/stream` (media players, image/PDF/HTML in-app viewers).
 * @param {string | null | undefined} extension
 */
export function getStreamContentType(extension) {
  const ext = String(extension ?? '').toLowerCase();
  if (isVideoExtension(ext)) return getVideoMimeType(ext);
  if (isAudioExtension(ext)) return getAudioMimeType(ext);
  if (isImageExtension(ext)) return getImageMimeType(ext);
  if (isPdfExtension(ext)) return PDF_MIME_TYPE;
  if (isHtmlExtension(ext)) return HTML_MIME_TYPE;
  if (isEpubExtension(ext)) return EPUB_MIME_TYPE;
  if (isArchiveExtension(ext)) return getArchiveMimeType(ext);
  return 'application/octet-stream';
}

/**
 * Best-effort MIME type guess for an editor asset file name (images/video/audio/pdf/html); falls
 * back to a generic binary type for anything else (docx, etc.).
 * @param {string} fileName
 */
export function guessMimeFromFileName(fileName) {
  const ext = (String(fileName ?? '').split('.').pop() ?? '').toLowerCase();
  if (isImageExtension(ext)) return getImageMimeType(ext);
  if (isVideoExtension(ext)) return getVideoMimeType(ext);
  if (isAudioExtension(ext)) return getAudioMimeType(ext);
  if (isPdfExtension(ext)) return PDF_MIME_TYPE;
  if (isHtmlExtension(ext)) return HTML_MIME_TYPE;
  if (isEpubExtension(ext)) return EPUB_MIME_TYPE;
  if (isArchiveExtension(ext)) return getArchiveMimeType(ext);
  return 'application/octet-stream';
}
