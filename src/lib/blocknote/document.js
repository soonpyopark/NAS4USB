export const BLOCK_FILE_FORMAT = 'blocknote';
export const BLOCK_FILE_VERSION = 1;

/** @typedef {import('@blocknote/core').PartialBlock[]} BlockContent */

/**
 * @param {unknown} value
 * @returns {value is BlockContent}
 */
function isBlockContent(value) {
  return Array.isArray(value);
}

/**
 * @param {string} [title]
 * @param {BlockContent} [content]
 * @param {string} [exportedAt]
 */
export function createEmptyBlockDocument(title = 'NoName', content = [], exportedAt) {
  return JSON.stringify(
    {
      format: BLOCK_FILE_FORMAT,
      version: BLOCK_FILE_VERSION,
      exportedAt: exportedAt ?? new Date().toISOString(),
      title,
      content,
    },
    null,
    2,
  );
}

/**
 * @param {BlockContent} content
 * @param {string} [title]
 * @param {string} [exportedAt]
 */
export function serializeBlockDocument(content, title = 'NoName', exportedAt) {
  return createEmptyBlockDocument(title, content, exportedAt);
}

/**
 * @param {string} text
 */
export function parseBlockDocument(text) {
  const normalized = normalizeBlockDocument(text);
  const parsed = JSON.parse(normalized);
  return {
    title: typeof parsed.title === 'string' ? parsed.title : 'NoName',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    content: isBlockContent(parsed.content) ? parsed.content : [],
  };
}

/**
 * @param {string} text
 */
export function normalizeBlockDocument(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return createEmptyBlockDocument();

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.format === BLOCK_FILE_FORMAT) {
      return JSON.stringify(
        {
          format: BLOCK_FILE_FORMAT,
          version: BLOCK_FILE_VERSION,
          exportedAt: parsed.exportedAt ?? new Date().toISOString(),
          title: parsed.title ?? 'NoName',
          content: isBlockContent(parsed.content) ? parsed.content : [],
        },
        null,
        2,
      );
    }
  } catch {
    // fall through
  }

  return createEmptyBlockDocument();
}

/**
 * @param {string} fileName
 */
export function getBlockFileStem(fileName) {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/\.block$/i, '') || 'NoName';
}
