import { lazy, Suspense } from 'react';
import { getFileViewerType, getFileViewerTypeFromName } from '../../lib/fileViewerType.js';
import { entryExtensionOf } from '../../lib/filePassword/secPaths.js';
import { isImageExtension } from '../../lib/media/mediaTypes.js';
import { shouldUseLegacyImagePdfViewers } from '../../lib/comicReader/legacyViewerFlag.js';

const XlsxEditorShell = lazy(() => import('./XlsxEditorShell.jsx'));
const TextEditorShell = lazy(() => import('./TextEditorShell.jsx'));
const HwpxEditorShell = lazy(() => import('./HwpxEditorShell.jsx'));
const TipTapEditorShell = lazy(() => import('./TipTapEditorShell.jsx'));
const PdfViewerShell = lazy(() => import('./PdfViewerShell.jsx'));
const HtmlViewerShell = lazy(() => import('./HtmlViewerShell.jsx'));
const ImageViewerShell = lazy(() => import('./ImageViewerShell.jsx'));
const ComicReaderShell = lazy(() => import('./ComicReaderShell.jsx'));

/**
 * @param {{
 *   entry: {
 *     relativePath: string,
 *     name?: string,
 *     fileName?: string,
 *     extension?: string,
 *     type?: string,
 *   },
 *   syncInfo?: object | null,
 *   readOnly?: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function AttachmentEditorOverlay({
  entry,
  syncInfo = null,
  readOnly = false,
  onClose,
}) {
  const fileName = entry.name || entry.fileName || entry.relativePath.split('/').pop() || '파일';
  const extension =
    entryExtensionOf(entry.name || entry.fileName || entry.relativePath) ||
    String(entry.extension ?? '').toLowerCase();
  const type =
    entry.type ||
    getFileViewerTypeFromName(entry.name || entry.fileName || entry.relativePath) ||
    getFileViewerType(extension);
  const fallback = (
    <div className="flex min-h-[12rem] items-center justify-center text-sm text-nas-muted">
      첨부 편집기 여는 중…
    </div>
  );

  if (type === 'xlsx') {
    return (
      <Suspense fallback={fallback}>
        <XlsxEditorShell
          relativePath={entry.relativePath}
          fileName={fileName}
          syncInfo={syncInfo}
          onClose={onClose}
          raised
          readOnly={readOnly}
        />
      </Suspense>
    );
  }

  if (type === 'text') {
    return (
      <Suspense fallback={fallback}>
        <TextEditorShell
          relativePath={entry.relativePath}
          fileName={fileName}
          extension={extension || 'txt'}
          syncInfo={syncInfo}
          onClose={onClose}
          raised
          readOnly={readOnly}
        />
      </Suspense>
    );
  }

  if (type === 'hwpx') {
    return (
      <Suspense fallback={fallback}>
        <HwpxEditorShell
          relativePath={entry.relativePath}
          fileName={fileName}
          syncInfo={syncInfo}
          onClose={onClose}
          raised
          readOnly={readOnly}
        />
      </Suspense>
    );
  }

  if (type === 'tiptap') {
    return (
      <Suspense fallback={fallback}>
        <TipTapEditorShell
          relativePath={entry.relativePath}
          fileName={fileName}
          syncInfo={syncInfo}
          onClose={onClose}
          raised
          readOnly={readOnly}
        />
      </Suspense>
    );
  }

  if (type === 'pdf') {
    return (
      <Suspense fallback={fallback}>
        <PdfViewerShell
          relativePath={entry.relativePath}
          fileName={fileName}
          extension={extension || 'pdf'}
          onClose={onClose}
          raised
        />
      </Suspense>
    );
  }

  if (type === 'html') {
    return (
      <Suspense fallback={fallback}>
        <HtmlViewerShell
          relativePath={entry.relativePath}
          fileName={fileName}
          extension={extension || 'html'}
          onClose={onClose}
          raised
        />
      </Suspense>
    );
  }

  if (type === 'reader') {
    if (shouldUseLegacyImagePdfViewers() && isImageExtension(extension)) {
      return (
        <Suspense fallback={fallback}>
          <ImageViewerShell
            relativePath={entry.relativePath}
            fileName={fileName}
            extension={extension}
            onClose={onClose}
            raised
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={fallback}>
        <ComicReaderShell
          relativePath={entry.relativePath}
          fileName={fileName}
          extension={extension}
          onClose={onClose}
          raised
        />
      </Suspense>
    );
  }

  return null;
}
