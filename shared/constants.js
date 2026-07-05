/** Default Y.js WebSocket broker port (LAN sync). */
export const DEFAULT_SYNC_PORT = 3008;

/** Application display version. */
export const APP_VERSION = '1.0.1';

/** Application display name. */
export const APP_NAME = 'NAS4USB';

/** Top bar / window title with subtitle. */
export const APP_NAME_LONG = 'NAS4USB';

/** Sidebar badge label. */
export const APP_ICON_LABEL = 'N$U';

/** Web/Electron UI icon (served from Vite public/). */
export const APP_ICON_URL = '/icon.png';

/** Initial department folder under data/. */
export const DEFAULT_DEPARTMENT_CODE = '0000001';

/** Default data directory name under portable/build root. */
export const DEFAULT_DATA_DIR = 'data';

/** Default administrator credentials (override via `.env`). */
export const DEFAULT_ADMIN_ID = 'admin';
export const DEFAULT_ADMIN_PW = 'admin1234';

/** 7-digit department folder name pattern. */
export const DEPARTMENT_CODE_PATTERN = /^\d{7}$/;

/** Trash folder name under data root (visible in readDir). */
export const TRASH_FOLDER = '__trash';
