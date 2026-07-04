import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { textToHtml } from './textToHtml.js';
import { convertHwpxZipToHtml, extractPlainTextFromZip } from './hwpxToHtml.js';

const SECTION_PATH_PATTERN = /Contents\/section\d+\.xml$/i;
const RHWP_BODY_PATH = 'Contents/rhwp-body.html';

/**
 * @param {string} value
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} text
 * @param {string} [originalSectionXml]
 */
function buildSectionXml(text, originalSectionXml = '') {
  const openTagMatch = originalSectionXml.match(/<hs:sec[^>]*>/);
  const openTag =
    openTagMatch?.[0] ??
    '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">';

  const lines = text.split(/\r?\n/);
  const bodyLines = lines.length > 0 ? lines : [''];
  const paragraphs = bodyLines
    .map((line) => `  <hp:p><hp:run><hp:t>${escapeXml(line)}</hp:t></hp:run></hp:p>`)
    .join('\n');

  return `${openTag}\n${paragraphs}\n</hs:sec>`;
}

/**
 * @param {string} base64
 * @returns {Promise<{ text: string, html: string, originalBytes: Uint8Array | null }>}
 */
export async function parseHwpxBase64(base64) {
  const bytes = base64 ? base64ToBytes(base64) : new Uint8Array();
  if (bytes.length === 0) {
    return { text: '', html: '<p><br></p>', originalBytes: null };
  }

  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const text = new TextDecoder().decode(bytes);
    return { text, html: textToHtml(text), originalBytes: bytes };
  }

  const zip = await JSZip.loadAsync(bytes);

  if (zip.file(RHWP_BODY_PATH)) {
    const html = await zip.file(RHWP_BODY_PATH).async('string');
    const text = await extractPlainTextFromZip(zip);
    return { text, html, originalBytes: bytes };
  }

  const text = await extractPlainTextFromZip(zip);
  const html = await convertHwpxZipToHtml(zip);

  return {
    text,
    html,
    originalBytes: bytes,
  };
}

/**
 * @param {string} text
 * @param {string} html
 * @returns {Promise<Uint8Array>}
 */
async function createMinimalHwpx(text, html) {
  const zip = new JSZip();
  const sectionXml = buildSectionXml(text);

  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('version.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Version><FileVersion>5.0</FileVersion></Version>');
  zip.file(
    'Contents/content.hpf',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Contents><SectionCount>1</SectionCount></Contents>',
  );
  zip.file(
    'Contents/header.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Header><BeginNum Page="1" Footnote="1" Endnote="1" Picture="1" Table="1" Equation="1"/></Header>',
  );
  zip.file('Contents/section0.xml', sectionXml);
  zip.file(RHWP_BODY_PATH, html);
  zip.file(
    'META-INF/container.rdf',
    '<?xml version="1.0" encoding="UTF-8"?><RDF:RDF xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><RDF:Description RDF:about=""><Manifest><ManifestItem Full-path="Contents/content.hpf" Media-type="application/hwpml-package+xml"/></Manifest></RDF:Description></RDF:RDF>',
  );
  zip.file(
    'META-INF/manifest.xml',
    '<?xml version="1.0" encoding="UTF-8"?><Manifest><FileEntry Full-path="Contents/content.hpf" Media-type="application/hwpml-package+xml"/></Manifest>',
  );
  zip.file('Preview/PrvText.txt', text.slice(0, 2000));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * @param {{ text?: string, html?: string } | string} payload
 * @param {Uint8Array | null} originalBytes
 * @returns {Promise<string>}
 */
export async function buildHwpxBase64(payload, originalBytes) {
  const text = typeof payload === 'string' ? payload : payload.text ?? '';
  const html =
    typeof payload === 'string' ? textToHtml(payload) : payload.html ?? textToHtml(text);

  if (originalBytes && originalBytes.length >= 2 && originalBytes[0] === 0x50 && originalBytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(originalBytes);
    const sectionName = Object.keys(zip.files).find(
      (name) => /Contents\/section0\.xml$/i.test(name) && !zip.files[name].dir,
    );

    if (sectionName) {
      const originalSection = await zip.file(sectionName).async('string');
      zip.file(sectionName, buildSectionXml(text, originalSection));
      zip.file(RHWP_BODY_PATH, html);
      zip.file('Preview/PrvText.txt', text.slice(0, 2000));
      const updated = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      return bytesToBase64(updated);
    }
  }

  const created = await createMinimalHwpx(text, html);
  return bytesToBase64(created);
}
