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

const REMOTE_OR_INLINE_SRC = /^(https?:|data:|blob:|cid:|#|mailto:|javascript:)/i;
const SKIP_ASSET_EXT = /\.(css|js|map)$/i;

/**
 * @param {string} value
 */
function decodeAssetSrc(value) {
  const stripped = String(value ?? '')
    .replace(/&amp;/g, '&')
    .split(/[?#]/)[0];
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

/**
 * @param {string} dir
 * @param {string} originalSrc
 * @returns {Promise<{ absolute: string, bytes: Buffer } | null>}
 */
async function readRelativeAsset(dir, originalSrc) {
  const decoded = decodeAssetSrc(originalSrc);
  const raw = String(originalSrc ?? '')
    .replace(/&amp;/g, '&')
    .split(/[?#]/)[0];
  const names = [...new Set([path.basename(decoded), path.basename(raw)].filter(Boolean))];
  const candidates = [];
  for (const name of names) {
    candidates.push(
      path.resolve(dir, decoded),
      path.resolve(dir, raw),
      path.join(dir, name),
      path.join(dir, 'assets', name),
      path.join(dir, 'asset', name),
      path.join(dir, 'files', name),
      path.join(dir, 'media', name),
    );
  }
  const tried = new Set();
  for (const absolute of candidates) {
    if (tried.has(absolute)) continue;
    tried.add(absolute);
    try {
      const bytes = await fs.readFile(absolute);
      if (bytes.length > 0) return { absolute, bytes };
    } catch {
      // try the next location
    }
  }
  return null;
}

/**
 * @param {string} preferred
 * @param {Set<string>} usedNames
 */
function uniqueAssetName(preferred, usedNames) {
  let fileName = preferred || 'attachment.bin';
  if (!usedNames.has(fileName)) return fileName;
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let n = 2;
  while (usedNames.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
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
  /** @type {string[]} */
  const missing = [];

  const matches = String(html ?? '').matchAll(/\b(?:src|href|data)\s*=\s*["']([^"']+)["']/gi);
  for (const match of matches) {
    const originalSrc = match[1]?.trim();
    if (!originalSrc) continue;
    if (REMOTE_OR_INLINE_SRC.test(originalSrc)) continue;
    const lookName = path.basename(decodeAssetSrc(originalSrc));
    if (SKIP_ASSET_EXT.test(lookName)) continue;

    const found = await readRelativeAsset(dir, originalSrc);
    if (!found) {
      if (lookName && /\.[a-z0-9]{2,8}$/i.test(lookName)) missing.push(lookName);
      continue;
    }
    if (seen.has(found.absolute)) continue;
    seen.add(found.absolute);

    const fileName = uniqueAssetName(path.basename(found.absolute), usedNames);
    usedNames.add(fileName);
    assets.push({
      fileName,
      base64: found.bytes.toString('base64'),
      originalSrc,
    });
  }

  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const htmlCount = entries.filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name)).length;
  for (const entry of entries) {
    if (!entry.isFile() || /\.html?$/i.test(entry.name) || SKIP_ASSET_EXT.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (seen.has(full)) continue;
    if (htmlCount > 1 && !String(html ?? '').includes(entry.name)) continue;
    let bytes;
    try {
      bytes = await fs.readFile(full);
    } catch {
      continue;
    }
    if (!bytes.length) continue;
    seen.add(full);
    const fileName = uniqueAssetName(entry.name, usedNames);
    usedNames.add(fileName);
    assets.push({
      fileName,
      base64: bytes.toString('base64'),
      originalSrc: entry.name,
    });
  }

  return { assets, missing: [...new Set(missing)] };
}

/**
 * @param {unknown} error
 */
function converterErrorText(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.replace(/\s+/g, ' ').trim();
}

/**
 * A `.onepkg` keeps importing after a broken section and reports the failures at
 * the end, e.g. `1 section(s) failed to import: Error on file 비밀.one: …`.
 *
 * @param {string} text
 */
function failedSectionNames(text) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const match of text.matchAll(/Error on file\s+(.+?):\s/g)) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * A Rust panic only reaches JS as `unreachable`; the real cause goes to the
 * console, e.g. `panicked at …file_node.rs:173:17:` / `assertion failed: …`.
 *
 * @param {string[]} logLines
 */
function panicDetail(logLines) {
  const text = logLines.join('\n');
  const match = text.match(/panicked at [^\n]*\n\s*([^\n]+)/);
  return match?.[1]?.trim() ?? '';
}

/**
 * @param {string[]} logLines
 */
function unknownNodeTypes(logLines) {
  /** @type {Set<string>} */
  const types = new Set();
  for (const match of logLines.join('\n').matchAll(/Unknown node type:\s*(0x[0-9a-f]+)/gi)) {
    types.add(match[1].toLowerCase());
  }
  return [...types];
}

/**
 * @param {string} text
 * @param {string} [panicNote]
 */
function converterReason(text, panicNote = '') {
  // Drop the `Location: renderer\src\lib.rs:…` tail the WASM build appends.
  const detail = text.split(/\s*Location:\s*/)[0].trim();
  if (!detail || /unreachable/i.test(detail)) {
    return panicNote ? `변환기 내부 오류: ${panicNote}` : '변환기가 처리하지 못하는 구조입니다';
  }
  const cause = detail.match(/Malformed[\s\S]*$/i)?.[0] ?? detail;
  return cause.replace(/^Error:\s*/i, '').slice(0, 200).trim();
}

/**
 * @param {unknown} error
 * @param {string[]} [logLines]
 */
function skippedSectionsWarning(error, logLines = []) {
  const text = converterErrorText(error);
  const names = failedSectionNames(text);
  const reason = converterReason(text, panicDetail(logLines));
  if (names.length === 0) {
    return `원노트의 일부 내용을 변환하지 못해 건너뛰었습니다. (${reason})`;
  }
  const label = names.map((name) => `'${name}'`).join(', ');
  return `${label} 섹션을 변환하지 못해 건너뛰었습니다. (${reason})`;
}

/**
 * @param {unknown} error
 * @param {string[]} [logLines]
 */
function converterFailureMessage(error, logLines = []) {
  const text = converterErrorText(error);
  const names = failedSectionNames(text);
  const target = names.length ? `${names.map((name) => `'${name}'`).join(', ')} 섹션을` : '이 파일을';
  const unknown = unknownNodeTypes(logLines);
  return [
    `원노트 변환기가 ${target} 읽지 못했습니다. (${converterReason(text, panicDetail(logLines))})`,
    unknown.length ? `변환기가 모르는 데이터 구조: ${unknown.join(', ')}` : '',
    '원노트 앱에서 해당 섹션의 페이지를 새 섹션으로 복사해 저장한 뒤 다시 시도하거나, 페이지를 복사해 편집기에 붙여넣어 주세요.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The converter logs its progress, warnings and panic reason to the console, so
 * mirror those lines while it runs to explain failures afterwards.
 *
 * @param {() => void} run
 * @returns {string[]}
 */
function captureConverterLogs(run) {
  /** @type {string[]} */
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  /** @param {'log' | 'warn' | 'error'} level */
  const record =
    (level) =>
    (...args) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '));
      original[level](...args);
    };

  console.log = record('log');
  console.warn = record('warn');
  console.error = record('error');
  try {
    run();
  } finally {
    Object.assign(console, original);
  }
  return lines;
}

const CONVERTER_PACKAGE = '@tedyang2003/onenote-converter-wasm';

/**
 * The WASM build instantiates one shared module on `require`, and a Rust panic
 * leaves that instance poisoned — every later conversion then traps with
 * `unreachable` until the app restarts. Drop the cached module so each import
 * runs on a fresh instance.
 */
function loadConverter() {
  try {
    const entryId = require.resolve(CONVERTER_PACKAGE);
    const packageDir = path.dirname(entryId);
    const prefix = process.platform === 'win32' ? packageDir.toLowerCase() : packageDir;
    for (const cachedId of Object.keys(require.cache)) {
      const compare = process.platform === 'win32' ? cachedId.toLowerCase() : cachedId;
      if (compare.startsWith(prefix)) delete require.cache[cachedId];
    }
    return require(CONVERTER_PACKAGE);
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
 * @returns {Promise<{ pages: { title: string, html: string, assets: { fileName: string, base64: string, originalSrc: string }[] }[], warnings: string[] }>}
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
    /** @type {unknown} */
    let converterError = null;
    const logLines = captureConverterLogs(() => {
      try {
        oneNoteConverter(inputPath, outputDir, inputDir);
      } catch (err) {
        // Sections that already converted stay on disk, so keep whatever the
        // converter managed to write and decide once the output is known.
        converterError = err;
      }
    });

    const htmlFiles = await collectHtmlFiles(outputDir);
    if (htmlFiles.length === 0) {
      if (converterError) throw new Error(converterFailureMessage(converterError, logLines));
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
      if (converterError) throw new Error(converterFailureMessage(converterError, logLines));
      throw new Error('원노트에서 페이지를 찾지 못했습니다. 데스크톱 원노트의 .one / .onepkg 파일인지 확인하세요.');
    }

    /** @type {{ title: string, html: string, assets: { fileName: string, base64: string, originalSrc: string }[] }[]} */
    const pages = [];
    /** @type {string[]} */
    const missingNames = [];
    for (const item of selected) {
      const title =
        titleFromHtml(item.html) ||
        path.basename(item.htmlPath, path.extname(item.htmlPath)) ||
        `페이지 ${pages.length + 1}`;
      const { assets, missing } = await collectRelativeAssets(item.htmlPath, item.html);
      missingNames.push(...missing);
      pages.push({ title, html: item.html, assets });
    }

    const warnings = [];
    if (converterError) warnings.push(skippedSectionsWarning(converterError, logLines));
    const uniqueMissing = [...new Set(missingNames)];
    if (uniqueMissing.length) {
      warnings.push(
        `페이지에 연결된 일부 삽입 파일을 찾지 못했습니다: ${uniqueMissing.join(', ')}`,
      );
    }

    return {
      pages,
      warnings,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
