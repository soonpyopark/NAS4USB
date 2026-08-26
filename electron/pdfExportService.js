import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { getTempPath } from './appContext.js';

const MM_PER_INCH = 25.4;
const LOAD_TIMEOUT_MS = 30000;
/** Data URL images are already decoded by the time load resolves; this covers webfonts. */
const SETTLE_MS = 250;

/**
 * @param {string} value
 * @param {string} fallback
 */
function toFileStem(value, fallback = 'document') {
  const stem = String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-()\uac00-\ud7a3 ]+/g, '_')
    .trim();
  return stem || fallback;
}

function resolveTempRoot() {
  try {
    return getTempPath() || os.tmpdir();
  } catch {
    return os.tmpdir();
  }
}

/**
 * @param {Promise<unknown>} promise
 * @param {number} timeoutMs
 * @param {string} message
 */
async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Render a standalone HTML document with Chromium and return PDF bytes.
 *
 * The HTML is printed by the same engine that paints the editor, so the PDF
 * matches what the export HTML looks like on screen.
 *
 * @param {{
 *   html: string,
 *   fileName?: string,
 *   pageSize?: 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter' | 'Tabloid',
 *   landscape?: boolean,
 *   marginMm?: number,
 *   preferCssPageSize?: boolean,
 *   printBackground?: boolean,
 * }} input
 * @returns {Promise<{ base64: string, fileName: string }>}
 */
export async function convertHtmlToPdfBase64(input) {
  const html = String(input?.html ?? '');
  if (!html.trim()) {
    throw new Error('PDF로 내보낼 내용이 없습니다.');
  }

  const outName = `${toFileStem(input?.fileName)}.pdf`;
  const marginInches = Math.max(0, Number(input?.marginMm ?? 12)) / MM_PER_INCH;

  const workDir = await fs.mkdtemp(path.join(resolveTempRoot(), 'nas4usb-pdf-'));
  const htmlPath = path.join(workDir, 'document.html');
  await fs.writeFile(htmlPath, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      // Export HTML is fully pre-rendered markup; no scripts need to run.
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  try {
    await withTimeout(
      win.loadFile(htmlPath),
      LOAD_TIMEOUT_MS,
      'PDF로 내보낼 문서를 여는 데 시간이 너무 오래 걸립니다.',
    );
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const pdf = await win.webContents.printToPDF({
      pageSize: input?.pageSize ?? 'A4',
      landscape: Boolean(input?.landscape),
      printBackground: input?.printBackground !== false,
      margins: {
        top: marginInches,
        bottom: marginInches,
        left: marginInches,
        right: marginInches,
      },
      preferCSSPageSize: Boolean(input?.preferCssPageSize),
    });

    return { base64: pdf.toString('base64'), fileName: outName };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
