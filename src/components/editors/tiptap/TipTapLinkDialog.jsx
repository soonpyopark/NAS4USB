import { useEffect, useMemo, useRef, useState } from 'react';
import { AppModal, AppModalActions, AppModalButton } from '../../common/AppModal.jsx';
import { getParentPath } from '../../../lib/fsPaths.js';
import {
  clampWorkspaceBrowsePath,
  defaultWorkspaceBrowsePath,
  formatDocAnchorLink,
  formatWorkspaceLink,
  isTiptapLinkTarget,
  listEditorAnchors,
  listTiptapFileAnchors,
  parseWorkspaceLink,
  workspaceLinkBrowseRoot,
  workspaceLinkFileLabel,
} from '../../../lib/tiptap/workspaceLinks.js';
import TipTapWorkspaceFilePicker from './TipTapWorkspaceFilePicker.jsx';

/**
 * @param {string} href
 * @returns {'web' | 'doc' | 'file'}
 */
function tabFromHref(href) {
  const parsed = parseWorkspaceLink(href);
  if (parsed.kind === 'anchor') return 'doc';
  if (parsed.kind === 'workspace') return 'file';
  return 'web';
}

/**
 * @param {Array<{ id: string, type: string, text: string, level: number }>} items
 */
function headingAnchors(items) {
  return items.filter((item) => item.type === 'heading');
}

/**
 * @param {{
 *   items: Array<{ id: string, type: string, text: string, level: number }>,
 *   selectedId: string,
 *   onSelect: (id: string) => void,
 *   emptyLabel: string,
 * }} props
 */
