import { useState } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile.js';
import { formatUserDisplayNameInput, normalizeDisplayName, USER_NAME_PREFIX } from '../../lib/userProfile.js';
import { loadSyncHost, saveSyncHost } from '../../lib/syncHost.js';
import { copyTextToClipboard } from '../../lib/shareLink.js';
import { buildLanAccessClipboardText } from '../../sync/buildWsUrl.js';
import { APP_VERSION, APP_NAME_LONG } from '../../../shared/constants.js';
import AppLogo from '../common/AppLogo.jsx';
import SplashOverlay from '../common/SplashOverlay.jsx';
import AdminLoginForm from './AdminLoginForm.jsx';

function SyncBadge({ syncInfo, loading }) {
  const [copied, setCopied] = useState(false);

  if (loading) {
    return <span className="text-[10pt] text-slate-400">동기화 준비 중…</span>;
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

  const handleClick = async (event) => {
    if (event.shiftKey) {
      handleConfigureHost();
      return;
    }

    try {
      await copyTextToClipboard(buildLanAccessClipboardText(syncInfo));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert('클립보드 복사에 실패했습니다.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        copied
          ? '클립보드에 복사됨'
          : '클릭하여 LAN 접속 링크·포트 복사 (Shift+클릭: 서버 IP 설정)'
      }
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10pt] font-medium text-emerald-700 hover:bg-emerald-100"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {copied ? 'Y.js 복사됨' : `Y.js ${label}`}
    </button>
  );
}

function BrandMark({ onHome }) {
  return (
    <button
      type="button"
      title="홈"
      aria-label="홈"
      onClick={onHome}
      className="inline-flex shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90"
    >
      <AppLogo size={32} />
    </button>
  );
}

function UserNameField({ loading, saving, displayName, onChange, onCommit, onKeyDown }) {
  const handleNameChange = (event) => {
    onChange({ target: { value: formatUserDisplayNameInput(event.target.value) } });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <label htmlFor="user-name" className="sr-only">
        사용자명
      </label>
      <input
        id="user-name"
        type="text"
        inputMode="numeric"
        value={loading ? '' : displayName}
        onChange={handleNameChange}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        disabled={loading}
        placeholder={loading ? '…' : `${USER_NAME_PREFIX}001`}
        maxLength={6}
        className="h-8 w-[6.25rem] shrink-0 rounded-md border border-nas-border bg-white px-2 text-[10pt] text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:cursor-wait disabled:opacity-60"
      />
      {saving && <span className="shrink-0 text-[10pt] text-slate-400">저장 중…</span>}
    </div>
  );
}

export default function TopBar({ syncInfo, infoLoading, onHome }) {
  const userProfile = useUserProfile();
  const [splashOpen, setSplashOpen] = useState(false);

  const userNameField = (
    <UserNameField
      loading={userProfile.loading}
      saving={userProfile.saving}
      displayName={userProfile.displayName}
      onChange={userProfile.handleChange}
      onCommit={userProfile.handleCommit}
      onKeyDown={userProfile.handleKeyDown}
    />
  );

  return (
    <header className="shrink-0 border-b border-nas-border bg-white px-4 py-2 min-h-12">
      <SplashOverlay open={splashOpen} onClose={() => setSplashOpen(false)} />
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BrandMark onHome={onHome} />

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex min-w-0 items-baseline gap-2 rounded-md text-left transition-opacity hover:opacity-80"
                onClick={() => setSplashOpen(true)}
                aria-label={`${APP_NAME_LONG} 정보 보기`}
              >
                <span className="truncate text-sm font-semibold text-slate-800">{APP_NAME_LONG}</span>
                <span className="shrink-0 text-xs font-medium text-slate-400">v{APP_VERSION}</span>
              </button>
            </div>
          </div>

          <SyncBadge syncInfo={syncInfo} loading={infoLoading} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {userNameField}
          <AdminLoginForm />
        </div>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BrandMark onHome={onHome} />

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex min-w-0 items-baseline gap-2 rounded-md text-left transition-opacity hover:opacity-80"
              onClick={() => setSplashOpen(true)}
              aria-label={`${APP_NAME_LONG} 정보 보기`}
            >
              <span className="truncate text-sm font-semibold text-slate-800">{APP_NAME_LONG}</span>
              <span className="shrink-0 text-xs font-medium text-slate-400">v{APP_VERSION}</span>
            </button>
          </div>
        </div>

        <SyncBadge syncInfo={syncInfo} loading={infoLoading} />
        {userNameField}
        <AdminLoginForm />
      </div>
    </header>
  );
}
