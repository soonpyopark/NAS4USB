import { isSecFileName } from '../filePassword/secPaths.js';
import { getPdfMimeType } from '../media/mediaTypes.js';
import { buildMediaStreamUrl } from '../media/streamUrl.js';
import { readRelativePathArrayBuffer } from '../comicReader/archivePages.js';
import { renderPdfPageToObjectUrl } from '../comicReader/resolveReaderPages.js';
import { destroyPdfDocument, loadPdfDocument } from './pdfjs.js';

/**
 * First PDF page as a bitmap URL for the explorer preview pane.
 *
 * @param {string} relativePath
 * @returns {Promise<{ url: string, pageCount: number, revoke: () => void | Promise<void> }>}
 */
export async function resolvePdfFirstPage(relativePath) {
  const locked = isSecFileName(relativePath);
  let sourceUrl = '';
  let revokeSource = () => {};
  if (locked) {
    sourceUrl = URL.createObjectURL(
      new Blob([await readRelativePathArrayBuffer(relativePath)], {
        type: getPdfMimeType('pdf') || 'application/pdf',
      }),
    );
    revokeSource = () => URL.revokeObjectURL(sourceUrl);
  } else {
    sourceUrl = buildMediaStreamUrl(relativePath);
  }

  const pdf = await loadPdfDocument(sourceUrl);
  try {
    const url = await renderPdfPageToObjectUrl(pdf, 1, 1.35);
    const pageCount = pdf.numPages;
    return {
      url,
      pageCount,
      revoke: () => {
        URL.revokeObjectURL(url);
        revokeSource();
      },
    };
  } finally {
    await destroyPdfDocument(pdf);
  }
}
