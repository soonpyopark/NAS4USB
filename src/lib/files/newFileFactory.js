import JSZip from 'jszip';
import { createEmptyWb4sDocument, utf8ToBase64 } from '../../wb4s/document.js';
import { createEmptyTiptapPackageBase64 } from '../tiptap/package.js';
import { bytesToBase64 } from '../bytes.js';
import { resolveUniqueName } from '../fsPaths.js';

/** @typedef {'hwpx' | 'md' | 'txt' | 'xlsx' | 'wb4s' | 'tiptap'} NewFileType */

export const NEW_FILE_TYPES = /** @type {const} */ ([
  { id: 'hwpx', label: 'HWPX 문서', extension: 'hwpx', description: '한글 HWPX 협업 편집' },
  { id: 'xlsx', label: 'Excel', extension: 'xlsx', description: '스프레드시트' },
  { id: 'tiptap', label: 'TipTap 문서', extension: 'tiptap', description: 'Notion-like TipTap 에디터' },
  { id: 'wb4s', label: '화이트보드', extension: 'wb4s', description: 'WhiteBoard4Share' },
  { id: 'md', label: 'Markdown', extension: 'md', description: '마크다운 텍스트' },
  { id: 'txt', label: '텍스트', extension: 'txt', description: '일반 텍스트' },
]);

const DEFAULT_STEM = 'NoName';
const HWPX_TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/NoName.hwpx`;

/** @param {NewFileType} type */
export function getDefaultFileName(type) {
  const def = NEW_FILE_TYPES.find((item) => item.id === type);
  return `${DEFAULT_STEM}.${def?.extension ?? 'txt'}`;
}

/**
 * @param {Iterable<string>} existingNames
 * @param {NewFileType} type
 */
export function resolveNewFileName(existingNames, type) {
  return resolveUniqueName(existingNames, getDefaultFileName(type));
}

let hwpxTemplateBase64 = null;

async function loadHwpxTemplateBase64() {
  if (!hwpxTemplateBase64) {
    const response = await fetch(HWPX_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(`HWPX 템플릿을 불러오지 못했습니다: ${HWPX_TEMPLATE_URL}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    hwpxTemplateBase64 = bytesToBase64(bytes);
  }
  return hwpxTemplateBase64;
}

async function createEmptyXlsxBase64() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  const xl = zip.folder('xl');
  xl?.file(
    'workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
  );
  xl?.folder('_rels')?.file(
    'workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  xl?.folder('worksheets')?.file(
    'sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData/>
</worksheet>`,
  );
  xl?.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`,
  );

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return bytesToBase64(bytes);
}

/** @param {NewFileType} type */
export async function buildNewFileContent(type) {
  switch (type) {
    case 'hwpx':
      return loadHwpxTemplateBase64();
    case 'md':
      return utf8ToBase64('');
    case 'txt':
      return utf8ToBase64('');
    case 'xlsx':
      return createEmptyXlsxBase64();
    case 'wb4s':
      return utf8ToBase64(createEmptyWb4sDocument(DEFAULT_STEM));
    case 'tiptap':
      return createEmptyTiptapPackageBase64(DEFAULT_STEM);
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: ${type}`);
  }
}
