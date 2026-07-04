import { useState } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile.js';
import { loadSyncHost, saveSyncHost } from '../../lib/syncHost.js';

function SyncBadge({ syncInfo, loading }) {
  if (loading) {
    return <span className="text-xs text-slate-400">동기화 준비 중…</span>;
  }

  const primaryAddress = syncInfo?.addresses?.[0];
  const configuredHost = loadSyncHost();
  const label = configuredHost
    ? `LAN ${configuredHost}:${syncInfo?.port ?? '—'}`
    : primaryAddress
      ? `LAN ${primaryAddress}:${syncInfo.port}`
      : `로컬 :${syncInfo?.port ?? '—'}`;

  const handleConfigureHost = () => {
    const nextHost = window.prompt(
      '동기화 서버 IP (호스트 PC 주소). 비우면 현재 접속 주소를 사용합니다.',
      configuredHost || primaryAddress || '127.0.0.1',
    );
    if (nextHost == null) return;
    saveSyncHost(nextHost);
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={handleConfigureHost}
      title="클릭하여 LAN 동기화 서버 IP 설정"
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Y.js {label}
    </button>
  );
}

function EditorUpdateDialog({ result, onClose }) {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="border-b border-nas-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">에디터 업데이트 결과</h2>
        </header>
        <ul className="space-y-2 px-4 py-4 text-sm">
          {result.results.map((item) => (
            <li
              key={item.id}
              className={`rounded-md border px-3 py-2 ${
                item.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <p className="font-medium">{item.label}</p>
              <p className="text-xs opacity-90">{item.message}</p>
              {item.version && <p className="mt-1 text-xs opacity-75">버전: {item.version}</p>}
            </li>
          ))}
        </ul>
        <footer className="flex justify-end border-t border-nas-border px-4 py-3">
          <button type="button" className="nas-btn-primary" onClick={onClose}>
            확인
          </button>
        </footer>
      </div>
    </div>
  );
}

function HomeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9.5V20h14V9.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20v-6h6v6" />
    </svg>
  );
}

function UserNameField({ loading, saving, displayName, onChange, onCommit, onKeyDown }) {
  const widthText = '사용자610 ';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label htmlFor="user-name" className="sr-only">
        사용자명
      </label>
      <span className="shrink-0 text-xs font-medium text-slate-500">사용자</span>
      <div className="inline-grid w-fit shrink-0 [&>*]:col-start-1 [&>*]:row-start-1">
        <span
          className="invisible whitespace-pre px-1.5 text-sm leading-8"
          aria-hidden="true"
        >
          {widthText}
        </span>
        <input
          id="user-name"
          type="text"
          value={displayName}
          onChange={onChange}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          disabled={loading}
          placeholder={loading ? '…' : '사용자610'}
          maxLength={40}
          size={1}
          className="h-8 min-w-0 w-full overflow-hidden rounded-md border border-nas-border bg-white px-1.5 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:cursor-wait disabled:opacity-60"
        />
      </div>
      {saving && <span className="shrink-0 text-xs text-slate-400">저장 중…</span>}
    </div>
  );
}

export default function TopBar({
  syncInfo,
  infoLoading,
  departments,
  departmentsLoading,
  selectedDepartment,
  onHome,
  onDepartmentChange,
}) {
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const userProfile = useUserProfile();

  const handleEditorUpdate = async () => {
    const confirmed = window.confirm(
      'HWPX(rhwp) 에디터 코어를 USB에 업데이트할까요?\n\nGit submodule 또는 lib/updates/ 패키지를 사용합니다.',
    );
    if (!confirmed) return;

    setUpdating(true);
    setUpdateResult(null);

    try {
      if (!window.educowork?.editors?.update) {
        throw new Error(
          '에디터 API가 연결되지 않았습니다. preload 변경 반영을 위해 npm run dev를 다시 실행해 주세요.',
        );
      }

      const result = await window.educowork.editors.update();
      setUpdateResult(result);
    } catch (error) {
      setUpdateResult({
        success: false,
        results: [
          {
            id: 'error',
            label: '업데이트 오류',
            success: false,
            message: error instanceof Error ? error.message : '알 수 없는 오류',
          },
        ],
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-nas-border bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            title="홈"
            aria-label="홈"
            onClick={onHome}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-nas-accent"
          >
            <HomeIcon className="h-4 w-4" />
          </button>

          <label className="sr-only" htmlFor="department-select">
            부서 선택
          </label>
          <select
            id="department-select"
            value={selectedDepartment ?? ''}
            onChange={(event) => onDepartmentChange(event.target.value)}
            disabled={departmentsLoading}
            className="h-8 min-w-[132px] max-w-[180px] rounded-md border border-nas-border bg-white px-2 text-sm text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:cursor-wait disabled:opacity-60"
          >
            <option value="">{departmentsLoading ? '불러오는 중…' : '부서 선택'}</option>
            {departments.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <UserNameField
            loading={userProfile.loading}
            saving={userProfile.saving}
            displayName={userProfile.displayName}
            onChange={userProfile.handleChange}
            onCommit={userProfile.handleCommit}
            onKeyDown={userProfile.handleKeyDown}
          />
        </div>

        <div className="flex items-center gap-2">
          <SyncBadge syncInfo={syncInfo} loading={infoLoading} />
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-50"
            onClick={handleEditorUpdate}
            disabled={updating}
            title="rhwp 코어를 USB(lib/)에 반영"
          >
            {updating ? '업데이트 중…' : '에디터 업데이트'}
          </button>
        </div>
      </header>

      <EditorUpdateDialog result={updateResult} onClose={() => setUpdateResult(null)} />
    </>
  );
}
