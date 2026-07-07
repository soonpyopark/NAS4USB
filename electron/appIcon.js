import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = __dirname;
const projectRoot = path.resolve(__dirname, '..');

/**
 * Electron 창·트레이·스플래시용 icon.png 경로 (존재하는 첫 후보).
 * @returns {string | undefined}
 */
export function resolveAppIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app-icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        path.join(electronDir, 'icon.png'),
        path.join(projectRoot, 'build/icon.png'),
        path.join(projectRoot, 'public/icon.png'),
        path.join(projectRoot, 'dist/icon.png'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
