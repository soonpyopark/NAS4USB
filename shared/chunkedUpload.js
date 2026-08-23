/** Files this size or larger use binary chunked upload instead of JSON base64. */
export const LARGE_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;

export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

/** Per-chunk HTTP timeout. Whole-file upload can take many minutes. */
export const UPLOAD_PART_TIMEOUT_MS = 180000;

export const UPLOAD_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Reject a single declared upload larger than this. */
export const MAX_UPLOAD_BYTES = 13 * 1024 * 1024 * 1024;

export const MAX_UPLOAD_PART_BYTES = UPLOAD_CHUNK_BYTES * 2;
