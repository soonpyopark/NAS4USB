import { convertHwpxBase64ToMarkdown } from '../hwpx/exportHwpxAsMarkdown.js';
import { fileFromDataUrl } from './pasteImages.js';
import { importHtmlIntoEditor } from './importHtml.js';

/**
 * @param {File | Blob | string} fileOrBase64
 * @returns {Promise<string>}
 */
async function resolveHwpxBase64(fileOrBase64) {
  if (typeof fileOrBase64 === 'string') {
    const value = fileOrBase64.trim();
    if (!value) return '';
    if (value.startsWith('data:')) {
      return value.split(',')[1] ?? '';
    }
    return value.replace(/\s+/g, '');
  }

  if (typeof Blob !== 'undefined' && fileOrBase64 instanceof Blob) {
    const { readFileAsBase64 } = await import('../fsPaths.js');
    const file =
      fileOrBase64 instanceof File
        ? fileOrBase64
        : new File([fileOrBase64], 'document.hwpx', {
            type: fileOrBase64.type || 'application/haansofthwpx',
          });
    return readFileAsBase64(file);
  }

  throw new Error('HWPX 파일을 읽지 못했습니다.');
}

/**
 * @param {unknown} node
 */
function isEffectivelyEmptyContent(node) {
  if (!node || typeof node !== 'object') return true;
  const typed = /** @type {{ type?: string, text?: string, attrs?: { src?: string }, content?: unknown[] }} */ (
    node
  );
  if (typed.type === 'text') return !String(typed.text ?? '').trim();
  if (typed.type === 'image' && typed.attrs?.src) return false;
  if (typed.type === 'horizontalRule') return false;
  if (Array.isArray(typed.content) && typed.content.some((child) => !isEffectivelyEmptyContent(child))) {
    return false;
  }
  if (
    typed.type &&
    !['doc', 'paragraph', 'heading', 'blockquote', 'listItem', 'taskItem', 'bulletList', 'orderedList', 'taskList'].includes(
      typed.type,
    )
  ) {
    return !(typed.content && typed.content.length);
  }
  return !typed.content || typed.content.length === 0;
}

/**
 * @param {import('@tiptap/core').JSONContent} content
 */
function withTrailingParagraphJson(content) {
  if (!content || content.type !== 'doc') return content;
  const nodes = Array.isArray(content.content) ? [...content.content] : [];
  const last = nodes[nodes.length - 1];
  if (!last || last.type !== 'paragraph') {
    nodes.push({ type: 'paragraph' });
  }
  return { ...content, content: nodes };
}

/**
 * TipTap drops `data:` images (`allowBase64: false`). Upload them first.
 *
 * @param {import('@tiptap/core').JSONContent} content
 * @param {(file: File) => Promise<string>} [uploadFile]
 * @returns {Promise<import('@tiptap/core').JSONContent>}
 */
async function materializeContentImages(content, uploadFile) {
  if (!content || typeof uploadFile !== 'function') return content;

  const walk = async (node) => {
    if (!node || typeof node !== 'object') return node;
    const typed = /** @type {{ type?: string, attrs?: Record<string, unknown>, content?: unknown[] }} */ (node);
    if (typed.type === 'image' && /^data:/i.test(String(typed.attrs?.src ?? ''))) {
      const file = fileFromDataUrl(String(typed.attrs.src));
      if (file) {
        const src = await uploadFile(file);
        return { ...typed, attrs: { ...typed.attrs, src } };
      }
    }
    if (!Array.isArray(typed.content)) return typed;
    const next = [];
    for (const child of typed.content) {
      next.push(await walk(child));
    }
    return { ...typed, content: next };
  };

  return /** @type {import('@tiptap/core').JSONContent} */ (await walk(content));
}

/**
 * Replace the live editor with an HWPX file — reverse of TipTap → Markdown → HWPX.
 *
 * @param {import('@tiptap/core').Editor} editor
 * @param {File | Blob | string} fileOrBase64
 * @param {{
 *   uploadFile?: (file: File) => Promise<string>,
 *   destTiptapPath?: string,
 * }} [options]
 */
export async function importHwpxIntoEditor(editor, fileOrBase64, options = {}) {
  if (!editor) throw new Error('에디터가 준비되지 않았습니다.');

  const hwpxBase64 = await resolveHwpxBase64(fileOrBase64);
  if (!hwpxBase64) {
    throw new Error('HWPX 파일이 비어 있습니다.');
  }

  let markdown = '';
  /** @type {unknown} */
  let markdownError = null;
  try {
    markdown = await convertHwpxBase64ToMarkdown(hwpxBase64);
  } catch (err) {
    markdownError = err;
    markdown = '';
  }

  if (markdown.trim() && typeof editor.markdown?.parse === 'function') {
    try {
      let content = editor.markdown.parse(markdown);
      content = await materializeContentImages(content, options.uploadFile);
      if (!isEffectivelyEmptyContent(content)) {
        editor.chain().setContent(withTrailingParagraphJson(content)).setTextSelection(0).run();
        return;
      }
    } catch {
      // kordoc Markdown that TipTap cannot parse still has the HWPX HTML fallback.
    }
  }

  const { parseHwpxBase64 } = await import('../hwpx/hwpxIO.js');
  const parsed = await parseHwpxBase64(hwpxBase64);
  const html = String(parsed.html ?? '').trim();
  if (!html || /^<p><br\s*\/?><\/p>$/i.test(html)) {
    if (markdownError instanceof Error) throw markdownError;
    throw new Error('HWPX에서 가져올 내용이 없습니다.');
  }
  await importHtmlIntoEditor(editor, html, options);
}
