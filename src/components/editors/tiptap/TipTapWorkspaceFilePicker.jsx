import { useEffect, useState } from 'react';
import { compareNames, getParentPath, joinRelativePath } from '../../../lib/fsPaths.js';
import { isTiptapAssetSidecarRelativePath } from '../../../../shared/tiptapAssetPaths.js';
import {
  clampWorkspaceBrowsePath,
  isWithinWorkspaceLinkBrowseRoot,
  isWorkspaceLinkSystemFolder,
  workspaceLinkBrowseLabel,
  workspaceLinkBrowseRoot,
} from '../../../lib/tiptap/workspaceLinks.js';

/**
 * @param {{
 *   startPath?: string,
 *   rootPath?: string,
 *   selectedPath?: string,
 *   onSelect: (entry: { relativePath: string, name: string, isDirectory: boolean, extension?: string }) => void,
 * }} props
 */
export default function TipTapWorkspaceFilePicker({
  startPath = '',
  rootPath = '',
  selectedPath = '',
  onSelect,
}) {
  const ceiling = rootPath || workspaceLinkBrowseRoot(startPath);
  const initial = clampWorkspaceBrowsePath(startPath || ceiling, startPath || ceiling);
  const [currentPath, setCurrentPath] = useState(initial);
  /** @type {[{ name: string, relativePath: string, isDirectory: boolean, extension?: string }[], Function]} */
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const next = clampWorkspaceBrowsePath(startPath || ceiling, startPath || ceiling);
    setCurrentPath(next);
  }, [startPath, ceiling]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!currentPath || (isWorkspaceLinkSystemFolder(currentPath) && currentPath !== ceiling)) {
      setEntries([]);
      setError('1레벨 폴더 안에서만 파일을 고를 수 있습니다.');
      return undefined;
    }
    (async () => {
      try {
        const list = await window.nas4usb.fs.readDir(currentPath);
        if (cancelled) return;
        const next = (Array.isArray(list) ? list : [])
          .filter((entry) => !isTiptapAssetSidecarRelativePath(entry.relativePath))
          .filter((entry) => !isWorkspaceLinkSystemFolder(entry.relativePath))
          .sort((left, right) => {
            if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
            return compareNames(left.name, right.name);
          });
        setEntries(next);
      } catch (err) {
        if (!cancelled) {
          setEntries([]);
          setError(err instanceof Error ? err.message : '폴더를 열 수 없습니다.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const parent = currentPath && currentPath !== '.' ? getParentPath(currentPath) : '';
  const canGoUp = Boolean(
    ceiling &&
      currentPath &&
      currentPath !== ceiling &&
      parent &&
      isWithinWorkspaceLinkBrowseRoot(parent, ceiling),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        {canGoUp ? (
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50"
            onClick={() => setCurrentPath(parent)}
          >
            위로
          </button>
        ) : null}
        <span className="min-w-0 truncate font-mono" title={currentPath}>
          {workspaceLinkBrowseLabel(currentPath)}
        </span>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <ul className="max-h-44 overflow-auto rounded-md border border-slate-200 bg-white">
        {entries.length === 0 && !error ? (
          <li className="px-3 py-2 text-xs text-slate-500">빈 폴더입니다.</li>
        ) : (
          entries.map((entry) => {
            const active = entry.relativePath === selectedPath;
            return (
              <li key={entry.relativePath}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                    active ? 'bg-blue-50 text-blue-800' : 'text-slate-800'
                  }`}
                  onClick={() => {
                    if (entry.isDirectory) {
                      const next = entry.relativePath || joinRelativePath(currentPath, entry.name);
                      if (isWorkspaceLinkSystemFolder(next)) return;
                      if (ceiling && !isWithinWorkspaceLinkBrowseRoot(next, ceiling)) return;
                      setCurrentPath(next);
                      return;
                    }
                    onSelect(entry);
                  }}
                >
                  <span className="w-4 shrink-0 text-xs text-slate-400">{entry.isDirectory ? '📁' : '📄'}</span>
                  <span className="min-w-0 truncate">{entry.name}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
