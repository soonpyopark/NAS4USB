import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getImageMimeType } from '../../lib/media/mediaTypes.js';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { entryExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import { readWorkspacePlainBase64 } from '../../lib/filePassword/io.js';
import { decodeTextBase64 } from '../../lib/text/textIO.js';
import { renderMarkdown } from '../../lib/text/markdown.js';
import { getFilePreviewKind } from '../../lib/filePreview.js';
import {
  folderPreviewCrumbs,
  folderPreviewParentPath,
  listFolderPreviewEntries,
} from '../../lib/folderPreview.js';
import { getBaseName, getParentPath } from '../../lib/fsPaths.js';
import { useFolderOrder } from '../../hooks/useFolderOrder.js';
import { resolveComicFirstPage } from '../../lib/comicReader/firstPage.js';
import { resolvePdfFirstPage } from '../../lib/pdf/firstPage.js';
import FileIcon from './FileIcon.jsx';

/**
 * @param {string} relativePath
 * @returns {import('../../types/nas4usb.d.ts').FsEntry}
 */
function folderStub(relativePath) {
  return {
    name: getBaseName(relativePath) || '폴더',
    relativePath,
    isDirectory: true,
    size: 0,
    modifiedAt: '',
    extension: null,
  };
}

const TipTapEditorView = lazy(() => import('../editors/TipTapEditorView.jsx'));

const TEXT_PREVIEW_LIMIT = 400_000;

/**
 * @param {{
 *   entry: import('../../types/nas4usb.d.ts').FsEntry | null,
 *   open: boolean,
 *   canView?: boolean,
 *   onClose: () => void,
 *   onOpenFull?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void,
 *   onPreview?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void,
 *   previewAnchorPath?: string | null,
 *   folderColorMap?: Record<string, string>,
 *   nameBoldMap?: Record<string, boolean>,
 * }} props
 */
export default function FilePreviewPane({
  entry,
  open,
  canView = true,
  onClose,
  onOpenFull,
  onPreview,
  previewAnchorPath = null,
  folderColorMap = {},
  nameBoldMap = {},
}) {
  const kind = getFilePreviewKind(entry);
  const locked = Boolean(entry && isSecFileName(entry.relativePath || entry.name));
  const { folderOrderMap } = useFolderOrder();
  const listingPath = entry?.isDirectory
    ? entry.relativePath
    : getParentPath(entry?.relativePath ?? '.');
  const parentPath = !entry
    ? null
    : entry.isDirectory
      ? folderPreviewParentPath(entry.relativePath, previewAnchorPath)
      : listingPath;
  const crumbs = folderPreviewCrumbs(previewAnchorPath, listingPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [tiptapContent, setTiptapContent] = useState(null);
  const [tiptapResolveFileUrl, setTiptapResolveFileUrl] = useState(null);
  const [folderEntries, setFolderEntries] = useState(
    /** @type {import('../../types/nas4usb.d.ts').FsEntry[]} */ ([]),
  );
  const [folderCounts, setFolderCounts] = useState({ folders: 0, files: 0, total: 0, truncated: false });
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState('');

  useEffect(() => {
    let cancelled = false;
    /** @type {(() => void | Promise<void>) | null} */
    let revoke = null;

    setLoading(Boolean(open && entry && kind && kind !== 'folder' && canView && !locked));
    setError('');
    setText('');
    setHtml('');
    setImageUrl('');
    setPageCount(0);
    setTruncated(false);
    setTiptapContent(null);
    setTiptapResolveFileUrl(null);

    if (!open || !entry || !kind || kind === 'folder' || !canView || locked) {
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
          const { packageAssetUrlToFileName, normalizeTiptapAssetUrls, assetFileNameFromAnyUrl } =
            await import('../../lib/tiptap/assetUrls.js');
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
              const fileName =
                packageAssetUrlToFileName(url) || assetFileNameFromAnyUrl(url, entry.relativePath);
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
  }, [open, entry?.relativePath, kind, canView, locked]);

  useEffect(() => {
    let cancelled = false;
    setFolderEntries([]);
    setFolderCounts({ folders: 0, files: 0, total: 0, truncated: false });
    setFolderError('');
    if (!open || !entry || kind !== 'folder' || !canView) {
      setFolderLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setFolderLoading(true);
    (async () => {
      try {
        const result = await listFolderPreviewEntries(entry.relativePath, folderOrderMap);
        if (cancelled) return;
        setFolderEntries(result.entries);
        setFolderCounts({
          folders: result.folders,
          files: result.files,
          total: result.total,
          truncated: result.truncated,
        });
        setFolderLoading(false);
      } catch (err) {
        if (!cancelled) {
          setFolderError(err instanceof Error ? err.message : '폴더를 불러오지 못했습니다.');
          setFolderLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, entry?.relativePath, kind, canView, folderOrderMap]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.file-preview-pane')) return;
      if (target.closest('[data-explorer-entry]')) return;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest('[role="menu"]')) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div
      className={`file-preview-overlay${open ? ' file-preview-overlay--open' : ''}`}
      aria-hidden={!open}
    >
      <aside className="file-preview-pane" aria-label="미리보기" inert={open ? undefined : true}>
        <header className="file-preview-pane__header">
          <p className="file-preview-pane__title" title={entry?.name}>
            {entry?.name || '미리보기'}
          </p>
          <div className="file-preview-pane__actions">
            {parentPath && typeof onPreview === 'function' ? (
              <button
                type="button"
                className="nas-btn-ghost file-preview-pane__btn"
                onClick={() => onPreview(folderStub(parentPath))}
              >
                상위
              </button>
            ) : null}
            {entry && typeof onOpenFull === 'function' ? (
              <button
                type="button"
                className="nas-btn-ghost file-preview-pane__btn"
                onClick={() => onOpenFull(entry)}
              >
                {entry.isDirectory ? '폴더 열기' : '열기'}
              </button>
            ) : null}
            <button type="button" className="nas-btn-ghost file-preview-pane__btn" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>
        {open && entry && crumbs.length > 0 ? (
          <nav className="file-preview-pane__crumbs" aria-label="미리보기 경로">
            {crumbs.map((crumb, index) => (
              <span key={crumb.path} className="file-preview-pane__crumb">
                {index > 0 ? <span className="file-preview-pane__crumb-sep">/</span> : null}
                {(index === crumbs.length - 1 && kind === 'folder') || typeof onPreview !== 'function' ? (
                  <span className="file-preview-pane__crumb-current">{crumb.name}</span>
                ) : (
                  <button
                    type="button"
                    className="file-preview-pane__crumb-btn"
                    onClick={() => onPreview(folderStub(crumb.path))}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="file-preview-pane__body">
          {!entry ? (
            <p className="file-preview-pane__empty">미리볼 항목을 선택하세요.</p>
          ) : !canView ? (
            <p className="file-preview-pane__empty">이 항목을 열람할 권한이 없습니다.</p>
          ) : locked ? (
            <p className="file-preview-pane__empty">
              비밀번호가 설정된 파일입니다. 내용을 보려면 [열기]를 누르세요.
            </p>
          ) : !kind ? (
            <p className="file-preview-pane__empty">이 형식은 아직 미리볼 수 없습니다.</p>
          ) : kind === 'folder' ? (
            folderLoading ? (
              <p className="file-preview-pane__empty">불러오는 중…</p>
            ) : folderError ? (
              <p className="file-preview-pane__empty">{folderError}</p>
            ) : (
              <div className="file-preview-pane__folder">
                <p className="file-preview-pane__folder-meta">
                  {`폴더 ${folderCounts.folders.toLocaleString('ko-KR')}개 · 파일 ${folderCounts.files.toLocaleString('ko-KR')}개`}
                </p>
                {folderEntries.length === 0 ? (
                  <p className="file-preview-pane__empty">폴더가 비어 있습니다.</p>
                ) : (
                  <ul className="file-preview-pane__folder-list">
                    {folderEntries.map((child) => (
                      <li key={child.relativePath}>
                        <button
                          type="button"
                          className="file-preview-pane__folder-item"
                          onClick={() => onPreview?.(child)}
                          onDoubleClick={() => onOpenFull?.(child)}
                        >
                          <FileIcon
                            entry={child}
                            folderColor={folderColorMap[child.relativePath]}
                            nameBold={Boolean(nameBoldMap[child.relativePath])}
                            className="h-4 w-4 shrink-0"
                          />
                          <span
                            className={`file-preview-pane__folder-name${
                              nameBoldMap[child.relativePath] ? ' font-bold' : ''
                            }`}
                            title={child.name}
                          >
                            {child.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {folderCounts.truncated ? (
                  <p className="file-preview-pane__caption file-preview-pane__folder-more">
                    앞 {folderEntries.length.toLocaleString('ko-KR')}개만 표시합니다. 전체를 보려면
                    폴더를 여세요.
                  </p>
                ) : null}
              </div>
            )
          ) : loading ? (
            <p className="file-preview-pane__empty">불러오는 중…</p>
          ) : error ? (
            <p className="file-preview-pane__empty">{error}</p>
          ) : kind === 'image' || kind === 'comic' || kind === 'pdf' ? (
            <div className="file-preview-pane__media">
              <p className="file-preview-pane__caption" title={entry.name}>
                {entry.name}
              </p>
              {imageUrl ? (
                <img src={imageUrl} alt={entry.name} className="file-preview-pane__image" />
              ) : null}
              {(kind === 'comic' || kind === 'pdf') && pageCount > 0 ? (
                <p className="file-preview-pane__caption">첫 페이지 · 모두 {pageCount}페이지</p>
              ) : null}
            </div>
          ) : kind === 'text' ? (
            <>
              <p className="file-preview-pane__caption" title={entry.name}>
                {entry.name}
              </p>
              <pre className="file-preview-pane__text">{text || '(빈 파일)'}</pre>
            </>
          ) : kind === 'markdown' ? (
            <>
              <p className="file-preview-pane__caption" title={entry.name}>
                {entry.name}
              </p>
              <div
                className="markdown-preview file-preview-pane__rich"
                dangerouslySetInnerHTML={{ __html: html || '<p>(빈 문서)</p>' }}
              />
            </>
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
                openLinkedAsOverlay={false}
                onOpenFile={(next) => {
                  onOpenFull?.({
                    name: next.name || next.fileName || next.relativePath.split('/').pop() || next.relativePath,
                    relativePath: next.relativePath,
                    isDirectory: false,
                    size: 0,
                    modifiedAt: '',
                    extension: next.extension ?? null,
                    linkHash: next.linkHash,
                  });
                }}
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
