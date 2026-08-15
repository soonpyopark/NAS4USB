import { lazy, Suspense, useEffect, useState } from 'react';
import { getImageMimeType } from '../../lib/media/mediaTypes.js';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { entryExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import { readWorkspacePlainBase64 } from '../../lib/filePassword/io.js';
import { decodeTextBase64 } from '../../lib/text/textIO.js';
import { renderMarkdown } from '../../lib/text/markdown.js';
import { canPreviewEntry, getFilePreviewKind } from '../../lib/filePreview.js';
import { resolveComicFirstPage } from '../../lib/comicReader/firstPage.js';
import { resolvePdfFirstPage } from '../../lib/pdf/firstPage.js';

const TipTapEditorView = lazy(() => import('../editors/TipTapEditorView.jsx'));

const TEXT_PREVIEW_LIMIT = 400_000;

/**
 * @param {{
 *   entry: import('../../types/nas4usb.d.ts').FsEntry | null,
 *   open: boolean,
 *   canView?: boolean,
 *   onClose: () => void,
 *   onOpenFull?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void,
 * }} props
 */
export default function FilePreviewPane({
  entry,
  open,
  canView = true,
  onClose,
  onOpenFull,
}) {
  const kind = getFilePreviewKind(entry);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [tiptapContent, setTiptapContent] = useState(null);
  const [tiptapResolveFileUrl, setTiptapResolveFileUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    /** @type {(() => void | Promise<void>) | null} */
    let revoke = null;

    setLoading(Boolean(open && entry && kind && canView));
    setError('');
    setText('');
    setHtml('');
    setImageUrl('');
    setPageCount(0);
    setTruncated(false);
    setTiptapContent(null);
    setTiptapResolveFileUrl(null);

    if (!open || !entry || !kind || !canView) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        if (kind === 'image') {
          const locked = isSecFileName(entry.relativePath);
          if (locked) {
            const { base64ToBytes } = await import('../../lib/bytes.js');
            const plain = await readWorkspacePlainBase64(entry.relativePath);
            const url = URL.createObjectURL(
              new Blob([base64ToBytes(plain)], { type: getImageMimeType(entryExtensionOf(entry)) }),
            );
            revoke = () => URL.revokeObjectURL(url);
            if (!cancelled) setImageUrl(url);
          } else if (!cancelled) {
            setImageUrl(buildMediaStreamUrl(entry.relativePath));
          }
        } else if (kind === 'text' || kind === 'markdown') {
          const plain = await readWorkspacePlainBase64(entry.relativePath);
          let next = decodeTextBase64(plain);
          if (next.length > TEXT_PREVIEW_LIMIT) {
            next = next.slice(0, TEXT_PREVIEW_LIMIT);
            if (!cancelled) setTruncated(true);
          }
          if (!cancelled) {
            if (kind === 'markdown') setHtml(renderMarkdown(next));
            else setText(next);
          }
        } else if (kind === 'tiptap') {
          const { base64ToBytes } = await import('../../lib/bytes.js');
          const { parseTiptapFileBase64, readSidecarAssets } = await import('../../lib/tiptap/package.js');
          const { packageAssetUrlToFileName, normalizeTiptapAssetUrls } = await import(
            '../../lib/tiptap/assetUrls.js'
          );
          const { guessMimeFromFileName } = await import('../../../shared/mediaTypes.js');
          const plain = await readWorkspacePlainBase64(entry.relativePath);
          const parsed = await parseTiptapFileBase64(plain);
          const sidecar = await readSidecarAssets(entry.relativePath);
          /** @type {string[]} */
          const blobUrls = [];
          const blobUrlByFileName = new Map();
          const addAsset = (fileName, base64) => {
            if (!fileName || !base64 || blobUrlByFileName.has(fileName)) return;
            const blob = new Blob([base64ToBytes(base64)], { type: guessMimeFromFileName(fileName) });
            const blobUrl = URL.createObjectURL(blob);
            blobUrls.push(blobUrl);
            blobUrlByFileName.set(fileName, blobUrl);
          };
          for (const asset of parsed.embeddedAssets) {
            addAsset(packageAssetUrlToFileName(asset.path) ?? asset.path, asset.base64);
          }
          for (const asset of sidecar) {
            addAsset(asset.fileName, asset.base64);
          }
          revoke = () => {
            for (const url of blobUrls) URL.revokeObjectURL(url);
          };
          if (!cancelled) {
            setTiptapResolveFileUrl(() => async (url) => {
              const fileName = packageAssetUrlToFileName(url);
              if (fileName && blobUrlByFileName.has(fileName)) {
                return blobUrlByFileName.get(fileName);
              }
              return url;
            });
            setTiptapContent(normalizeTiptapAssetUrls(parsed.content, entry.relativePath));
          }
        } else if (kind === 'comic' || kind === 'pdf') {
          const first =
            kind === 'pdf'
              ? await resolvePdfFirstPage(entry.relativePath)
              : await resolveComicFirstPage(entry.relativePath, entryExtensionOf(entry));
          revoke = first.revoke;
          if (!cancelled) {
            setImageUrl(first.url);
            setPageCount(first.pageCount);
            if (!first.url) setError('표시할 페이지가 없습니다.');
          }
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '미리보기를 불러오지 못했습니다.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void revoke?.();
    };
  }, [open, entry?.relativePath, kind, canView]);

  return (
    <div
      className={`file-preview-overlay${open ? ' file-preview-overlay--open' : ''}`}
      aria-hidden={!open}
    >
      <aside className="file-preview-pane" aria-label="파일 미리보기" inert={open ? undefined : true}>
        <header className="file-preview-pane__header">
          <p className="file-preview-pane__title" title={entry?.name}>
            {entry?.name || '미리보기'}
          </p>
          <div className="file-preview-pane__actions">
            {entry && canPreviewEntry(entry) && typeof onOpenFull === 'function' ? (
              <button
                type="button"
                className="nas-btn-ghost file-preview-pane__btn"
                onClick={() => onOpenFull(entry)}
              >
                열기
              </button>
            ) : null}
            <button type="button" className="nas-btn-ghost file-preview-pane__btn" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>

        <div className="file-preview-pane__body">
          {!entry ? (
            <p className="file-preview-pane__empty">미리볼 파일을 선택하세요.</p>
          ) : !canView ? (
            <p className="file-preview-pane__empty">이 파일을 열람할 권한이 없습니다.</p>
          ) : !kind ? (
            <p className="file-preview-pane__empty">
              {entry.isDirectory ? '폴더는 미리볼 수 없습니다.' : '이 형식은 아직 미리볼 수 없습니다.'}
            </p>
          ) : loading ? (
            <p className="file-preview-pane__empty">불러오는 중…</p>
          ) : error ? (
            <p className="file-preview-pane__empty">{error}</p>
          ) : kind === 'image' || kind === 'comic' || kind === 'pdf' ? (
            <div className="file-preview-pane__media">
              {imageUrl ? (
                <img src={imageUrl} alt={entry.name} className="file-preview-pane__image" />
              ) : null}
              {(kind === 'comic' || kind === 'pdf') && pageCount > 0 ? (
                <p className="file-preview-pane__caption">첫 페이지 · 모두 {pageCount}페이지</p>
              ) : null}
            </div>
          ) : kind === 'text' ? (
            <pre className="file-preview-pane__text">{text || '(빈 파일)'}</pre>
          ) : kind === 'markdown' ? (
            <div
              className="markdown-preview file-preview-pane__rich"
              dangerouslySetInnerHTML={{ __html: html || '<p>(빈 문서)</p>' }}
            />
          ) : kind === 'tiptap' && tiptapContent && tiptapResolveFileUrl ? (
            <Suspense
              fallback={<p className="file-preview-pane__empty">문서 준비 중…</p>}
            >
              <TipTapEditorView
                key={entry.relativePath}
                relativePath={entry.relativePath}
                initialContent={tiptapContent}
                collaboration={null}
                readOnly
                resolveFileUrl={tiptapResolveFileUrl}
                onReady={() => {}}
              />
            </Suspense>
          ) : null}
          {truncated ? (
            <p className="file-preview-pane__caption">앞부분만 표시합니다. 전체를 보려면 여세요.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
