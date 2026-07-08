/** @type {Record<string, string>} */
const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

/** @returns {string} */
function randomStorageSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {File} file
 */
export function isBlockUploadAllowed(file) {
  if (!file || file.size <= 0) return false;

  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) {
    return true;
  }

  return Boolean(file.name?.trim());
}

/**
 * @param {string} mime
 * @param {string} [fileName]
 */
export function extensionFromUploadFile(mime, fileName = '') {
  const normalizedMime = (mime || '').toLowerCase();
  if (MIME_TO_EXTENSION[normalizedMime]) {
    return MIME_TO_EXTENSION[normalizedMime];
  }

  const fromName = fileName.match(/\.([a-zA-Z0-9]{1,8})$/);
  if (fromName) return fromName[1].toLowerCase();

  if (normalizedMime.startsWith('video/')) return 'mp4';
  if (normalizedMime.startsWith('audio/')) return 'mp3';
  if (normalizedMime.startsWith('image/')) return 'png';
  return 'bin';
}

/**
 * @param {File} file
 */
function defaultUploadStem(file) {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/')) return 'image';
  return 'file';
}

/**
 * Disk storage file name (ASCII, short). Original `file.name` is kept in block props for display.
 * @param {File} file
 */
export function resolveBlockUploadFileName(file) {
  const ext = extensionFromUploadFile(file.type, file.name || '');
  const stem = defaultUploadStem(file);
  return `${stem}-${randomStorageSuffix()}.${ext}`;
}

/**
 * @param {File} file
 */
export function blockUploadNotAllowedMessage(file) {
  const type = file?.type || 'unknown';
  return `업로드할 수 없는 파일입니다 (${type || '알 수 없는 형식'}).`;
}
