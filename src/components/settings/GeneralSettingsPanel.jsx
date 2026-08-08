import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENT_COLOR_PRESETS, normalizeAccentColor } from '../../../shared/theme.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { isElectronRenderer } from '../../lib/runtime.js';
import { applyAccentColor, currentAccentColor } from '../../lib/theme.js';

/**
 * @typedef {{
 *   supported: boolean,
 *   enabled: boolean,
 *   startHidden: boolean,
 *   execPath: string,
 *   reason: string,
 * }} AutoLaunchState
 */

const BUTTON_CLASS =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** 설정 → 일반: 시작 프로그램 등록과 앱 강조 색상. */
export default function GeneralSettingsPanel() {
  const { alert: appAlert, dialog: generalDialog } = useAppConfirm();
  const electron = isElectronRenderer();

  /** @type {[AutoLaunchState | null, Function]} */
  const [autoLaunch, setAutoLaunch] = useState(null);
  const [accent, setAccent] = useState(currentAccentColor);
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
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '테마 설정을 불러오지 못했습니다.');
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
