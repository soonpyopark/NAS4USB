import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getTempPath } from './appContext.js';

const require = createRequire(import.meta.url);

/**
 * @param {string} fileName
 */
function safeFileName(fileName) {
  const base = path.basename(String(fileName || 'section.one')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '');
  return base || 'section.one';
}

/**
 * @param {string} html
 */
function titleFromHtml(html) {
  const match = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return title || '';
}

/**
 * Joplin writes a section TOC (`<nav>` + iframe) next to real page HTML.
 * @param {string} html
 */
function isSectionIndexHtml(html) {
  const text = String(html ?? '');
  if (/X-OneNote-Order|X-Original-Page-Id/i.test(text)) return false;
  return /<nav\b/i.test(text) && /<iframe\b/i.test(text);
}

/**
 * @param {string} html
 */
function isOnenotePageHtml(html) {
  const text = String(html ?? '');
  if (/X-OneNote-Order|X-Original-Page-Id/i.test(text)) return true;
  return /class="[^"]*outline-element/.test(text);
}

/**
 * @param {string} html
 */
function pageOrderFromHtml(html) {
  const match = String(html ?? '').match(/X-OneNote-Order"\s+content="([^"]+)"/i);
  const order = Number(match?.[1]);
  return Number.isFinite(order) ? order : Number.POSITIVE_INFINITY;
}

function resolveWorkRoot() {
  try {
    return getTempPath() || os.tmpdir();
  } catch {
    return os.tmpdir();
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectHtmlFiles(dir) {
  /** @type {string[]} */
  const found = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (/OneNote_RecycleBin/i.test(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (entry.isFile() && /\.html?$/i.test(entry.name)) {
        found.push(full);
      }
    }
  }
  await walk(dir);
  found.sort((a, b) => a.localeCompare(b, 'ko'));
  return found;
}

/**
 * @param {string} htmlPath
 * @param {string} html
 */
async function collectRelativeAssets(htmlPath, html) {
  const dir = path.dirname(htmlPath);
  /** @type {{ fileName: string, base64: string, originalSrc: string }[]} */
  const assets = [];
  const seen = new Set();
  const usedNames = new Set();

  const matches = String(html ?? '').matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi);
  for (const match of matches) {
    const originalSrc = match[1]?.trim();
    if (!originalSrc) continue;
    if (/^(https?:|data:|blob:|cid:|assets\/|#|mailto:)/i.test(originalSrc)) continue;

    const decoded = originalSrc.replace(/&amp;/g, '&');
    const absolute = path.resolve(dir, decoded.split(/[?#]/)[0]);
    if (seen.has(absolute)) continue;
    seen.add(absolute);

    let bytes;
    try {
      bytes = await fs.readFile(absolute);
    } catch {
      continue;
    }

    let fileName = path.basename(absolute) || `asset-${assets.length + 1}.bin`;
    if (usedNames.has(fileName)) {
      const ext = path.extname(fileName);
      const stem = path.basename(fileName, ext);
      let n = 2;
      while (usedNames.has(`${stem}-${n}${ext}`)) n += 1;
      fileName = `${stem}-${n}${ext}`;
    }
    usedNames.add(fileName);
    assets.push({
      fileName,
      base64: bytes.toString('base64'),
      originalSrc,
    });
  }

  return assets;
}

function loadConverter() {
  try {
    return require('@tedyang2003/onenote-converter-wasm');
  } catch (err) {
    throw new Error(
      `원노트 변환기를 불러오지 못했습니다. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Convert a desktop OneNote `.one` / `.onepkg` to HTML pages + extracted files.
 *
 * @param {string} base64
 * @param {string} [fileName]
 * @returns {Promise<{ pages: { title: string, html: string, assets: { fileName: string, base64: string, originalSrc: string }[] }[] }>}
 */
export async function convertOnenoteBase64(base64, fileName = 'section.one') {
  if (!base64) throw new Error('원노트 파일이 비어 있습니다.');

  const workDir = await fs.mkdtemp(path.join(resolveWorkRoot(), 'nas4usb-one-'));
  try {
    const inputName = safeFileName(fileName);
    const inputDir = path.join(workDir, 'input');
    const outputDir = path.join(workDir, 'out');
    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const inputPath = path.join(inputDir, inputName);
    await fs.writeFile(inputPath, Buffer.from(base64, 'base64'));

    const { oneNoteConverter } = loadConverter();
    oneNoteConverter(inputPath, outputDir, inputDir);

    const htmlFiles = await collectHtmlFiles(outputDir);
    if (htmlFiles.length === 0) {
      throw new Error('원노트에서 페이지를 찾지 못했습니다. 데스크톱 원노트의 .one / .onepkg 파일인지 확인하세요.');
    }

    /** @type {{ htmlPath: string, html: string }[]} */
    const loaded = [];
    for (const htmlPath of htmlFiles) {
      const html = await fs.readFile(htmlPath, 'utf8');
      if (isSectionIndexHtml(html)) continue;
      loaded.push({ htmlPath, html });
    }

    const marked = loaded.filter((item) => isOnenotePageHtml(item.html));
    const selected = marked.length > 0 ? marked : loaded;
    selected.sort((a, b) => {
      const order = pageOrderFromHtml(a.html) - pageOrderFromHtml(b.html);
      if (order !== 0) return order;
      return a.htmlPath.localeCompare(b.htmlPath, 'ko');
    });

    if (selected.length === 0) {
      throw new Error('원노트에서 페이지를 찾지 못했습니다. 데스크톱 원노트의 .one / .onepkg 파일인지 확인하세요.');
    }

    /** @type {{ title: string, html: string, assets: { fileName: string, base64: string, originalSrc: string }[] }[]} */
    const pages = [];
    for (const item of selected) {
      const title =
        titleFromHtml(item.html) ||
        path.basename(item.htmlPath, path.extname(item.htmlPath)) ||
        `페이지 ${pages.length + 1}`;
      const assets = await collectRelativeAssets(item.htmlPath, item.html);
      pages.push({ title, html: item.html, assets });
    }

    return { pages };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
