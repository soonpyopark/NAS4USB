import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import FortuneSheetGrid from './FortuneSheetGrid.jsx';
import TextEditor from './TextEditor.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import { AppModalButton } from '../common/AppModal.jsx';
import { getShareTokenFromUrl } from '../../lib/shareAccess.js';
import { base64ToBytes } from '../../lib/bytes.js';
import { parseSpreadsheetBase64 } from '../../lib/xlsx/xlsxIO.js';
import { decodeTextBase64 } from '../../lib/text/textIO.js';
import { parseBlockFileBase64 } from '../../lib/blocknote/package.js';
import { packageAssetUrlToFileName, normalizeBlockAssetUrls } from '../../lib/blocknote/assetUrls.js';
import { loadRhwpModule } from '../../lib/rhwp/loadRhwp.js';
import { getAudioMimeType, getVideoMimeType, isAudioExtension, isVideoExtension } from '../../../shared/mediaTypes.js';

// Matches the lazy-loading already used by BlockEditorShell.jsx — keeps BlockNote out of
// the main bundle for the (common) case where a user never opens a .block history preview.
const BlockEditorView = lazy(() => import('./BlockEditorView.jsx'));

/** @type {Record<string, string>} */
const IMAGE_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

/** @param {string} fileName */
function guessMimeFromFileName(fileName) {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (IMAGE_MIME_TYPES[ext]) return IMAGE_MIME_TYPES[ext];
  if (isVideoExtension(ext)) return getVideoMimeType(ext);
  if (isAudioExtension(ext)) return getAudioMimeType(ext);
  return 'application/octet-stream';
}

/**
 * Read-only preview of a single revision-history entry. Never writes to disk,
 * the live Y.js room, or any editor sidecar — safe to open alongside a live edit.
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   entryId: string,
 *   onRequestRestore?: (entryId: string) => void,
 *   onRequestDelete?: (entryId: string) => void,
 *   busy?: boolean,
 * }} props
 */
