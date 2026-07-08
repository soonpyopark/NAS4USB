import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = __dirname;
const projectRoot = path.resolve(__dirname, '..');

/**
 * @param {string[]} candidates
 * @returns {string | undefined}
 */
function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * 창·작업 표시줄용 아이콘. Windows는 다중 해상도 .ico 우선.
 * @returns {string | undefined}
 */
export function resolveAppIconPath() {
  const isWin = process.platform === 'win32';
  const candidates = app.isPackaged
    ? [
        ...(isWin ? [path.join(process.resourcesPath, 'app-icon.ico')] : []),
        path.join(process.resourcesPath, 'app-icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        ...(isWin
          ? [
              path.join(projectRoot, 'build/icon.ico'),
              path.join(electronDir, 'icon.ico'),
            ]
          : []),
        path.join(projectRoot, 'build/icon-512.png'),
        path.join(electronDir, 'icon.png'),
        path.join(projectRoot, 'build/icon.png'),
        path.join(projectRoot, 'public/icon.png'),
        path.join(projectRoot, 'dist/icon.png'),
      ];

  return firstExistingPath(candidates);
}

/**
 * 트레이 등 작은 아이콘 리사이즈용 고해상도 PNG.
 * @returns {string | undefined}
 */
export function resolveAppIconImagePath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app-icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        path.join(projectRoot, 'build/icon-512.png'),
        path.join(electronDir, 'icon.png'),
        path.join(projectRoot, 'build/icon.png'),
        path.join(projectRoot, 'public/icon.png'),
        path.join(projectRoot, 'dist/icon.png'),
      ];

  return firstExistingPath(candidates);
}
