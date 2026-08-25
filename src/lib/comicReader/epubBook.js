import JSZip from 'jszip';
import { nasScrollbarStyleTag } from '../ui/nasScrollbarStyle.js';

/**
 * @typedef {{ id: string, href: string, mediaType: string }} EpubManifestItem
 * @typedef {{ idref: string, href: string, mediaType: string }} EpubSpineItem
 * @typedef {{
 *   title: string,
 *   spine: EpubSpineItem[],
 *   blobUrls: Map<string, string>,
 *   chapterHtml: Map<string, string>,
 *   revoke: () => void,
 * }} OpenedEpub
 */

/**
 * @param {string} fromPath directory of the referring file, e.g. "OEBPS/Text"
 * @param {string} relative
 */
function resolveZipPath(fromPath, relative) {
  const baseParts = fromPath.split('/').filter(Boolean);
  const rel = String(relative || '').replace(/\\/g, '/').split('#')[0].split('?')[0];
  if (!rel) return fromPath;
  if (rel.startsWith('/')) {
    return rel.replace(/^\/+/, '');
  }
  const parts = [...baseParts];
  for (const segment of rel.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/**
 * @param {string} xml
 * @param {string} tag
 */
function firstTagContent(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(re);
  return match?.[1]?.trim() ?? '';
}

/**
 * @param {string} xml
 * @param {string} localName
 */
function collectAttrs(xml, localName) {
  const re = new RegExp(`<${localName}\\b([^>]*)>`, 'gi');
  /** @type {Array<Record<string, string>>} */
  const items = [];
  let match;
  while ((match = re.exec(xml))) {
    const attrs = match[1].replace(/\/\s*$/, '');
    /** @type {Record<string, string>} */
    const map = {};
    const attrRe = /([:\w.-]+)\s*=\s*["']([^"']*)["']/g;
    let am;
    while ((am = attrRe.exec(attrs))) {
      map[am[1].toLowerCase()] = am[2];
    }
    items.push(map);
  }
  return items;
}

/**
 * @param {string} html
 * @param {string} chapterPath zip path of the xhtml file
 * @param {Map<string, string>} blobUrls
 */
function rewriteChapterHtml(html, chapterPath, blobUrls) {
  const dir = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/')) : '';

  const resolve = (ref) => {
    const cleaned = String(ref || '').trim();
    if (!cleaned || /^(https?:|data:|blob:|mailto:|#)/i.test(cleaned)) return cleaned;
    const path = resolveZipPath(dir, cleaned);
    return blobUrls.get(path) || blobUrls.get(path.replace(/^\/+/, '')) || cleaned;
  };

  let out = html.replace(
    /\b(src|href|xlink:href)\s*=\s*(["'])([^"']*)\2/gi,
    (full, attr, quote, value) => `${attr}=${quote}${resolve(value)}${quote}`,
  );

  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, value) => {
    const next = resolve(value);
    return `url(${quote || ''}${next}${quote || ''})`;
  });

  return out;
}

/**
 * Open an EPUB ArrayBuffer into spine chapters with blob URLs.
 * @param {ArrayBuffer} data
 * @returns {Promise<OpenedEpub>}
 */
export async function openEpubBook(data) {
  const zip = await JSZip.loadAsync(data);
  /** @type {string[]} */
  const createdUrls = [];
  /** @type {Map<string, string>} */
  const blobUrls = new Map();

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  for (const name of fileNames) {
    const normalized = name.replace(/\\/g, '/');
    const lower = normalized.toLowerCase();
    const blob = await zip.files[name].async('blob');
    let typed = blob;
    if (lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) {
      typed = new Blob([blob], { type: 'application/xhtml+xml' });
    } else if (lower.endsWith('.css')) {
      typed = new Blob([blob], { type: 'text/css' });
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      typed = new Blob([blob], { type: 'image/jpeg' });
    } else if (lower.endsWith('.png')) {
      typed = new Blob([blob], { type: 'image/png' });
    } else if (lower.endsWith('.svg')) {
      typed = new Blob([blob], { type: 'image/svg+xml' });
    } else if (lower.endsWith('.ncx')) {
      typed = new Blob([blob], { type: 'application/x-dtbncx+xml' });
    }
    const url = URL.createObjectURL(typed);
    createdUrls.push(url);
    blobUrls.set(normalized, url);
  }

  const containerEntry =
    zip.file('META-INF/container.xml') ||
    zip.file('meta-inf/container.xml') ||
    fileNames.map((n) => zip.files[n]).find((f) => /META-INF\/container\.xml$/i.test(f.name));
  if (!containerEntry) {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    throw new Error('EPUB container.xml을 찾지 못했습니다.');
  }

  const containerXml = await containerEntry.async('string');
  const rootfile = collectAttrs(containerXml, 'rootfile')[0];
  const opfPath = (rootfile?.['full-path'] || rootfile?.['full-Path'] || '').replace(/\\/g, '/');
  if (!opfPath) {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    throw new Error('EPUB OPF 경로를 찾지 못했습니다.');
  }

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    throw new Error(`EPUB OPF를 찾지 못했습니다: ${opfPath}`);
  }

  const opfXml = await opfEntry.async('string');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const title = firstTagContent(opfXml, 'dc:title') || firstTagContent(opfXml, 'title') || 'EPUB';

  /** @type {Map<string, EpubManifestItem>} */
  const manifest = new Map();
  for (const item of collectAttrs(opfXml, 'item')) {
    const id = item.id;
    const href = item.href;
    if (!id || !href) continue;
    const resolvedHref = resolveZipPath(opfDir, href);
    manifest.set(id, {
      id,
      href: resolvedHref,
      mediaType: item['media-type'] || item['media-Type'] || '',
    });
  }

  /** @type {EpubSpineItem[]} */
  const spine = [];
  for (const itemref of collectAttrs(opfXml, 'itemref')) {
    const idref = itemref.idref;
    if (!idref) continue;
    const manifestItem = manifest.get(idref);
    if (!manifestItem) continue;
    spine.push({
      idref,
      href: manifestItem.href,
      mediaType: manifestItem.mediaType,
    });
  }

  if (spine.length === 0) {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    throw new Error('EPUB spine이 비어 있습니다.');
  }

  // Rebuild chapter contents with rewritten asset links so images/css resolve.
  /** @type {Map<string, string>} */
  const chapterHtml = new Map();
  for (const chapter of spine) {
    const entry = zip.file(chapter.href);
    if (!entry) continue;
    const raw = await entry.async('string');
    const rewritten = rewriteChapterHtml(raw, chapter.href, blobUrls);
    chapterHtml.set(chapter.href, rewritten);
    const type = chapter.mediaType || 'application/xhtml+xml';
    const prev = blobUrls.get(chapter.href);
    if (prev) URL.revokeObjectURL(prev);
    const nextUrl = URL.createObjectURL(new Blob([rewritten], { type }));
    createdUrls.push(nextUrl);
    blobUrls.set(chapter.href, nextUrl);
  }

  return {
    title,
    spine,
    blobUrls,
    chapterHtml,
    revoke: () => {
      for (const url of createdUrls) URL.revokeObjectURL(url);
      blobUrls.clear();
      chapterHtml.clear();
    },
  };
}

/**
 * @param {OpenedEpub} book
 * @param {number} index
 * @param {number} fontScale
 * @returns {string}
 */
export function buildChapterHtmlDocument(book, index, fontScale) {
  const chapter = book.spine[index];
  if (!chapter) return '<p>빈 챕터</p>';
  let html = book.chapterHtml.get(chapter.href);
  if (!html) return '<p>챕터를 불러오지 못했습니다.</p>';
  const percent = Math.round(100 * fontScale);
  const style = `${nasScrollbarStyleTag()}<style>
    html, body { margin: 0; padding: 1rem 1.25rem; background: #fff; color: #111; }
    body { font-size: ${percent}%; line-height: 1.55; }
    img, svg { max-width: 100%; height: auto; }
  </style>`;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${style}</head>`);
  } else if (/<body\b/i.test(html)) {
    html = html.replace(/<body\b[^>]*>/i, (m) => `${m}${style}`);
  } else {
    html = `${style}${html}`;
  }
  return html;
}
