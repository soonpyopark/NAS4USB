import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import '../../styles/tiptap-editor.css';
import 'tippy.js/dist/tippy.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { createEmptyTiptapDoc } from '../../lib/tiptap/document.js';
import { normalizeTiptapTextMarks } from '../../lib/tiptap/textMarks.js';
import { createTiptapExtensions } from '../../lib/tiptap/extensions.js';
import { createTiptapSearchExtension } from '../../lib/tiptap/searchExtension.js';
import { createSlashCommandExtension } from '../../lib/tiptap/slashCommand.js';
import {
  insertTiptapMedia,
  insertTiptapMediaAtView,
  pickTiptapMediaFile,
} from '../../lib/tiptap/insertMedia.js';
import { clipboardHasEditableHtml, insertHtmlIntoView } from '../../lib/tiptap/clipboardHtml.js';
import { collectClipboardImageFiles } from '../../lib/tiptap/pasteImages.js';
import { useSpellcheckEnabled } from '../../hooks/useSpellcheckEnabled.js';
import { cleanupUnreferencedTiptapAssets } from '../../lib/tiptap/assetCleanup.js';
import {
  createTiptapResolveFileUrl,
  createTiptapUploadFile,
} from '../../lib/tiptap/uploadFile.js';
import TipTapToolbar, { TipTapZoomControls } from './tiptap/TipTapToolbar.jsx';
import TipTapSearchBar from './tiptap/TipTapSearchBar.jsx';
import TipTapBubbleMenus from './tiptap/TipTapBubbleMenus.jsx';
import TipTapTocPanel from './tiptap/TipTapTocPanel.jsx';
import { IconSearch } from './tiptap/TipTapIcons.jsx';
import { openExternalUrl } from '../../lib/openExternal.js';
import { getFileViewerType } from '../../lib/fileViewerType.js';
import {
  ensureTiptapAssetAvailable,
  openTiptapAttachment,
  resolveTiptapLinkClick,
} from '../../lib/tiptap/openTiptapLink.js';
import AttachmentEditorOverlay from './AttachmentEditorOverlay.jsx';
import AudioPlayerShell from './AudioPlayerShell.jsx';
import VideoPlayerShell from './VideoPlayerShell.jsx';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.1;

/**
 * @param {number} zoom
 * @param {'in' | 'out'} direction
 */
function stepZoom(zoom, direction) {
  const next = direction === 'in' ? zoom * ZOOM_STEP : zoom / ZOOM_STEP;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
}

/**
 * TipTap editor with full open-source feature surface.
 * @see https://github.com/ueberdosis/tiptap
 *
 * @param {{
 *   relativePath: string,
 *   initialContent: import('@tiptap/core').JSONContent,
 *   collaboration: {
 *     doc: import('yjs').Doc,
 *     provider: import('y-websocket').WebsocketProvider,
 *     user: { name: string, color: string },
 *   } | null,
 *   readOnly?: boolean,
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   onReady?: (editor: import('@tiptap/core').Editor) => void,
 *   onSave?: () => void,
 *   syncInfo?: object | null,
 * }} props
 */
