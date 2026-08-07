/**
 * Convert HTML → HWPX via rhwp-studio embed (load blank → pasteHtml → exportHwpx).
 * Avoids direct HwpDocument free/export races ("ownership while borrowed").
 */

import JSZip from 'jszip';
import { createRhwpStudioClient } from '@nas4usb/rhwp/rhwpStudioClient.js';
import { bytesToBase64 } from '../bytes.js';

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/NoName.hwpx`;

/**
 * Blank NAS4USB template ships with body text "NoName" — strip it before paste.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
async function stripTemplatePlaceholderText(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !/Contents\/section\d+\.xml$/i.test(path)) continue;
    const xml = await file.async('string');
    const next = xml
      .replace(/(<hp:t\b[^>]*>)\s*NoName\s*(<\/hp:t>)/gi, '$1$2')
      .replace(/(<hp:t\b[^>]*>)\s*제목 없음\s*(<\/hp:t>)/gi, '$1$2');
    if (next !== xml) {
      zip.file(path, next);
      changed = true;
    }
  }

  if (!changed) return bytes;
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * @returns {string}
 */
function getStudioUrl() {
  const url = new URL('rhwp-studio/index.html', window.location.href);
  url.searchParams.set('embed', '1');
  url.searchParams.set('url', '');
  return url.href;
}

/**
 * @param {string} html
 * @returns {string}
 */
function normalizeHtmlForPaste(html) {
  const raw = String(html ?? '').trim();
  if (!raw) return '<p><br></p>';

  if (/<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      const body = doc.body?.innerHTML?.trim();
      if (body) return body;
    } catch {
      // fall through
    }
  }

  return raw;
}

/**
 * @returns {Promise<Uint8Array>}
 */
async function loadBlankTemplateBytes() {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`HWPX 템플릿을 불러오지 못했습니다: ${TEMPLATE_URL}`);
  }
  const raw = new Uint8Array(await response.arrayBuffer());
  return stripTemplatePlaceholderText(raw);
}

/**
 * @param {string} html
 * @returns {Promise<Uint8Array>}
 */
export async function convertHtmlToHwpxBytes(html) {
  const fragment = normalizeHtmlForPaste(html);
  const templateBytes = await loadBlankTemplateBytes();

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(host);

  /** @type {{ loadFile: Function, pasteHtml: Function, exportHwpx: Function, destroy?: Function } | null} */
  let studio = null;

  try {
    studio = await createRhwpStudioClient(host, getStudioUrl(), { width: '1px', height: '1px' });
    await studio.loadFile(templateBytes, 'document.hwpx');
    await studio.pasteHtml(fragment, { sectionIdx: 0, paraIdx: 0, charOffset: 0 });
    const hwpxBytes = await studio.exportHwpx();
    if (!hwpxBytes?.length) {
      throw new Error('HWPX 바이너리를 생성하지 못했습니다.');
    }
    return hwpxBytes instanceof Uint8Array ? hwpxBytes : new Uint8Array(hwpxBytes);
  } finally {
    studio?.destroy?.();
    host.remove();
  }
}

/**
 * @param {string} html
 * @returns {Promise<string>} base64
 */
export async function convertHtmlToHwpxBase64(html) {
  const bytes = await convertHtmlToHwpxBytes(html);
  return bytesToBase64(bytes);
}