function AnchorList({ items, selectedId, onSelect, emptyLabel }) {
  const headings = headingAnchors(items);
  if (headings.length === 0) {
    return <p className="px-3 py-2 text-xs text-slate-500">{emptyLabel}</p>;
  }
  return (
    <ul className="max-h-44 overflow-auto rounded-md border border-slate-200 bg-white">
      {headings.map((item) => (
        <li key={`h-${item.id}`}>
          <button
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
              selectedId === item.id ? 'bg-blue-50 text-blue-800' : 'text-slate-800'
            }`}
            style={{ paddingLeft: `${8 + Math.max(0, item.level - 1) * 12}px` }}
            onClick={() => onSelect(item.id)}
          >
            <span className="shrink-0 text-[10px] text-slate-400">H{item.level || 1}</span>
            <span className="min-w-0 truncate">{item.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * In-app link editor. Electron does not show `window.prompt`.
 *
 * @param {{
 *   open: boolean,
 *   href?: string,
 *   editor?: import('@tiptap/core').Editor | null,
 *   currentPath?: string,
 *   onApply: (href: string) => void,
 *   onRemove: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function TipTapLinkDialog({
  open,
  href = '',
  editor = null,
  currentPath = '',
  onApply,
  onRemove,
  onCancel,
}) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [tab, setTab] = useState(/** @type {'web' | 'doc' | 'file'} */ ('web'));
  const [webValue, setWebValue] = useState(href);
  const [docAnchorId, setDocAnchorId] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileAnchorId, setFileAnchorId] = useState('');
  const [fileAnchors, setFileAnchors] = useState(
    /** @type {Array<{ id: string, type: string, text: string, level: number }>} */ ([]),
  );
  const [fileAnchorsLoading, setFileAnchorsLoading] = useState(false);
  const existing = Boolean(String(href || '').trim());

  const docAnchors = useMemo(() => (open && editor ? listEditorAnchors(editor) : []), [open, editor, href]);

  useEffect(() => {
    if (!open) return;
    const parsed = parseWorkspaceLink(href);
    const nextTab = tabFromHref(href);
    setTab(nextTab);
    setWebValue(parsed.kind === 'external' || parsed.kind === 'unknown' ? href || 'https://' : 'https://');
    setDocAnchorId(parsed.kind === 'anchor' ? parsed.id || '' : '');
    if (parsed.kind === 'workspace' && parsed.relativePath) {
      setFilePath(parsed.relativePath);
      setFileAnchorId(parsed.id || '');
    } else {
      setFilePath('');
      setFileAnchorId('');
      setFileAnchors([]);
    }
    const timer = window.setTimeout(() => {
      if (nextTab === 'web') {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, href]);

  useEffect(() => {
    if (!open || !filePath || !isTiptapLinkTarget(filePath)) {
      setFileAnchors([]);
      setFileAnchorsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setFileAnchorsLoading(true);
    listTiptapFileAnchors(filePath)
      .then((items) => {
        if (!cancelled) setFileAnchors(items);
      })
      .catch(() => {
        if (!cancelled) setFileAnchors([]);
      })
      .finally(() => {
        if (!cancelled) setFileAnchorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, filePath]);

  if (!open) return null;

  const browseHint = filePath
    ? getParentPath(filePath) || defaultWorkspaceBrowsePath(currentPath)
    : defaultWorkspaceBrowsePath(currentPath);
  const browseStart = clampWorkspaceBrowsePath(browseHint, filePath || currentPath);
  const browseRoot = workspaceLinkBrowseRoot(filePath || currentPath);

  const resolvedHref = (() => {
    if (tab === 'doc') return docAnchorId ? formatDocAnchorLink(docAnchorId) : '';
    if (tab === 'file') return filePath ? formatWorkspaceLink(filePath, fileAnchorId) : '';
    return webValue.trim();
  })();

  const canApply = Boolean(resolvedHref) && resolvedHref !== 'https://' && resolvedHref !== 'http://';

  const submit = () => {
    if (!canApply) return;
    onApply(resolvedHref);
  };

  return (
    <AppModal open={open} onClose={onCancel} title="링크" raised wide>
      <div className="modal-body space-y-3">
        <div className="flex gap-1 rounded-md bg-slate-100 p-1">
          {[
            { id: 'web', label: '웹(문서)' },
            { id: 'doc', label: '이 문서(제목)' },
            { id: 'file', label: '파일' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
              onClick={() => setTab(/** @type {'web' | 'doc' | 'file'} */ (item.id))}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'web' ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">URL(https://, nas4usb:/)</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-nas-accent"
              value={webValue}
              onChange={(event) => setWebValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </label>
        ) : null}

        {tab === 'doc' ? (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">제목</span>
            <AnchorList
              items={docAnchors}
              selectedId={docAnchorId}
              onSelect={setDocAnchorId}
              emptyLabel="이 문서에 이동할 제목이 없습니다."
            />
          </div>
        ) : null}

        {tab === 'file' ? (
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600">작업 공간 파일</span>
            <TipTapWorkspaceFilePicker
              key={href || 'new'}
              startPath={browseStart}
              rootPath={browseRoot}
              selectedPath={filePath}
              onSelect={(entry) => {
                setFilePath(entry.relativePath);
                setFileAnchorId('');
              }}
            />
            {filePath ? (
              <p className="truncate text-xs text-slate-600" title={filePath}>
                선택: {workspaceLinkFileLabel(filePath)}
              </p>
            ) : null}
            {filePath && isTiptapLinkTarget(filePath) ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-600">파일 안 위치 (선택)</span>
                {fileAnchorsLoading ? (
                  <p className="text-xs text-slate-500">제목을 읽는 중…</p>
                ) : (
                  <AnchorList
                    items={fileAnchors}
                    selectedId={fileAnchorId}
                    onSelect={(id) => setFileAnchorId((prev) => (prev === id ? '' : id))}
                    emptyLabel="이 파일에 저장된 제목이 없습니다. 파일을 연 뒤 저장하면 제목 목록이 생깁니다."
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <AppModalActions className="flex-wrap">
        <AppModalButton variant="primary" onClick={submit} disabled={!canApply}>
          적용
        </AppModalButton>
        {existing ? (
          <AppModalButton variant="danger" onClick={onRemove}>
            링크 제거
          </AppModalButton>
        ) : null}
        <AppModalButton onClick={onCancel}>취소</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
