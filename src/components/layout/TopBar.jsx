import { useState } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { formatUserDisplayNameInput, USER_NAME_PREFIX } from '../../lib/userProfile.js';
import { loadSyncHost, saveSyncHost } from '../../lib/syncHost.js';
import { copyTextToClipboard } from '../../lib/shareLink.js';
import { buildLanAccessClipboardText, getSyncServerUrl } from '../../sync/buildWsUrl.js';
import { openExternalUrl } from '../../lib/openExternal.js';
import { runUpdateCheck } from '../../lib/updateCheckUi.js';
import { APP_VERSION, APP_NAME_LONG } from '../../../shared/constants.js';
import AppLogo from '../common/AppLogo.jsx';
import SplashOverlay from '../common/SplashOverlay.jsx';
import AdminLoginForm from './AdminLoginForm.jsx';
import { nativeAlert, nativePrompt } from '../../lib/nativeDialog.js';

const settingsIconBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800';

function HelpQuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"
      />
    </svg>
  );
}

function InternetGlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
      />
    </svg>
  );
}

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
    const nextHost = nativePrompt(
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
      nativeAlert('클립보드 복사에 실패했습니다.');
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
      className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10pt] font-medium text-emerald-700 hover:bg-emerald-100 lg:inline-flex"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {copied ? 'Y.js 복사됨' : `Y.js ${label}`}
    </button>
  );
}

function BrandMark() {
  return (
    <button
      type="button"
      title="새로고침"
      aria-label="새로고침"
      onClick={() => window.location.reload()}
      className="inline-flex shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90"
    >
      <AppLogo size={32} />
    </button>
  );
}

function UserNameField({ loading, saving, displayName, readOnly, onChange, onCommit, onKeyDown }) {
  const handleNameChange = (event) => {
    if (readOnly) return;
    onChange({ target: { value: formatUserDisplayNameInput(event.target.value) } });
  };

  if (loading) {
    return <span className="text-[10pt] text-slate-400">…</span>;
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <label htmlFor="user-name" className="sr-only">
        사용자명
      </label>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10pt] font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <input
          id="user-name"
          type="text"
          inputMode={readOnly ? 'text' : 'numeric'}
          value={displayName}
          onChange={handleNameChange}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          readOnly={readOnly}
          title={readOnly ? '로그인 사용자 ID' : '사용자명'}
          placeholder={`${USER_NAME_PREFIX}001`}
          maxLength={readOnly ? 64 : 6}
          size={Math.max(6, Math.min(displayName.length || 6, 16))}
          className={`min-w-0 border-0 bg-transparent p-0 text-[10pt] font-medium text-emerald-700 outline-none placeholder:text-emerald-400 ${
            readOnly ? 'cursor-default' : 'cursor-text'
          }`}
        />
      </div>
      {saving && <span className="shrink-0 text-[10pt] text-slate-400">저장 중…</span>}
    </div>
  );
}

export default function TopBar({
  syncInfo,
  infoLoading,
  onOpenSettings,
  settingsOpen = false,
}) {
  const userProfile = useUserProfile();
  const { isSuperAdmin } = useAdminAuthContext();
  const { alert, confirm, dialog: updateDialog } = useAppConfirm();
  const [splashOpen, setSplashOpen] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);

  const handleUpdateCheck = () => {
    if (updateChecking) return;
    setUpdateChecking(true);
    void runUpdateCheck({ alert, confirm }).finally(() => setUpdateChecking(false));
  };

  const handleOpenLocalInBrowser = () => {
    const url = getSyncServerUrl(syncInfo);
    void openExternalUrl(url).catch(() => {
      nativeAlert('브라우저에서 열기에 실패했습니다.');
    });
  };

  const userNameField = (
    <UserNameField
      loading={userProfile.loading}
      saving={userProfile.saving}
      displayName={userProfile.displayName}
      readOnly={userProfile.readOnly}
      onChange={userProfile.handleChange}
      onCommit={userProfile.handleCommit}
      onKeyDown={userProfile.handleKeyDown}
    />
  );

  return (
    <header className="shrink-0 border-b border-nas-border bg-white px-4 py-2 min-h-12">
      <SplashOverlay open={splashOpen} onClose={() => setSplashOpen(false)} />
      {updateDialog}
      <div className="nas-topbar flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BrandMark />

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

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <SyncBadge syncInfo={syncInfo} loading={infoLoading} />
          {userNameField}
          <button
            type="button"
            className={settingsIconBtnClass}
            aria-label="브라우저에서 열기"
            title={`브라우저에서 로컬 접속 (${getSyncServerUrl(syncInfo)})`}
            disabled={infoLoading}
            onClick={handleOpenLocalInBrowser}
          >
            <InternetGlobeIcon />
          </button>
          {isSuperAdmin ? (
            <button
              type="button"
              className={settingsIconBtnClass}
              aria-label="환경설정"
              title="환경설정 (총괄관리자)"
              aria-pressed={settingsOpen}
              onClick={() => onOpenSettings?.()}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className={settingsIconBtnClass}
            aria-label="업데이트 확인"
            title="업데이트 확인"
            disabled={updateChecking}
            onClick={handleUpdateCheck}
          >
            <HelpQuestionIcon />
          </button>
          <AdminLoginForm />
        </div>
      </div>
    </header>
  );
}
