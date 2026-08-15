import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENT_COLOR_PRESETS, normalizeAccentColor } from '../../../shared/theme.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { openExternalUrl } from '../../lib/openExternal.js';
import { isElectronRenderer } from '../../lib/runtime.js';
import { applyAccentColor, currentAccentColor } from '../../lib/theme.js';
import { applySpellcheckEnabled } from '../../lib/spellcheck.js';
import {
  DEFAULT_VIDEO_PREVIEW_CACHE_MAX_BYTES,
  VIDEO_PREVIEW_CACHE_PRESETS,
  formatByteSize,
  normalizeVideoPreviewCacheMaxBytes,
} from '../../../shared/videoPreviewCache.js';

/**
 * @typedef {{
 *   supported: boolean,
 *   enabled: boolean,
 *   startHidden: boolean,
 *   execPath: string,
 *   reason: string,
 * }} AutoLaunchState
 *
 * @typedef {{
 *   configured: string | null,
 *   effective: string,
 *   defaultDataRoot: string,
 *   sharedRoot?: string,
 *   homesRoot?: string,
 * }} DataRootState
 */

const BUTTON_CLASS =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** 설정 → 일반: data 루트, 시작 프로그램 등록, 앱 강조 색상. */
export default function GeneralSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialog: generalDialog } = useAppConfirm();
  const electron = isElectronRenderer();

  /** @type {[AutoLaunchState | null, Function]} */
  const [autoLaunch, setAutoLaunch] = useState(null);
  /** @type {[DataRootState | null, Function]} */
  const [dataRoot, setDataRoot] = useState(null);
  /** @type {[import('../../../shared/externalFolders.js').ExternalFolderMount[], Function]} */
  const [externalFolders, setExternalFolders] = useState([]);
  /** @type {[string | null, Function]} */
  const [ffmpegPath, setFfmpegPath] = useState(/** @type {string | null} */ (null));
  /** @type {[{ available: boolean, version: string | null, cache?: { bytes: number, folderCount: number, maxBytes: number } } | null, Function]} */
  const [ffmpegStatus, setFfmpegStatus] = useState(null);
  const [videoPreviewCacheMaxBytes, setVideoPreviewCacheMaxBytes] = useState(
    DEFAULT_VIDEO_PREVIEW_CACHE_MAX_BYTES,
  );
  const [accent, setAccent] = useState(currentAccentColor);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const saveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const theme = await window.nas4usb.settings.getTheme();
      setAccent(applyAccentColor(theme?.accentColor));
      setSpellcheckEnabled(applySpellcheckEnabled(theme?.spellcheckEnabled === true));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '테마 설정을 불러오지 못했습니다.');
    }

    try {
      const [settings, paths] = await Promise.all([
        window.nas4usb.settings.get(),
        window.nas4usb.getPaths(),
      ]);
      const defaultDataRoot =
        typeof paths?.defaultWorkspaceRoot === 'string' && paths.defaultWorkspaceRoot
          ? paths.defaultWorkspaceRoot
          : typeof paths?.defaultDataRoot === 'string' && paths.defaultDataRoot
            ? paths.defaultDataRoot
            : paths?.workspaceRoot ?? paths?.appPath ?? '';
      const configured =
        typeof settings?.dataRoot === 'string' && settings.dataRoot.trim()
          ? settings.dataRoot.trim()
          : null;
      setDataRoot({
        configured,
        effective: paths?.workspaceRoot ?? defaultDataRoot,
        defaultDataRoot,
        sharedRoot: paths?.dataRoot ?? '',
        homesRoot: paths?.homesRoot ?? '',
      });
      setExternalFolders(
        Array.isArray(settings?.externalFolders)
          ? settings.externalFolders
          : Array.isArray(paths?.externalFolders)
            ? paths.externalFolders
            : [],
      );
      setFfmpegPath(
        typeof settings?.ffmpegPath === 'string' && settings.ffmpegPath.trim()
          ? settings.ffmpegPath.trim()
          : null,
      );
      setVideoPreviewCacheMaxBytes(
        normalizeVideoPreviewCacheMaxBytes(settings?.videoPreviewCacheMaxBytes),
      );
    } catch {
      setDataRoot(null);
    }

    try {
      const response = await fetch('/api/media/ffmpegStatus');
      if (response.ok) {
        const status = await response.json();
        setFfmpegStatus({
          available: Boolean(status?.available),
          version: typeof status?.version === 'string' ? status.version : null,
          cache:
            status?.cache && typeof status.cache === 'object'
              ? {
                  bytes: Number(status.cache.bytes) || 0,
                  folderCount: Number(status.cache.folderCount) || 0,
                  maxBytes: normalizeVideoPreviewCacheMaxBytes(status.cache.maxBytes),
                }
              : undefined,
        });
      } else {
        setFfmpegStatus(null);
      }
    } catch {
      setFfmpegStatus(null);
    }

    if (!electron) return;
    try {
      const info = await window.nas4usb.server.getInfo();
      setAutoLaunch(info.autoLaunch ?? null);
    } catch {
      setAutoLaunch(null);
    }
  }, [electron]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * @param {() => Promise<void>} action
   */
  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  /**
   * @param {string | null} nextPath
   * @param {string} confirmBody
   */
  const applyDataRootCore = async (nextPath, confirmBody) => {
    if (!electron) return;
    const ok = await appConfirm({
      title: '데이터 루트',
      body: confirmBody,
      confirmLabel: '저장 후 다시 시작',
    });
    if (!ok) return;
    try {
      await window.nas4usb.settings.applyDataRoot(nextPath);
    } catch (error) {
      await appAlert({
        title: '데이터 루트',
        body: error instanceof Error ? error.message : '데이터 루트를 바꾸지 못했습니다.',
      });
      await refresh();
    }
  };

  /**
   * @param {string | null} nextPath
   * @param {string} confirmBody
   */
  const applyDataRoot = (nextPath, confirmBody) =>
    run(async () => {
      await applyDataRootCore(nextPath, confirmBody);
    });

  const chooseDataRoot = () =>
    run(async () => {
      if (!electron) return;
      const picked = await window.nas4usb.dialog.pickDirectory({
        title: '데이터 루트 폴더 선택',
      });
      if (!picked) return;
      if (dataRoot?.effective && picked === dataRoot.effective && dataRoot.configured) {
        await appAlert({ title: '데이터 루트', body: '이미 사용 중인 폴더입니다.' });
        return;
      }
      await applyDataRootCore(
        picked,
        `선택한 폴더를 데이터 루트로 쓰고 앱을 다시 시작합니다.\n\n${picked}\n\n이 폴더 아래에 share(공유폴더)·private(개인폴더)가 만들어집니다. 기존 파일은 자동으로 옮기지 않습니다.`,
      );
    });

  const resetDataRoot = () => {
    if (!dataRoot?.configured) return;
    void applyDataRoot(
      null,
      `프로그램 폴더를 데이터 루트로 되돌리고 앱을 다시 시작합니다.\n\n${dataRoot.defaultDataRoot}`,
    );
  };

  const addExternalFolder = () =>
    run(async () => {
      if (!electron) return;
      const picked = await window.nas4usb.dialog.pickDirectory({
        title: '외부 폴더 선택 (Google Drive, 다른 드라이브 등)',
      });
      if (!picked) return;
      const { makeExternalMountId, defaultExternalFolderLabel, normalizeExternalFolders } =
        await import('../../../shared/externalFolders.js');
      const id = makeExternalMountId(picked);
      if (externalFolders.some((item) => item.id === id || item.absolutePath === picked)) {
        await appAlert({ title: '외부 폴더', body: '이미 추가된 폴더입니다.' });
        return;
      }
      const next = normalizeExternalFolders([
        ...externalFolders,
        { id, label: defaultExternalFolderLabel(picked), absolutePath: picked },
      ]);
      await window.nas4usb.settings.update({ externalFolders: next });
      setExternalFolders(next);
      await appAlert({
        title: '외부 폴더',
        body: `추가했습니다.\n${picked}\n\n편집·저장은 가능하고, LAN 실시간 협업은 사용하지 않습니다.`,
      });
    });

  /**
   * @param {string} mountId
   */
  const removeExternalFolder = (mountId) =>
    run(async () => {
      const target = externalFolders.find((item) => item.id === mountId);
      if (!target) return;
      const ok = await appConfirm({
        title: '외부 폴더 제거',
        body: `연결만 해제합니다. 원본 폴더의 파일은 삭제되지 않습니다.\n\n${target.label}\n${target.absolutePath}`,
        confirmLabel: '연결 해제',
      });
      if (!ok) return;
      const next = externalFolders.filter((item) => item.id !== mountId);
      await window.nas4usb.settings.update({ externalFolders: next });
      setExternalFolders(next);
    });

  /**
   * @param {string} mountId
   * @param {-1 | 1} direction
   */
  const moveExternalFolderOrder = (mountId, direction) =>
    run(async () => {
      const { moveExternalFolder, normalizeExternalFolders } = await import(
        '../../../shared/externalFolders.js'
      );
      const fromIndex = externalFolders.findIndex((item) => item.id === mountId);
      if (fromIndex < 0) return;
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= externalFolders.length) return;
      const next = normalizeExternalFolders(moveExternalFolder(externalFolders, fromIndex, toIndex));
      await window.nas4usb.settings.update({ externalFolders: next });
      setExternalFolders(next);
    });

  /**
   * @param {string} mountId
   * @param {string} alias
   */
  const saveExternalFolderAlias = (mountId, alias) =>
    run(async () => {
      const target = externalFolders.find((item) => item.id === mountId);
      if (!target) return;
      const { sanitizeExternalFolderLabel, normalizeExternalFolders } = await import(
        '../../../shared/externalFolders.js'
      );
      const label = sanitizeExternalFolderLabel(alias, target.absolutePath);
      if (label === target.label) {
        setExternalFolders((prev) =>
          prev.map((item) => (item.id === mountId ? { ...item, label } : item)),
        );
        return;
      }
      const next = normalizeExternalFolders(
        externalFolders.map((item) => (item.id === mountId ? { ...item, label } : item)),
      );
      await window.nas4usb.settings.update({ externalFolders: next });
      setExternalFolders(next);
    });

  const chooseFfmpeg = () =>
    run(async () => {
      if (!electron) return;
      const picked = await window.nas4usb.dialog.pickFile({
        title: 'FFmpeg 실행 파일 선택',
        filters: [
          { name: 'FFmpeg', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!picked) return;
      await window.nas4usb.settings.update({ ffmpegPath: picked });
      setFfmpegPath(picked);
      await refresh();
      await appAlert({
        title: '외부 코덱 (FFmpeg)',
        body: `등록했습니다.\n${picked}\n\n동영상 미리보기에서 AC3/DTS 등 Chromium이 재생하지 못하는 오디오를 AAC로 변환합니다. 빌드에는 포함되지 않습니다.`,
      });
    });

  const clearFfmpeg = () =>
    run(async () => {
      const ok = await appConfirm({
        title: '외부 코덱 해제',
        body: '등록된 FFmpeg 경로를 지우겠습니까? 동영상 미리보기는 기본 재생만 사용합니다.',
        confirmLabel: '해제',
      });
      if (!ok) return;
      await window.nas4usb.settings.update({ ffmpegPath: null });
      setFfmpegPath(null);
      setFfmpegStatus(null);
      await refresh();
    });

  const applyVideoPreviewCacheLimit = (nextBytes) =>
    run(async () => {
      const normalized = normalizeVideoPreviewCacheMaxBytes(nextBytes);
      await window.nas4usb.settings.update({ videoPreviewCacheMaxBytes: normalized });
      setVideoPreviewCacheMaxBytes(normalized);
      await refresh();
    });

  /**
   * @param {{ enabled?: boolean, startHidden?: boolean }} patch
   */
  const applyAutoLaunch = (patch) =>
    run(async () => {
      if (!autoLaunch?.supported) return;
      try {
        setAutoLaunch(
          await window.nas4usb.server.setAutoLaunch({
            enabled: patch.enabled ?? autoLaunch.enabled,
            startHidden: patch.startHidden ?? autoLaunch.startHidden,
          }),
        );
      } catch (error) {
        await appAlert({
          title: '프로그램 실행',
          body: error instanceof Error ? error.message : '자동 실행 설정을 바꾸지 못했습니다.',
        });
        await refresh();
      }
    });

  /**
   * Paints immediately for instant feedback and saves once the user settles on a
   * colour — the native colour picker streams changes while it is being dragged.
   * A failed save rolls the preview back to whatever the server still holds.
   *
   * @param {string} color
   */
  const chooseAccent = (color) => {
    const next = normalizeAccentColor(color, accent);
    if (next === accent) return;
    setAccent(applyAccentColor(next));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await window.nas4usb.settings.update({ themeAccentColor: next });
        } catch (error) {
          await appAlert({
            title: '테마 색상',
            body: error instanceof Error ? error.message : '테마 색상을 저장하지 못했습니다.',
          });
          await refresh();
        }
      })();
    }, 300);
  };

  /**
   * @param {boolean} enabled
   */
  const chooseSpellcheck = (enabled) => {
    setSpellcheckEnabled(applySpellcheckEnabled(enabled));
    void (async () => {
      try {
        await window.nas4usb.settings.update({ spellcheckEnabled: enabled });
      } catch (error) {
        await appAlert({
          title: '맞춤법 검사',
          body: error instanceof Error ? error.message : '맞춤법 검사 설정을 저장하지 못했습니다.',
        });
        await refresh();
      }
    })();
  };

  const usingCustomDataRoot = Boolean(dataRoot?.configured);

  return (
    <div className="space-y-8">
      {generalDialog}

      {loadError ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{loadError}</p>
          <button type="button" className={BUTTON_CLASS} onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">데이터 루트</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          문서가 저장되는 최상위 폴더입니다. 이 아래에{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">share</code>
          (화면: 공유폴더)·
          <code className="rounded bg-slate-100 px-1 text-[12px]">private</code>
          (화면: 개인폴더)가 만들어집니다. 지정하지 않으면 프로그램 폴더를 루트로 씁니다.
          변경 후 앱을 다시 시작해야 적용됩니다.
        </p>

        {dataRoot ? (
          <div className="space-y-2">
            <p className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              {dataRoot.effective}
            </p>
            {(dataRoot.sharedRoot || dataRoot.homesRoot) && (
              <p className="text-xs text-slate-500">
                {dataRoot.sharedRoot ? (
                  <>
                    share: <span className="font-mono">{dataRoot.sharedRoot}</span>
                  </>
                ) : null}
                {dataRoot.sharedRoot && dataRoot.homesRoot ? ' · ' : null}
                {dataRoot.homesRoot ? (
                  <>
                    private: <span className="font-mono">{dataRoot.homesRoot}</span>
                  </>
                ) : null}
              </p>
            )}
            <p className="text-xs text-slate-500">
              {usingCustomDataRoot
                ? `직접 지정한 루트를 사용 중입니다.${
                    dataRoot.configured && dataRoot.configured !== dataRoot.effective
                      ? ` (설정: ${dataRoot.configured})`
                      : ''
                  }`
                : `기본 경로를 사용 중입니다 (${dataRoot.defaultDataRoot || '프로그램 폴더'}).`}
            </p>
            {!electron ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                데이터 루트는 서버가 실행 중인 PC의 NAS4USB 앱에서만 변경할 수 있습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={busy}
                  onClick={() => void chooseDataRoot()}
                >
                  폴더 선택…
                </button>
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={busy || !usingCustomDataRoot}
                  onClick={() => resetDataRoot()}
                >
                  기본값으로
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            데이터 루트 정보를 불러오는 중입니다…
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">외부 폴더</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          Google Drive·iCloud·다른 드라이브 등 PC의 폴더를 탐색기에 추가합니다. 파일 열람·편집·저장은
          가능하지만 <strong className="font-semibold">LAN 실시간 협업(Y.js)은 사용하지 않습니다</strong>.
          총괄관리자만 추가·해제할 수 있으며, 아래 순서·별칭이 탐색기 표시에 반영됩니다.
        </p>
        {externalFolders.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {externalFolders.map((mount, index) => (
              <li
                key={mount.id}
                className={`flex items-center gap-2 px-2.5 py-2 ${
                  index > 0 ? 'border-t border-slate-200' : ''
                }`}
              >
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    disabled={busy || index === 0}
                    title="위로"
                    aria-label={`${mount.label} 위로`}
                    onClick={() => void moveExternalFolderOrder(mount.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    disabled={busy || index >= externalFolders.length - 1}
                    title="아래로"
                    aria-label={`${mount.label} 아래로`}
                    onClick={() => void moveExternalFolderOrder(mount.id, 1)}
                  >
                    ↓
                  </button>
                </div>
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-slate-500">별칭</span>
                  <input
                    type="text"
                    className="h-8 w-36 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:opacity-50 sm:w-44"
                    value={mount.label}
                    maxLength={80}
                    disabled={busy}
                    placeholder="표시 이름"
                    title="탐색기에 표시할 별칭"
                    aria-label={`${mount.absolutePath} 별칭`}
                    onChange={(event) => {
                      const nextLabel = event.target.value;
                      setExternalFolders((prev) =>
                        prev.map((item) =>
                          item.id === mount.id ? { ...item, label: nextLabel } : item,
                        ),
                      );
                    }}
                    onBlur={(event) => void saveExternalFolderAlias(mount.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500"
                    title={mount.absolutePath}
                  >
                    {mount.absolutePath}
                  </span>
                </label>
                <button
                  type="button"
                  className={`${BUTTON_CLASS} h-8 shrink-0 px-2.5 py-0 text-xs`}
                  disabled={busy}
                  onClick={() => void removeExternalFolder(mount.id)}
                >
                  연결 해제
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            추가된 외부 폴더가 없습니다.
          </p>
        )}
        {!electron ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            외부 폴더는 서버 PC의 NAS4USB 앱에서만 추가할 수 있습니다.
          </p>
        ) : (
          <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => void addExternalFolder()}>
            폴더 추가…
          </button>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">외부 코덱 (FFmpeg)</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          Windows용 <strong className="font-semibold">ffmpeg.exe</strong>를 등록하면 동영상 미리보기에서
          Chromium이 재생하지 못하는 오디오(AC3·DTS 등)를 AAC로 변환합니다. 프로그램 빌드에는 포함하지
          않으며, 같은 폴더의 <code className="rounded bg-slate-100 px-1 text-[12px]">ffprobe.exe</code>가
          있으면 코덱 판별에 사용합니다.
        </p>
        <p className="text-sm leading-relaxed text-slate-600">
          Windows용 빌드:{' '}
          <a
            href="https://github.com/BtbN/FFmpeg-Builds/releases"
            className="break-all text-sky-700 underline"
            onClick={(event) => {
              event.preventDefault();
              void openExternalUrl('https://github.com/BtbN/FFmpeg-Builds/releases');
            }}
          >
            https://github.com/BtbN/FFmpeg-Builds/releases
          </a>
        </p>
        {ffmpegPath ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="break-all font-mono text-xs text-slate-700">{ffmpegPath}</p>
            <p className="text-xs text-slate-500">
              {ffmpegStatus?.available
                ? ffmpegStatus.version || '사용 가능'
                : '경로가 저장됐지만 실행을 확인하지 못했습니다. 파일 경로를 확인해 주세요.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={busy || !electron}
                onClick={() => void chooseFfmpeg()}
              >
                다시 선택…
              </button>
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={busy}
                onClick={() => void clearFfmpeg()}
              >
                등록 해제
              </button>
            </div>
          </div>
        ) : !electron ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            FFmpeg 등록은 서버 PC의 NAS4USB 앱에서만 할 수 있습니다.
          </p>
        ) : (
          <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => void chooseFfmpeg()}>
            ffmpeg.exe 등록…
          </button>
        )}
        <div className="space-y-2 rounded-lg border border-slate-200 px-3 py-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="video-preview-cache-limit">
            비디오 캐시 최대 용량
          </label>
          <p className="text-xs leading-relaxed text-slate-500">
            미리보기 변환 캐시가 한도를 넘으면 오래 쓰지 않은 폴더부터 지웁니다. 지금 재생·변환 중인
            항목은 남깁니다.
          </p>
          <select
            id="video-preview-cache-limit"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            value={String(videoPreviewCacheMaxBytes)}
            disabled={busy}
            onChange={(event) => void applyVideoPreviewCacheLimit(Number(event.target.value))}
          >
            {VIDEO_PREVIEW_CACHE_PRESETS.map((preset) => (
              <option key={preset.id} value={String(preset.bytes)}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            {ffmpegStatus?.cache
              ? videoPreviewCacheMaxBytes > 0
                ? `현재 사용량: ${formatByteSize(ffmpegStatus.cache.bytes)} / ${formatByteSize(videoPreviewCacheMaxBytes)} · 폴더 ${ffmpegStatus.cache.folderCount}개`
                : `현재 사용량: ${formatByteSize(ffmpegStatus.cache.bytes)} · 제한 없음 · 폴더 ${ffmpegStatus.cache.folderCount}개`
              : '사용량을 불러오는 중이거나 아직 캐시가 없습니다.'}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">프로그램 실행</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          Windows에 로그인하면 NAS4USB를 자동으로 실행해 서버를 바로 올립니다. 실행 파일 경로가 그대로
          등록되므로, 포터블 드라이브의 문자가 바뀌면 이 항목을 껐다 다시 켜 주세요.
        </p>

        {!electron ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            자동 실행은 서버가 실행 중인 PC의 NAS4USB 앱에서만 설정할 수 있습니다.
          </p>
        ) : autoLaunch?.supported ? (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-nas-accent"
                checked={autoLaunch.enabled}
                disabled={busy}
                onChange={(event) => applyAutoLaunch({ enabled: event.target.checked })}
              />
              PC가 시작할 때 프로그램 자동 실행
            </label>
            <label
              className={`flex items-center gap-2 pl-6 text-sm ${
                autoLaunch.enabled ? 'cursor-pointer text-slate-700' : 'text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-nas-accent"
                checked={autoLaunch.startHidden}
                disabled={busy || !autoLaunch.enabled}
                onChange={(event) => applyAutoLaunch({ startHidden: event.target.checked })}
              />
              창을 열지 않고 트레이에서만 시작
            </label>
            <p className="break-all text-xs text-slate-500">등록 경로: {autoLaunch.execPath}</p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            {autoLaunch?.reason ?? '자동 실행 상태를 확인하는 중입니다…'}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">맞춤법 검사</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          TipTap·텍스트 편집기에서 Chromium/Windows 맞춤법 검사(빨간 밑줄)를 사용할지 정합니다. 이
          NAS4USB에 접속하는 기기에 같이 적용됩니다.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-nas-accent"
            checked={spellcheckEnabled}
            disabled={busy}
            onChange={(event) => chooseSpellcheck(event.target.checked)}
          />
          맞춤법 검사 사용
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">테마 색상</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          사이드바, 기본 버튼, 선택 표시 등 강조 요소에 쓰이는 색상입니다. 서버 설정에 저장되므로 이
          NAS4USB에 접속하는 모든 기기에 같은 색이 적용됩니다.
        </p>

        <div className="flex flex-wrap gap-2" role="listbox" aria-label="테마 색상">
          {ACCENT_COLOR_PRESETS.map((color) => {
            const selected = color === accent;
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`테마 색상 ${color}`}
                title={color}
                disabled={busy}
                className={`h-8 w-8 rounded-full border-2 transition-transform disabled:opacity-50 ${
                  selected
                    ? 'border-slate-800 scale-110'
                    : 'border-transparent hover:scale-105 hover:border-slate-300'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => chooseAccent(color)}
              />
            );
          })}
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          직접 선택
          <input
            type="color"
            aria-label="테마 색상 직접 선택"
            className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5 disabled:opacity-50"
            value={accent}
            disabled={busy}
            onChange={(event) => chooseAccent(event.target.value)}
          />
          <span className="font-mono text-xs uppercase text-slate-500">{accent}</span>
        </label>
      </section>
    </div>
  );
}
