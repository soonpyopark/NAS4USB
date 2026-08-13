import { buildMediaStreamUrl } from '../media/streamUrl.js';
import {
  isArchiveExtension,
  isEpubExtension,
  isImageExtension,
  isPdfExtension,
} from '../media/mediaTypes.js';
import { loadPdfDocument } from '../pdf/pdfjs.js';
import {
  openServerArchivePages,
  pagesFromZipBuffer,
  readRelativePathArrayBuffer,
} from './archivePages.js';

/**
 * @typedef {{ id: string, name?: string, url?: string, pageNumber?: number }} ReaderPage
 *
 * @typedef {{
 *   kind: 'image' | 'pdf' | 'archive' | 'epub',
 *   pages: ReaderPage[],
 *   pageCount: number,
 *   pdfDocument?: import('pdfjs-dist').PDFDocumentProxy,
 *   epubData?: ArrayBuffer,
 *   revoke: () => void | Promise<void>,
 * }} ReaderResolved
 */

/**
 * @param {string} relativePath
 * @param {string} extension
 * @returns {Promise<ReaderResolved>}
 */
export async function resolveReaderPages(relativePath, extension) {
  const ext = String(extension ?? '').toLowerCase();

  if (isImageExtension(ext)) {
    const url = buildMediaStreamUrl(relativePath);
    return {
      kind: 'image',
      pages: [{ id: 'image-0', name: relativePath.split(/[/\\]/).pop() ?? 'image', url }],
      pageCount: 1,
      revoke: () => {},
    };
  }

  if (isPdfExtension(ext)) {
    const url = buildMediaStreamUrl(relativePath);
    const pdfDocument = await loadPdfDocument(url);
    const pageCount = pdfDocument.numPages;
    /** @type {ReaderPage[]} */
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      pages.push({ id: `pdf-${pageNumber}`, pageNumber, name: `p${pageNumber}` });
    }
    return {
      kind: 'pdf',
      pages,
      pageCount,
      pdfDocument,
      revoke: () => {
        try {
          pdfDocument.destroy();
        } catch {
          // ignore
        }
      },
    };
  }

  if (isEpubExtension(ext)) {
    const epubData = await readRelativePathArrayBuffer(relativePath);
    return {
      kind: 'epub',
      pages: [],
      pageCount: 0,
      epubData,
      revoke: () => {},
    };
  }

  if (isArchiveExtension(ext)) {
    if (ext === 'zip' || ext === 'cbz') {
      try {
        const buffer = await readRelativePathArrayBuffer(relativePath);
        const { pages, revoke } = await pagesFromZipBuffer(buffer);
        return {
          kind: 'archive',
          pages,
          pageCount: pages.length,
          revoke,
        };
      } catch {
        // Fall through to server extract (7-Zip).
      }
    }
    const opened = await openServerArchivePages(relativePath);
    return {
      kind: 'archive',
      pages: opened.pages,
      pageCount: opened.pages.length,
      revoke: opened.revoke,
    };
  }

  throw new Error(`지원하지 않는 리더 형식입니다: .${ext}`);
}

/**
 * Render a PDF page to a blob URL (caller should revoke when replaced).
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDocument
 * @param {number} pageNumber 1-based
 * @param {number} [scale]
 */
export async function renderPdfPageToObjectUrl(pdfDocument, pageNumber, scale = 1.5) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas를 사용할 수 없습니다.');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('PDF 페이지 렌더에 실패했습니다.'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92,
    );
  });
}