export default function TipTapEditorView({
  relativePath,
  initialContent,
  collaboration,
  readOnly = false,
  resolveFileUrl: resolveFileUrlProp,
  onReady,
  onSave,
  syncInfo = null,
}) {
  const imageInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const videoInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const audioInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const fileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  const [assetPlayer, setAssetPlayer] = useState(
    /** @type {{ kind: 'audio' | 'video', relativePath: string, fileName: string, extension: string } | null} */ (
      null
    ),
  );
  const [overlayEditor, setOverlayEditor] = useState(
    /** @type {{ relativePath: string, fileName: string, extension: string, type: string } | null} */ (
      null
    ),
  );
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;
  const [emojiOpenRequest, setEmojiOpenRequest] = useState(0);
  const [zoom, setZoom] = useState(1);
  const spellcheckEnabled = useSpellcheckEnabled();

  const zoomBy = useCallback((direction) => {
    setZoom((prev) => stepZoom(prev, direction));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);
  const uploadFile = useMemo(() => createTiptapUploadFile(relativePath), [relativePath]);
  const defaultResolveFileUrl = useMemo(
    () => createTiptapResolveFileUrl(relativePath),
    [relativePath],
  );
  const resolveFileUrl = resolveFileUrlProp ?? defaultResolveFileUrl;

  const collabDoc = collaboration?.doc ?? null;
  const collabProvider = collaboration?.provider ?? null;
  const collabUserName = collaboration?.user?.name ?? '사용자';
  const collabUserColor = collaboration?.user?.color ?? '#2563eb';

  const extensions = useMemo(() => {
    const collab = collabDoc
      ? {
          doc: collabDoc,
          provider: collabProvider,
          user: { name: collabUserName, color: collabUserColor },
        }
      : null;

    const base = createTiptapExtensions({
      collaboration: collab,
      resolveFileUrl,
      uploadFile: readOnly ? undefined : uploadFile,
      includeImageNodeView: true,
      includeMediaNodeView: true,
    });
    base.push(createTiptapSearchExtension());
    if (!readOnly) {
      base.push(
        createSlashCommandExtension({
          onUploadImage: () => imageInputRef.current?.click(),
          onUploadVideo: () => videoInputRef.current?.click(),
          onUploadAudio: () => audioInputRef.current?.click(),
          onUploadFile: () => fileInputRef.current?.click(),
          onOpenEmojiPicker: () => setEmojiOpenRequest((n) => n + 1),
        }),
      );
    }
    return base;
  }, [collabDoc, collabProvider, collabUserName, collabUserColor, readOnly, resolveFileUrl, uploadFile]);

  const editor = useEditor(
    {
      extensions,
      content: collabDoc
        ? undefined
        : normalizeTiptapTextMarks(initialContent ?? createEmptyTiptapDoc()),
      editable: !readOnly,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: 'tiptap',
          spellcheck: spellcheckEnabled ? 'true' : 'false',
        },
        handleKeyDown: (_view, event) => {
          if (!searchOpenRef.current) return false;
          if (event.key === 'Enter' || event.key === 'Escape') return true;
          return false;
        },
        handleDrop: (view, event) => {
          const file = pickTiptapMediaFile(event.dataTransfer?.files);
          if (!file || readOnly) return false;
          event.preventDefault();
          uploadFile(file)
            .then((url) => {
              insertTiptapMediaAtView(view, file, url, {
                left: event.clientX,
                top: event.clientY,
              });
            })
            .catch((err) => {
              window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
            });
          return true;
        },
        handlePaste: (view, event) => {
          if (readOnly) return false;
          const clipboard = event.clipboardData;
          if (!clipboard) return false;

          // OneNote/Word copy a screenshot file *and* HTML. Prefer the HTML so
          // the paste stays editable, then upload images from the HTML / matching files.
          if (clipboardHasEditableHtml(clipboard)) {
            const html = clipboard.getData('text/html') || '';
            event.preventDefault();
            insertHtmlIntoView(view, html, {
              files: collectClipboardImageFiles(clipboard),
              uploadFile,
            }).catch((err) => {
              window.alert(err instanceof Error ? err.message : '붙여넣기에 실패했습니다.');
            });
            return true;
          }

          const file = pickTiptapMediaFile(clipboard.files);
          if (!file) return false;
          event.preventDefault();
          uploadFile(file)
            .then((url) => {
              insertTiptapMediaAtView(view, file, url);
            })
            .catch((err) => {
              window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
            });
          return true;
        },
      },
      onCreate: ({ editor: created }) => {
        try {
          created.commands.fixTables?.();
        } catch {
          // optional
        }
      },
    },
    collabDoc
      ? [collabDoc, collabProvider, extensions, readOnly]
      : [extensions, initialContent, readOnly],
  );

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;
    dom.setAttribute('spellcheck', spellcheckEnabled ? 'true' : 'false');
  }, [editor, spellcheckEnabled]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || !collabProvider) return;
    collabProvider.awareness?.setLocalStateField('user', {
      name: collabUserName,
      color: collabUserColor,
    });
  }, [editor, collabProvider, collabUserName, collabUserColor]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key;
      if (!readOnly && key.toLowerCase() === 's') {
        event.preventDefault();
        onSave?.();
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        zoomBy('in');
        return;
      }
      if (key === '-' || key === '_') {
        event.preventDefault();
        zoomBy('out');
        return;
      }
      if (key === '0') {
        event.preventDefault();
        resetZoom();
        return;
      }
      if (key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        setSearchFocusNonce((value) => value + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave, readOnly, resetZoom, searchOpen, zoomBy]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 'in' : 'out');
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, editor]);

  // Keep replaced assets on disk while the editor is open so undo can restore
  // a cropped image. Sweep leftovers only when the session ends.
  useEffect(() => {
    if (!editor || readOnly) return undefined;
    return () => {
      cleanupUnreferencedTiptapAssets(relativePath, editor.getJSON()).catch(() => {});
    };
  }, [editor, readOnly, relativePath]);

  const handleMediaPicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    try {
      const url = await uploadFile(file);
      insertTiptapMedia(editor, file, url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

  const handleEditorClick = useCallback(
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href =
        anchor?.getAttribute('data-asset-src')?.trim() ||
        anchor?.getAttribute('href')?.trim() ||
        '';
      const target = resolveTiptapLinkClick(href, relativePath);
      if (!target) return;
      const isAttachment =
        target.kind === 'file' ||
        anchor?.getAttribute('data-type') === 'file-attachment' ||
        anchor?.classList.contains('tiptap-file');
      if (!readOnly && !isAttachment && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      if (target.kind === 'external') {
        void openExternalUrl(target.url).catch(() => {});
        return;
      }
      void ensureTiptapAssetAvailable(relativePath, target.fileName)
        .then(async (resolvedPath) => {
          const resolved = { ...target, relativePath: resolvedPath };
          if (resolved.kind === 'audio' || resolved.kind === 'video') {
            setAssetPlayer(resolved);
            return;
          }
          const viewerType = getFileViewerType(resolved.extension);
          if (viewerType && viewerType !== 'wb4s') {
            setOverlayEditor({ ...resolved, type: viewerType });
            return;
          }
          await openTiptapAttachment(resolved);
        })
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : '첨부 파일을 열 수 없습니다.');
        });
    },
    [readOnly, relativePath],
  );

  const openImagePicker = () => imageInputRef.current?.click();
  const openVideoPicker = () => videoInputRef.current?.click();
  const openAudioPicker = () => audioInputRef.current?.click();
  const openFilePicker = () => fileInputRef.current?.click();

  if (!editor) {
    return (
      <div className="tiptap-editor-shell">
        <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
          TipTap 에디터 준비 중…
        </div>
      </div>
    );
  }

  return (
    <div className="tiptap-editor-shell">
      {!readOnly ? (
        <TipTapToolbar
          editor={editor}
          readOnly={readOnly}
          tocOpen={tocOpen}
          onToggleToc={() => setTocOpen((prev) => !prev)}
          searchOpen={searchOpen}
          onToggleSearch={() => {
            setSearchOpen((prev) => !prev);
            setSearchFocusNonce((value) => value + 1);
          }}
          onUploadImage={openImagePicker}
          onUploadVideo={openVideoPicker}
          onUploadAudio={openAudioPicker}
          onUploadFile={openFilePicker}
          emojiOpenRequest={emojiOpenRequest}
          zoom={zoom}
          onZoomIn={() => zoomBy('in')}
          onZoomOut={() => zoomBy('out')}
          onZoomReset={resetZoom}
        />
      ) : (
        <div className="tiptap-toolbar tiptap-toolbar--zoom-only" role="toolbar" aria-label="보기 배율">
          <button
            type="button"
            className={`tiptap-toolbar__btn${searchOpen ? ' is-active' : ''}`}
            title="본문 검색 (Ctrl+F)"
            onClick={() => {
              setSearchOpen((prev) => !prev);
              setSearchFocusNonce((value) => value + 1);
            }}
          >
            <IconSearch />
          </button>
          <TipTapZoomControls
            zoom={zoom}
            onZoomIn={() => zoomBy('in')}
            onZoomOut={() => zoomBy('out')}
            onZoomReset={resetZoom}
          />
        </div>
      )}

      <TipTapSearchBar
        editor={editor}
        open={searchOpen}
        readOnly={readOnly}
        focusNonce={searchFocusNonce}
        onClose={() => setSearchOpen(false)}
      />

      <TipTapBubbleMenus editor={editor} readOnly={readOnly} />

      <div className="tiptap-editor-shell__body">
        <div className="tiptap-editor-shell__scroll" ref={scrollRef}>
          <div className="tiptap-editor-shell__zoom" style={{ zoom }} onClick={handleEditorClick}>
            <EditorContent editor={editor} />
          </div>
        </div>
        <TipTapTocPanel editor={editor} open={tocOpen} onClose={() => setTocOpen(false)} />
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleMediaPicked}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={handleMediaPicked}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={handleMediaPicked}
      />
      <input ref={fileInputRef} type="file" hidden onChange={handleMediaPicked} />

      {assetPlayer?.kind === 'audio' ? (
        <AudioPlayerShell
          relativePath={assetPlayer.relativePath}
          fileName={assetPlayer.fileName}
          extension={assetPlayer.extension}
          onClose={() => setAssetPlayer(null)}
          raised
        />
      ) : null}
      {assetPlayer?.kind === 'video' ? (
        <VideoPlayerShell
          relativePath={assetPlayer.relativePath}
          fileName={assetPlayer.fileName}
          extension={assetPlayer.extension}
          onClose={() => setAssetPlayer(null)}
          raised
        />
      ) : null}
      {overlayEditor ? (
        <AttachmentEditorOverlay
          entry={overlayEditor}
          syncInfo={syncInfo}
          readOnly={readOnly}
          onClose={() => setOverlayEditor(null)}
        />
      ) : null}
    </div>
  );
}
