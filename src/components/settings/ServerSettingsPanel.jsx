import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SYNC_PORT } from '../../../shared/constants.js';
import { normalizeWebServerPort } from '../../../shared/webServerConfig.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { isElectronRenderer } from '../../lib/runtime.js';

/**
 * @typedef {import('../../../shared/webServerConfig.js').WebServerMode} WebServerMode
 * @typedef {{
 *   supported: boolean,
 *   enabled: boolean,
 *   startHidden: boolean,
 *   execPath: string,
 *   reason: string,
 * }} AutoLaunchState
 * @typedef {{
 *   running: boolean,
 *   port: number | null,
 *   configuredPort: number,
 *   mode: WebServerMode,
 *   hostname: string,
 *   addresses: string[],
 *   appUrl: string | null,
 *   autoLaunch: AutoLaunchState,
 * }} ServerInfo
 */

const BUTTON_CLASS =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const DANGER_BUTTON_CLASS =
  'rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-nas-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-nas-accentHover disabled:opacity-50';

/**
 * @param {ServerInfo | null} info
 */
function statusLabel(info) {
  if (!info) return '확인 중…';
  if (!info.running) return '중지됨';
  return info.mode === 'lan' ? '실행 중 · Web (LAN)' : '실행 중 · Local (127.0.0.1)';
}

/**
 * @param {ServerInfo | null} info
 */
function lanUrls(info) {
  if (!info?.running || info.mode !== 'lan') return [];
  const port = info.port ?? info.configuredPort;
  return info.addresses.map((address) => `http://${address}:${port}`);
}