export default function HistoryPreviewModal({
  open,
  onClose,
  relativePath,
  fileName,
  extension,
  entryId,
  onRequestRestore,
  onRequestDelete,
  busy = false,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renderError, setRenderError] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [text, setText] = useState('');
  const [blockContent, setBlockContent] = useState(null);
  const [blockResolveFileUrl, setBlockResolveFileUrl] = useState(null);
  const mountRef = useRef(null);
  const rhwpHandleRef = useRef(null);
  const blobUrlsRef = useRef([]);

  const normalizedExtension = String(extension ?? '').toLowerCase();
  const isSpreadsheet = normalizedExtension === 'xlsx' || normalizedExtension === 'xls';
  const isText = normalizedExtension === 'txt' || normalizedExtension === 'md';

  // Read-only preview (unlike the editor windows), so Esc-to-close is safe — there is no
  // unsaved content to lose.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRenderError(null);
    setSheets(null);
    setText('');
    setBlockContent(null);
    setBlockResolveFileUrl(null);

    async function run() {
      try {
        const base64 = await window.nas4usb.history.read(relativePath, entryId, getShareTokenFromUrl());
        if (cancelled) return;

        if (normalizedExtension === 'xlsx' || normalizedExtension === 'xls') {
          // Inserted images live only in the `.fortune.json` sidecar, never in the plain XLSX
          // bytes (see fileHistoryService.js) — prefer the archived sidecar snapshot when this
          // entry has one so images actually show up in the preview.
          const sidecarSheets = await window.nas4usb.history
            .readSidecar(relativePath, entryId, getShareTokenFromUrl())
            .catch(() => null);
          if (cancelled) return;
          if (Array.isArray(sidecarSheets) && sidecarSheets.length > 0) {
            setSheets(sidecarSheets);
          } else {
            const parsed = await parseSpreadsheetBase64(base64);
            if (cancelled) return;
            setSheets(parsed.sheets);
          }
        } else if (normalizedExtension === 'hwpx') {
          const rhwp = await loadRhwpModule();
          if (cancelled) return;
          if (!rhwp) throw new Error('@rhwp/core 코어를 불러오지 못했습니다.');

          let attempts = 0;
          const waitForMount = () =>
            new Promise((resolve, reject) => {
              const tick = () => {
                if (cancelled) return;
                if (mountRef.current) {
                  resolve(mountRef.current);
                  return;
                }
                attempts += 1;
                if (attempts > 40) {
                  reject(new Error('rhwp 마운트 영역을 준비하지 못했습니다.'));
                  return;
                }
                window.setTimeout(tick, 50);
              };
              tick();
            });

          const mountEl = await waitForMount();
          if (cancelled) return;
          mountEl.innerHTML = '';
          const editor = await rhwp.mount(mountEl, {
            fileName,
            hwpxBase64: base64,
            onLoadError: (err) => {
              if (!cancelled) setError(err.message);
            },
          });
          if (cancelled) {
            editor.destroy?.();
            return;
          }
          editor.setEditable?.(false);
          rhwpHandleRef.current = editor;
        } else if (normalizedExtension === 'txt' || normalizedExtension === 'md') {
          setText(decodeTextBase64(base64));
        } else if (normalizedExtension === 'block') {
          const parsed = await parseBlockFileBase64(base64);
          if (cancelled) return;

          const blobUrlByFileName = new Map();
          for (const asset of parsed.embeddedAssets) {
            const name = packageAssetUrlToFileName(asset.path) ?? asset.path;
            const blob = new Blob([base64ToBytes(asset.base64)], { type: guessMimeFromFileName(name) });
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            blobUrlByFileName.set(name, blobUrl);
          }

          setBlockResolveFileUrl(() => async (url) => {
            const fileNameForUrl = packageAssetUrlToFileName(url);
            if (fileNameForUrl && blobUrlByFileName.has(fileNameForUrl)) {
              return blobUrlByFileName.get(fileNameForUrl);
            }
            return url;
          });
          setBlockContent(normalizeBlockAssetUrls(parsed.content, relativePath));
        } else {
          throw new Error('미리보기를 지원하지 않는 파일 형식입니다.');
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '이력 미리보기를 불러오지 못했습니다.');
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      rhwpHandleRef.current?.destroy?.();
      rhwpHandleRef.current = null;
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, [open, relativePath, entryId, fileName, normalizedExtension]);

  if (!open) return null;

  return (
    <ViewerModal
      title={`${fileName} — 이력 미리보기`}
      readOnly
      onClose={onClose}
      actions={
        <>
          {onRequestRestore && (
            <AppModalButton
              variant="primary"
              className="text-xs"
              disabled={busy}
              onClick={() => onRequestRestore(entryId)}
            >
              복원
            </AppModalButton>
          )}
          {onRequestDelete && (
            <AppModalButton
              variant="danger"
              className="text-xs"
              disabled={busy}
              onClick={() => onRequestDelete(entryId)}
            >
              삭제
            </AppModalButton>
          )}
        </>
      }
    >
      {(error || renderError) && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error || '이 이력을 미리보기 하는 중 오류가 발생했습니다. 다른 이력을 선택하거나 [복원]으로 직접 확인해 주세요.'}
        </div>
      )}

      {loading && !error && (
        <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">불러오는 중…</div>
      )}

      {/* Third-party editor libraries (FortuneSheet/BlockNote/rhwp) can throw while rendering
          historic content that differs slightly from what they normally see live (e.g. legacy
          shapes). Without this boundary such a crash unmounts the whole app (no top-level
          boundary exists) instead of just failing this read-only preview. */}
      <ErrorBoundary key={entryId} onError={(err) => setRenderError(err)}>
        {!error && !renderError && isSpreadsheet && sheets && (
          <div className="pointer-events-none min-h-0 flex-1 select-none">
            <FortuneSheetGrid initialSheets={sheets} onReady={() => {}} />
          </div>
        )}

        {!error && !renderError && normalizedExtension === 'hwpx' && (
          <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden" />
        )}

        {!error && !renderError && isText && !loading && (
          <div className="pointer-events-none min-h-0 flex-1 select-none">
            <TextEditor initialText={text} isMarkdown={normalizedExtension === 'md'} onReady={() => {}} />
          </div>
        )}

        {!error && !renderError && normalizedExtension === 'block' && blockContent && blockResolveFileUrl && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
                BlockNote 모듈 로드 중…
              </div>
            }
          >
            <BlockEditorView
              relativePath={relativePath}
              initialBlocks={blockContent}
              collaboration={null}
              readOnly
              resolveFileUrl={blockResolveFileUrl}
              onReady={() => {}}
            />
          </Suspense>
        )}
      </ErrorBoundary>
    </ViewerModal>
  );
}
