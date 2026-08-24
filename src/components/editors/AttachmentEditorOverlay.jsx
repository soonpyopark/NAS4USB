import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss.js';
import { getFileViewerType, getFileViewerTypeFromName } from '../../lib/fileViewerType.js';
import { entryExtensionOf } from '../../lib/filePassword/secPaths.js';
import { isImageExtension } from '../../lib/media/mediaTypes.js';
import { shouldUseLegacyImagePdfViewers } from '../../lib/comicReader/legacyViewerFlag.js';

/**
 * @param {string} type
 * @param {string} extension
 */
function loadOverlayEditor(type, extension) {
  if (type === 'xlsx') return import('./XlsxEditorShell.jsx');
  if (type === 'text') return import('./TextEditorShell.jsx');
  if (type === 'hwpx') return import('./HwpxEditorShell.jsx');
  if (type === 'tiptap') return import('./TipTapEditorShell.jsx');
  if (type === 'pdf') return import('./PdfViewerShell.jsx');
  if (type === 'html') return import('./HtmlViewerShell.jsx');
  if (type === 'reader') {
    if (shouldUseLegacyImagePdfViewers() && isImageExtension(extension)) {
      return import('./ImageViewerShell.jsx');
    }
    return import('./ComicReaderShell.jsx');
  }
  return null;
}

/**
 * @param {{
 *   entry: {
 *     relativePath: string,
 *     name?: string,
 *     fileName?: string,
 *     extension?: string,
 *     type?: string,
 *     linkHash?: string,
 *   },
 *   syncInfo?: object | null,
 *   readOnly?: boolean,
 *   onClose: () => void,
 *   onOpenFile?: (entry: object) => void | Promise<boolean>,
 * }} props
 */
export default function AttachmentEditorOverlay({
  entry,
  syncInfo = null,
  readOnly = false,
  onClose,
  onOpenFile,
}) {
  const fileName = entry.name || entry.fileName || entry.relativePath.split('/').pop() || '파일';
  const extension =
    entryExtensionOf(entry.name || entry.fileName || entry.relativePath) ||
    String(entry.extension ?? '').toLowerCase();
  const type =
    entry.type ||
    getFileViewerTypeFromName(entry.name || entry.fileName || entry.relativePath) ||
    getFileViewerType(extension);

  const [Editor, setEditor] = useState(/** @type {import('react').ComponentType<any> | null} */ (null));
  const [error, setError] = useState('');
  const backdropDismiss = useBackdropDismiss(onClose);

  useEffect(() => {
    let cancelled = false;
    setEditor(null);
    setError('');
    const loader = loadOverlayEditor(type, extension);
    if (!loader) {
      setError('이 형식은 여기서 열 수 없습니다.');
      return undefined;
    }
    loader
      .then((mod) => {
        if (!cancelled) setEditor(() => mod.default);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '편집기를 불러오지 못했습니다.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [type, extension, entry.relativePath]);

  const status = (
    <div className="modal-overlay modal-overlay--raised" {...backdropDismiss}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="문서 열기"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm text-slate-700">{error || '문서를 여는 중…'}</p>
        <div className="mt-4 flex justify-end">
          <button type="button" className="modal-btn modal-btn--secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  const editor = Editor ? (
    <Editor
      relativePath={entry.relativePath}
      fileName={fileName}
      extension={extension || 'txt'}
      syncInfo={syncInfo}
      onClose={onClose}
      raised
      readOnly={readOnly}
      onOpenFile={onOpenFile}
      linkHash={entry.linkHash || ''}
    />
  ) : null;

  return createPortal(editor || status, document.body);
}