/** Super-admin only: HTTP·Y.js 서버 포트, Local/Web 모드, 방화벽 인바운드 규칙. */
export default function ServerSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialog: serverDialog } = useAppConfirm();
  const electron = isElectronRenderer();
  /** @type {[ServerInfo | null, Function]} */
  const [info, setInfo] = useState(null);
  const [portDraft, setPortDraft] = useState(String(DEFAULT_SYNC_PORT));
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!electron) return;
    try {
      const next = await window.nas4usb.server.getInfo();
      setInfo(next);
      setPortDraft(String(next.port ?? next.configuredPort));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '서버 정보를 불러오지 못했습니다.');
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
   * @returns {Promise<number | null>}
   */
  const draftPortOrAlert = async () => {
    const port = normalizeWebServerPort(portDraft);
    if (port == null) {
      await appAlert({ title: '서버 관리', body: '포트는 1~65535 사이 숫자여야 합니다.' });
      return null;
    }
    return port;
  };

  /**
   * The settings screen itself is served by this server, so a successful
   * restart means this page's origin is gone — move the window to the new URL.
   *
   * @param {{ port?: number, mode?: WebServerMode }} patch
   * @param {string} successBody
   */
  const applyConfig = async (patch, successBody) => {
    const result = await window.nas4usb.server.applyConfig(patch);
    setInfo(result.info);

    if (!result.restarted || !result.info.appUrl) {
      await appAlert({ title: '서버 관리', body: successBody });
      return;
    }

    await appAlert({
      title: '서버 관리',
      body: `${successBody}\n\n서버를 다시 시작했습니다. 확인을 누르면 새 주소로 이동합니다.\n${result.info.appUrl}`,
    });
    window.location.replace(result.info.appUrl);
  };

  const handleSavePort = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      try {
        await applyConfig({ port }, `포트를 ${port}(으)로 저장했습니다.`);
      } catch (error) {
        await appAlert({
          title: '서버 관리',
          body: error instanceof Error ? error.message : '포트를 저장하지 못했습니다.',
        });
        await refresh();
      }
    });

  /**
   * @param {WebServerMode} mode
   */
  const handleChangeMode = (mode) =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;

      if (mode === 'local' && info?.mode === 'lan') {
        const ok = await appConfirm({
          title: '서버 관리',
          body: 'Local 모드로 바꾸면 다른 PC·모바일에서의 접속이 모두 끊깁니다.\n계속할까요?',
          confirmLabel: '변경',
        });
        if (!ok) return;
      }

      try {
        await applyConfig(
          { port, mode },
          mode === 'lan'
            ? `Web (LAN) 모드로 전환했습니다. 같은 네트워크의 다른 기기에서 접속할 수 있습니다.`
            : `Local 모드로 전환했습니다. 이 PC에서만 접속할 수 있습니다.`,
        );
      } catch (error) {
        await appAlert({
          title: '서버 관리',
          body: error instanceof Error ? error.message : '서버 모드를 바꾸지 못했습니다.',
        });
        await refresh();
      }
    });

  const handleAllowFirewall = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      try {
        const result = await window.nas4usb.server.allowFirewall(port);
        await appAlert({ title: '방화벽', body: result.message });
      } catch (error) {
        await appAlert({
          title: '방화벽',
          body: error instanceof Error ? error.message : '방화벽 규칙을 추가하지 못했습니다.',
        });
      }
    });

  const handleRemoveFirewall = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      const ok = await appConfirm({
        title: '방화벽',
        body: `TCP ${port} 인바운드 허용 규칙을 제거할까요?`,
        confirmLabel: '제거',
      });
      if (!ok) return;
      try {
        const result = await window.nas4usb.server.removeFirewall(port);
        await appAlert({ title: '방화벽', body: result.message });
      } catch (error) {
        await appAlert({
          title: '방화벽',
          body: error instanceof Error ? error.message : '방화벽 규칙을 제거하지 못했습니다.',
        });
      }
    });

  if (!electron) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
        서버 관리는 서버가 실행 중인 PC의 NAS4USB 앱에서만 사용할 수 있습니다.
      </p>
    );
  }

  const displayPort = info?.port ?? info?.configuredPort ?? DEFAULT_SYNC_PORT;
  const addresses = lanUrls(info);

  return (
    <div className="space-y-6">
      {serverDialog}

      {loadError ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{loadError}</p>
          <button type="button" className={BUTTON_CLASS} onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">포트</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          HTTP·Y.js 서버가 사용하는 TCP 포트입니다. 저장하면{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">.nas4usb-settings.json</code>에
          기록되어 <code className="rounded bg-slate-100 px-1 text-[12px]">.env</code>의{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">PORT</code>보다 우선 적용됩니다.
          저장하지 않으면 .env(없으면 {DEFAULT_SYNC_PORT})를 따릅니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            inputMode="numeric"
            aria-label="서버 포트"
            className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-nas-accent"
            value={portDraft}
            disabled={busy}
            onChange={(event) => setPortDraft(event.target.value)}
          />
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={busy}
            onClick={handleSavePort}
          >
            포트 저장
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">접속 범위</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          Local은 이 PC에서만, Web (LAN)은 같은 네트워크의 다른 기기에서도 접속할 수 있습니다. 선택한
          값은 설정에 저장되어 다음 실행에도 유지되며 .env의{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">HOSTNAME</code>보다 우선합니다.
        </p>

        <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-[6rem_1fr]">
          <dt className="text-slate-500">상태</dt>
          <dd>{statusLabel(info)}</dd>
          <dt className="text-slate-500">포트</dt>
          <dd>{displayPort}</dd>
          <dt className="text-slate-500">접속 주소</dt>
          <dd className="break-all">
            {info?.appUrl ?? '—'}
            {addresses.length > 0 ? `, ${addresses.join(', ')}` : ''}
          </dd>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy || info?.mode === 'local'}
            onClick={() => handleChangeMode('local')}
          >
            {info?.mode === 'local' ? '✓ Local 사용 중' : 'Local (127.0.0.1)'}
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy || info?.mode === 'lan'}
            onClick={() => handleChangeMode('lan')}
          >
            {info?.mode === 'lan' ? '✓ Web (LAN) 사용 중' : 'Web (LAN)'}
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy}
            onClick={() => void refresh()}
          >
            상태 새로고침
          </button>
        </div>
        <p className="text-sm text-slate-500">
          서버를 완전히 중지하려면 트레이 아이콘 메뉴의 Stop Server를 사용하세요. 이 화면도 서버가
          제공하므로 여기서 중지하면 창이 비어 버립니다.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">방화벽 인바운드 허용</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          Web (LAN) 모드에서 다른 기기가 접속하려면 Windows 방화벽에서 위 포트의 TCP 인바운드를
          허용해야 합니다. 권한이 부족하면 UAC 확인 창이 뜹니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy}
            onClick={handleAllowFirewall}
          >
            허용 규칙 추가
          </button>
          <button
            type="button"
            className={DANGER_BUTTON_CLASS}
            disabled={busy}
            onClick={handleRemoveFirewall}
          >
            허용 규칙 제거
          </button>
        </div>
      </section>
    </div>
  );
}
