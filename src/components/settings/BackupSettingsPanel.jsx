import { useCallback, useEffect, useState } from 'react';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { isElectronRenderer } from '../../lib/runtime.js';
import { formatByteSize } from '../../../shared/videoPreviewCache.js';
import {
  DEFAULT_WORKSPACE_BACKUP,
  normalizeBackupTime,
  normalizeWorkspaceBackup,
} from '../../../shared/workspaceBackup.js';

const BUTTON_CLASS =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** Archives are listed as `YYYYMMDD/파일명`; ones made before day folders have no prefix. */
function splitArchiveName(name) {
  const raw = String(name ?? '');
  const slash = raw.lastIndexOf('/');
  if (slash < 0) return { folder: '', base: raw };
  return { folder: raw.slice(0, slash), base: raw.slice(slash + 1) };
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

export default function BackupSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, choose: appChoose, dialog: backupDialog } =
    useAppConfirm();
  const electron = isElectronRenderer();
  const [config, setConfig] = useState(DEFAULT_WORKSPACE_BACKUP);
  const [timeDraft, setTimeDraft] = useState('18:00');
  const [last, setLast] = useState(null);
  /** @type {[Array<{ fileName: string, bytes: number, at: string }>, Function]} */
  const [archives, setArchives] = useState([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [settings, status] = await Promise.all([
        window.nas4usb.settings.get(),
        window.nas4usb.backup.getStatus(),
      ]);
      setConfig(normalizeWorkspaceBackup(status?.config ?? settings?.workspaceBackup));
      setLast(status?.last ?? null);
      setArchives(Array.isArray(status?.archives) ? status.archives : []);
      setRunning(Boolean(status?.running));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '백업 설정을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = async (patch) => {
    setBusy(true);
    try {
      const next = await window.nas4usb.backup.saveConfig({ ...config, ...patch });
      setConfig(normalizeWorkspaceBackup(next));
      return true;
    } catch (error) {
      void appAlert({
        title: '백업 관리',
        body: error instanceof Error ? error.message : '백업 설정을 저장하지 못했습니다.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chooseDest = async () => {
    if (!electron) return;
    const picked = await window.nas4usb.dialog.pickDirectory({
      title: '백업 폴더 선택',
    });
    if (!picked) return;
    if (await persist({ destPath: picked })) await refresh();
  };

  const addTime = async () => {
    const time = normalizeBackupTime(timeDraft);
    if (!time) {
      void appAlert({ title: '백업 관리', body: '시간 형식이 올바르지 않습니다. 예: 09:00' });
      return;
    }
    if (config.times.includes(time)) return;
    await persist({ times: [...config.times, time] });
  };

  const removeTime = async (time) => {
    await persist({ times: config.times.filter((item) => item !== time) });
  };

  const deleteArchive = async (fileName) => {
    const ok = await appConfirm({
      title: '백업 삭제',
      body: `"${fileName}" 파일을 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await window.nas4usb.backup.delete(fileName);
      setArchives(Array.isArray(next) ? next : []);
      if (last?.fileName === fileName) setLast(null);
    } catch (error) {
      void appAlert({
        title: '백업 삭제 실패',
        body: error instanceof Error ? error.message : '백업을 삭제하지 못했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  const exportPcSettings = async () => {
    if (!electron) return;
    setBusy(true);
    try {
      const result = await window.nas4usb.backup.exportPcSettings();
      if (!result) return;
      void appAlert({
        title: 'PC 설정 내보내기',
        body: `저장했습니다.\n${result.filePath}\n\n회원·폴더 색/레벨·즐겨찾기·공유 링크·허용 IP 등이 들어 있습니다. 로그인 세션과 문서 이력은 넣지 않았습니다.`,
      });
    } catch (error) {
      void appAlert({
        title: 'PC 설정 내보내기',
        body: error instanceof Error ? error.message : '설정을 내보내지 못했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  const importPcSettings = async () => {
    if (!electron) return;
    const zipPath = await window.nas4usb.dialog.pickFile({
      title: 'PC 설정 가져오기',
      filters: [
        { name: 'NAS4USB 설정', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!zipPath) return;

    const choice = await appChoose({
      title: 'PC 설정 가져오기',
      body: '이 PC의 설정 파일을 덮어씁니다. 회원 비밀번호 해시가 포함됩니다.\n\n새 PC의 드라이브/폴더가 다르면 「이 PC 경로 유지」를 고르세요. (데이터 루트·외부폴더·백업 폴더·FFmpeg 경로)',
      primaryLabel: '전부 덮어쓰기',
      secondaryLabel: '이 PC 경로 유지',
      cancelLabel: '취소',
    });
    if (!choice) return;

    const ok = await appConfirm({
      title: 'PC 설정 가져오기',
      body: '가져오면 앱이 다시 시작됩니다. 계속할까요?',
      confirmLabel: '가져오고 다시 시작',
      confirmVariant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await window.nas4usb.backup.importPcSettings({
        zipPath,
        keepLocalPaths: choice === 'secondary',
      });
    } catch (error) {
      void appAlert({
        title: 'PC 설정 가져오기',
        body: error instanceof Error ? error.message : '설정을 가져오지 못했습니다.',
      });
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!config.destPath) {
      void appAlert({ title: '백업 관리', body: '백업 폴더를 먼저 지정해 주세요.' });
      return;
    }
    setBusy(true);
    setRunning(true);
    try {
      const result = await window.nas4usb.backup.runNow();
      setLast(result);
      await refresh();
      const names =
        Array.isArray(result?.files) && result.files.length > 0
          ? result.files.map((item) => item.fileName).join('\n')
          : result.fileName;
      void appAlert({
        title: '백업 관리',
        body: `백업을 만들었습니다.\n${names}\n${formatByteSize(result.bytes)}`,
      });
    } catch (error) {
      void appAlert({
        title: '백업 실패',
        body: error instanceof Error ? error.message : '백업을 만들지 못했습니다.',
      });
      await refresh();
    } finally {
      setBusy(false);
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      {backupDialog}

      {loadError ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{loadError}</p>
          <button type="button" className={BUTTON_CLASS} onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">PC 설정 (이사)</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          다른 PC에 설치한 뒤 이 파일을 가져와 덮어쓰면 회원·폴더 설정·파일 레벨·즐겨찾기·공유
          링크·허용 IP가 그대로 이어집니다. 문서(share/private)는 아래 백업으로 따로 옮기세요.
        </p>
        {!electron ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            PC 설정 내보내기/가져오기는 서버가 실행 중인 PC의 NAS4USB 앱에서만 할 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={busy}
              onClick={() => void exportPcSettings()}
            >
              설정 내보내기…
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={busy}
              onClick={() => void importPcSettings()}
            >
              설정 가져오기…
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">백업 대상</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          공유폴더(<code className="rounded bg-slate-100 px-1 text-[12px]">share</code>)는 ZIP
          하나, 개인폴더(<code className="rounded bg-slate-100 px-1 text-[12px]">private</code>)는
          사용자마다 ZIP을 만듭니다. 외부폴더·영상 캐시·문서 이력은 넣지 않습니다. 잠긴 파일은
          암호문 그대로 복사됩니다.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">백업 폴더</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          share/private가 아닌 폴더면 됩니다. 외부폴더 아래나 다른 드라이브를 지정할 수 있습니다.
        </p>
        <p className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {config.destPath || '아직 지정하지 않았습니다.'}
        </p>
        {!electron ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            백업 폴더는 서버가 실행 중인 PC의 NAS4USB 앱에서만 지정할 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => void chooseDest()}>
              폴더 선택…
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={busy || !config.destPath}
              onClick={() => void persist({ destPath: null })}
            >
              지정 해제
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">지금 백업</h3>
        <p className="text-sm leading-relaxed text-slate-600">
          백업 폴더 아래 <code className="rounded bg-slate-100 px-1 text-[12px]">YYYYMMDD</code>{' '}
          폴더를 만들고 그 안에{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">NAS4USB_백업_share_YYMMDD_HHMMSS.zip</code>
          과{' '}
          <code className="rounded bg-slate-100 px-1 text-[12px]">
            NAS4USB_백업_private_아이디_YYMMDD_HHMMSS.zip
          </code>
          을 넣습니다. 같은 날 백업 횟수가 하루 한도를 넘으면 그 폴더에서 오래된 회차부터
          지웁니다.
        </p>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || running || !electron || !config.destPath}
          onClick={() => void runNow()}
        >
          {running ? '백업 중…' : '지금 백업'}
        </button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">자동 미러</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
            checked={config.enabled}
            disabled={busy || !electron}
            onChange={(event) => void persist({ enabled: event.target.checked })}
          />
          지정한 시각에 자동으로 백업
        </label>
        <p className="text-sm leading-relaxed text-slate-600">
          앱이 켜져 있는 동안만 동작합니다. 해당 시각에 꺼져 있었다면 그날 그 시각이 지난 뒤 처음
          켜질 때 한 번 실행합니다.
        </p>

        <label className="block max-w-xs space-y-1">
          <span className="text-xs font-medium text-slate-600">하루에 남길 백업 횟수</span>
          <input
            type="number"
            min={1}
            max={24}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-nas-accent"
            value={config.maxPerDay}
            disabled={busy || !electron}
            onChange={(event) => {
              const value = Number(event.target.value);
              setConfig((prev) => ({ ...prev, maxPerDay: value }));
            }}
            onBlur={(event) => void persist({ maxPerDay: Number(event.target.value) })}
          />
        </label>

        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">백업 시각</span>
          {config.times.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
              등록된 시각이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {config.times.map((time) => (
                <li
                  key={time}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="font-mono text-sm font-semibold text-slate-800">{time}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={busy || !electron}
                    onClick={() => void removeTime(time)}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">시각 추가</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-nas-accent"
                value={timeDraft}
                onChange={(event) => setTimeDraft(event.target.value)}
              />
              <button
                type="button"
                className={`${BUTTON_CLASS} h-10`}
                disabled={busy || !electron}
                onClick={() => void addTime()}
              >
                시각 추가
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">최근 백업</h3>
        {last?.error ? <p className="text-sm text-red-600">{last.error}</p> : null}
        {archives.length === 0 ? (
          <p className="text-sm text-slate-500">아직 백업 파일이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {archives.map((item) => {
              const { folder, base } = splitArchiveName(item.fileName);
              return (
                <li
                  key={item.fileName}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-slate-800" title={item.fileName}>
                      {base}
                    </p>
                    <p className="text-xs text-slate-500">
                      {folder ? `${folder} · ` : ''}
                      {formatWhen(item.at)}
                      {typeof item.bytes === 'number' ? ` · ${formatByteSize(item.bytes)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={busy || running || !electron}
                    onClick={() => void deleteArchive(item.fileName)}
                  >
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
