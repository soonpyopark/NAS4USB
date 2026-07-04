/**
 * HWPX section/header XML → HTML (한글형 레이아웃·서식)
 */

const RHWP_BODY_PATH = 'Contents/rhwp-body.html';
const SECTION_PATH_PATTERN = /Contents\/section\d+\.xml$/i;

const CONTROL_RUN_CHILDREN = new Set([
  'secpr',
  'ctrl',
  'footnote',
  'endnote',
  'header',
  'footer',
  'pagebreak',
  'columnbreak',
  'linesegarray',
]);

/**
 * @param {Element} el
 */
function localName(el) {
  return (el.localName || el.tagName.split(':').pop() || '').toLowerCase();
}

/**
 * @param {string} value
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Record<string, string>} styles
 */
function styleObjectToCss(styles) {
  return Object.entries(styles)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${prop}:${value}`;
    })
    .join(';');
}

/**
 * @param {string} headerXml
 */
export function parseHeaderStyles(headerXml) {
  /** @type {Map<string, Record<string, string>>} */
  const charPr = new Map();
  /** @type {Map<string, Record<string, string>>} */
  const paraPr = new Map();
  /** @type {Map<string, string>} */
  const fontFaces = new Map();

  if (!headerXml) {
    return { charPr, paraPr, fontFaces };
  }

  const doc = new DOMParser().parseFromString(headerXml, 'application/xml');

  for (const el of doc.getElementsByTagName('*')) {
    const name = localName(el);
    if (name === 'font') {
      const id = el.getAttribute('id');
      const face = el.getAttribute('face');
      if (id != null && face) fontFaces.set(id, face);
    }
  }

  for (const el of doc.getElementsByTagName('*')) {
    const name = localName(el);
    if (name === 'charpr') {
      const id = el.getAttribute('id');
      if (id == null) continue;

      const height = Number(el.getAttribute('height') || 1000);
      const fontSize = `${Math.max(6, height / 100)}pt`;
      const bold =
        el.getAttribute('bold') === '1' ||
        el.getAttribute('bold') === 'true' ||
        el.getAttribute('weight') === 'bold';
      const italic = el.getAttribute('italic') === '1' || el.getAttribute('italic') === 'true';
      const color = el.getAttribute('textColor') || '#000000';

      let fontFamily = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', serif";
      for (const child of el.children) {
        if (localName(child) === 'fontref') {
          const hangulId = child.getAttribute('hangul') ?? child.getAttribute('Hangul');
          if (hangulId != null && fontFaces.has(hangulId)) {
            fontFamily = `'${fontFaces.get(hangulId)}', ${fontFamily}`;
          }
        }
      }

      charPr.set(id, {
        fontSize,
        fontWeight: bold ? '700' : '400',
        fontStyle: italic ? 'italic' : 'normal',
        color,
        fontFamily,
      });
    }

    if (name === 'parapr') {
      const id = el.getAttribute('id');
      if (id == null) continue;

      let alignRaw = (el.getAttribute('align') || 'LEFT').toLowerCase();
      for (const child of el.children) {
        if (localName(child) === 'align') {
          const horizontal = child.getAttribute('horizontal') || child.getAttribute('align');
          if (horizontal) alignRaw = horizontal.toLowerCase();
        }
      }

      const alignMap = {
        left: 'left',
        center: 'center',
        right: 'right',
        justify: 'justify',
        distribute: 'justify',
      };

      let lineHeight = '1.6';
      for (const child of el.children) {
        if (localName(child) !== 'linespacing') continue;
        const lineSpacing = child.getAttribute('value') || child.getAttribute('lineSpacing');
        const lineSpacingType = child.getAttribute('type') || child.getAttribute('lineSpacingType') || 'PERCENT';
        if (lineSpacing) {
          lineHeight =
            lineSpacingType === 'PERCENT'
              ? String(Number(lineSpacing) / 100)
              : String(Number(lineSpacing) / 100);
        }
      }

      const lineSpacing = el.getAttribute('lineSpacing');
      const lineSpacingType = el.getAttribute('lineSpacingType') || 'PERCENT';
      if (lineSpacing && lineHeight === '1.6') {
        lineHeight =
          lineSpacingType === 'PERCENT'
            ? String(Number(lineSpacing) / 100)
            : String(Number(lineSpacing) / 100);
      }

      paraPr.set(id, {
        textAlign: alignMap[alignRaw] || 'left',
        lineHeight,
        marginBottom: '0.35em',
      });
    }
  }

  return { charPr, paraPr, fontFaces };
}

/**
 * @param {import('jszip').JSZip} zip
 * @param {string} ref
 * @param {Map<string, string>} cache
 */
async function resolveBinImage(zip, ref, cache) {
  if (!ref) return '';
  if (cache.has(ref)) return cache.get(ref);

  const normalized = ref.replace(/^#/, '');
  const binFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('BinData/') && !zip.files[name].dir,
  );

  let match = binFiles.find((name) => name.endsWith(`/${normalized}`) || name.includes(normalized));
  if (!match) {
    const base = normalized.replace(/\.[^.]+$/, '');
    match = binFiles.find((name) => name.includes(base));
  }

  if (!match) return '';

  const ext = match.split('.').pop()?.toLowerCase() ?? 'png';
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : 'application/octet-stream';

  const base64 = await zip.file(match).async('base64');
  const url = `data:${mime};base64,${base64}`;
  cache.set(ref, url);
  return url;
}

/**
 * @param {Element} picEl
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function convertPicture(picEl, zip, binCache) {
  let imgEl = null;
  for (const node of picEl.getElementsByTagName('*')) {
    if (localName(node) === 'img') {
      imgEl = node;
      break;
    }
  }
  if (!imgEl) return '';

  const ref =
    imgEl.getAttribute('binaryItemIDRef') ||
    imgEl.getAttribute('binItemIDRef') ||
    imgEl.getAttribute('href');
  const src = await resolveBinImage(zip, ref ?? '', binCache);
  if (!src) return '';

  return `<img class="rhwp-image" src="${src}" alt="${escapeHtml(imgEl.getAttribute('alt') || '그림')}" />`;
}

/**
 * @param {Element} runEl
 * @param {{ charPr: Map<string, Record<string, string>> }} styles
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function convertRun(runEl, styles, zip, binCache) {
  const charPrIDRef = runEl.getAttribute('charPrIDRef');
  const charStyle = { ...(styles.charPr.get(charPrIDRef ?? '') ?? {}) };
  /** @type {string[]} */
  const parts = [];

  for (const child of runEl.children) {
    const name = localName(child);
    if (CONTROL_RUN_CHILDREN.has(name)) continue;
    if (name === 't') {
      parts.push(escapeHtml(child.textContent ?? ''));
    } else if (name === 'tab') {
      parts.push('&nbsp;&nbsp;&nbsp;&nbsp;');
    } else if (name === 'br') {
      parts.push('<br />');
    } else if (name === 'pic') {
      parts.push(await convertPicture(child, zip, binCache));
    } else if (name === 'tbl') {
      parts.push(await convertTable(child, styles, zip, binCache));
    }
  }

  const content = parts.join('');
  if (!content) return '';
  if (/<table[\s>]/i.test(content)) {
    return content;
  }
  return `<span style="${styleObjectToCss(charStyle)}">${content}</span>`;
}

/**
 * @param {Element} pEl
 * @param {{ charPr: Map<string, Record<string, string>>, paraPr: Map<string, Record<string, string>> }} styles
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function convertParagraph(pEl, styles, zip, binCache) {
  const paraPrIDRef = pEl.getAttribute('paraPrIDRef');
  const outlineLevel = Number(pEl.getAttribute('outlineLevel') || 0);
  const paraStyle = { ...(styles.paraPr.get(paraPrIDRef ?? '') ?? {}) };

  let tag = 'p';
  if (outlineLevel >= 1 && outlineLevel <= 6) {
    tag = `h${outlineLevel}`;
    paraStyle.fontWeight = '700';
    paraStyle.marginTop = '0.75em';
    paraStyle.marginBottom = '0.35em';
  }

  /** @type {string[]} */
  const runs = [];
  for (const child of pEl.children) {
    const name = localName(child);
    if (name === 'linesegarray') continue;
    if (name === 'run') {
      runs.push(await convertRun(child, styles, zip, binCache));
    } else if (name === 'pic') {
      runs.push(await convertPicture(child, zip, binCache));
    } else if (name === 'tbl') {
      runs.push(await convertTable(child, styles, zip, binCache));
    }
  }

  const body = runs.join('');
  if (!body.trim()) return '';

  return `<${tag} class="rhwp-paragraph" style="${styleObjectToCss(paraStyle)}">${body}</${tag}>`;
}

/**
 * @param {Element} tcEl
 * @param {{ charPr: Map<string, Record<string, string>>, paraPr: Map<string, Record<string, string>> }} styles
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function convertTableCell(tcEl, styles, zip, binCache) {
  let colSpan = Number(tcEl.getAttribute('gridSpan') || tcEl.getAttribute('colSpan') || 1);
  let rowSpan = Number(tcEl.getAttribute('rowSpan') || 1);
  let vertAlign = 'top';

  for (const child of tcEl.children) {
    const name = localName(child);
    if (name === 'cellspan') {
      colSpan = Number(child.getAttribute('colSpan') || child.getAttribute('colspan') || colSpan);
      rowSpan = Number(child.getAttribute('rowSpan') || child.getAttribute('rowspan') || rowSpan);
    } else if (name === 'sublist') {
      const align = (child.getAttribute('vertAlign') || child.getAttribute('verticalAlign') || '').toUpperCase();
      if (align === 'CENTER') vertAlign = 'middle';
      else if (align === 'BOTTOM') vertAlign = 'bottom';
    }
  }

  if (colSpan === 0 || rowSpan === 0) {
    return '';
  }

  const inner = await processBlockContainer(tcEl, styles, zip, binCache);
  const spanAttrs = `${colSpan > 1 ? ` colspan="${colSpan}"` : ''}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''}`;
  const cellStyle = styleObjectToCss({ verticalAlign: vertAlign });

  return `<td class="rhwp-table-cell"${spanAttrs}${cellStyle ? ` style="${cellStyle}"` : ''}>${inner || '<p><br /></p>'}</td>`;
}

/**
 * @param {Element} tblEl
 * @param {{ charPr: Map<string, Record<string, string>>, paraPr: Map<string, Record<string, string>> }} styles
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function convertTable(tblEl, styles, zip, binCache) {
  /** @type {string[]} */
  const rows = [];

  for (const child of tblEl.children) {
    if (localName(child) !== 'tr') continue;

    /** @type {string[]} */
    const cells = [];
    for (const cell of child.children) {
      if (localName(cell) === 'tc') {
        cells.push(await convertTableCell(cell, styles, zip, binCache));
      }
    }
    if (cells.length) {
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
  }

  return `<table class="rhwp-table">${rows.join('')}</table>`;
}

/**
 * @param {Element} container
 * @param {{ charPr: Map<string, Record<string, string>>, paraPr: Map<string, Record<string, string>> }} styles
 * @param {import('jszip').JSZip} zip
 * @param {Map<string, string>} binCache
 */
async function processBlockContainer(container, styles, zip, binCache) {
  /** @type {string[]} */
  const parts = [];

  for (const child of container.children) {
    const name = localName(child);
    if (
      name === 'linesegarray' ||
      name === 'celladdr' ||
      name === 'cellspan' ||
      name === 'cellsz' ||
      name === 'cellmargin'
    ) {
      continue;
    }
    if (name === 'sublist') {
      parts.push(await processBlockContainer(child, styles, zip, binCache));
    } else if (name === 'p') {
      parts.push(await convertParagraph(child, styles, zip, binCache));
    } else if (name === 'tbl') {
      parts.push(await convertTable(child, styles, zip, binCache));
    } else if (name === 'pic') {
      parts.push(await convertPicture(child, zip, binCache));
    }
  }

  return parts.join('\n');
}

/**
 * @param {string} sectionXml
 * @param {import('jszip').JSZip} zip
 * @param {{ charPr: Map<string, Record<string, string>>, paraPr: Map<string, Record<string, string>> }} styles
 * @param {Map<string, string>} binCache
 */
async function convertSectionXmlToHtml(sectionXml, zip, styles, binCache) {
  const doc = new DOMParser().parseFromString(sectionXml, 'application/xml');
  return processBlockContainer(doc.documentElement, styles, zip, binCache);
}

/**
 * @param {import('jszip').JSZip} zip
 * @returns {Promise<string>}
 */
export async function convertHwpxZipToHtml(zip) {
  if (zip.file(RHWP_BODY_PATH)) {
    return zip.file(RHWP_BODY_PATH).async('string');
  }

  const headerXml = zip.file('Contents/header.xml')
    ? await zip.file('Contents/header.xml').async('string')
    : '';
  const styles = parseHeaderStyles(headerXml);
  const binCache = new Map();

  const sectionNames = Object.keys(zip.files)
    .filter((name) => SECTION_PATH_PATTERN.test(name) && !zip.files[name].dir)
    .sort();

  /** @type {string[]} */
  const sections = [];
  for (const name of sectionNames) {
    const xml = await zip.file(name).async('string');
    sections.push(await convertSectionXmlToHtml(xml, zip, styles, binCache));
  }

  const body = sections.filter(Boolean).join('\n');
  return body ? `<div class="rhwp-hwpx-body">${body}</div>` : '<p><br /></p>';
}

/**
 * @param {import('jszip').JSZip} zip
 * @returns {Promise<string>}
 */
export async function extractPlainTextFromZip(zip) {
  const sectionNames = Object.keys(zip.files)
    .filter((name) => SECTION_PATH_PATTERN.test(name) && !zip.files[name].dir)
    .sort();

  /** @type {string[]} */
  const chunks = [];
  for (const name of sectionNames) {
    const xml = await zip.file(name).async('string');
    for (const match of xml.matchAll(/<(?:\w+:)?t[^>]*>([^<]*)<\/(?:\w+:)?t>/gi)) {
      chunks.push(match[1]);
    }
  }

  return chunks.join('\n');
}
