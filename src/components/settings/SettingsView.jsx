import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isValidIpOrCidr,
  normalizeAllowedIpCidrs,
} from '../../../shared/ipCidrCore.js';
import {
  DEFAULT_GUEST_PERMISSIONS,
  DEFAULT_LOGGED_IN_PERMISSIONS,
  normalizeGuestPermissionsFromUi,
} from '../../../shared/guestPermissions.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import MembersSettingsPanel from './MembersSettingsPanel.jsx';

/**
 * @typedef {{ cidr: string, description?: string }} AllowedIpEntry
 * @typedef {{ view: boolean, read: boolean, write: boolean }} AccessPermissionFlags
 * @typedef {'access' | 'ip' | 'members'} SettingsTabId
 */

/** @type {{ id: SettingsTabId, label: string }[]} */
const SETTINGS_TABS = [
  { id: 'access', label: '접근 권한 설정' },
  { id: 'ip', label: '접근 가능 IP 대역' },
  { id: 'members', label: '회원 관리' },
];

/**
 * @param {{
 *   label: string,
 *   value: AccessPermissionFlags,
 *   onToggle: (key: 'view' | 'read' | 'write') => void,
 * }} props
 */
function PermissionRow({ label, value, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-800">
      <span className="w-28 shrink-0 font-medium text-slate-700">{label}</span>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={value.view}
          onChange={() => onToggle('view')}
        />
        <span>보기</span>
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={value.read}
          disabled={!value.view}
          onChange={() => onToggle('read')}
        />
        <span className={!value.view ? 'text-slate-400' : undefined}>읽기</span>
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={value.write}
          disabled={!value.view}
          onChange={() => onToggle('write')}
        />
        <span className={!value.view ? 'text-slate-400' : undefined}>쓰기</span>
      </label>
    </div>
  );
}

export default function SettingsView() {
  const { alert: appAlert, dialog: settingsDialog } = useAppConfirm();
  /** @type {[AllowedIpEntry[], Function]} */
  const [allowedIpCidrs, setAllowedIpCidrs] = useState([]);
  /** @type {[AccessPermissionFlags, Function]} */
  const [guestPermissions, setGuestPermissions] = useState({ ...DEFAULT_GUEST_PERMISSIONS });
  /** @type {[AccessPermissionFlags, Function]} */
  const [loggedInPermissions, setLoggedInPermissions] = useState({
    ...DEFAULT_LOGGED_IN_PERMISSIONS,
  });
  /** @type {[SettingsTabId, Function]} */
  const [activeTab, setActiveTab] = useState('access');
  const [ipCidrDraft, setIpCidrDraft] = useState('');
  const [ipDescriptionDraft, setIpDescriptionDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const descriptionSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const applySettings = useCallback((settings) => {
    setAllowedIpCidrs(normalizeAllowedIpCidrs(settings?.allowedIpCidrs ?? []));
    setGuestPermissions(
      settings?.guestPermissions
        ? normalizeGuestPermissionsFromUi(settings.guestPermissions)
        : { ...DEFAULT_GUEST_PERMISSIONS },
    );
    setLoggedInPermissions(
      settings?.loggedInPermissions
        ? normalizeGuestPermissionsFromUi(settings.loggedInPermissions)
        : { ...DEFAULT_LOGGED_IN_PERMISSIONS },
    );
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const settings = await window.nas4usb.settings.get();
      applySettings(settings);
      setIpCidrDraft('');
      setIpDescriptionDraft('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (descriptionSaveTimerRef.current) {
        clearTimeout(descriptionSaveTimerRef.current);
      }
    };
  }, []);

  /**
   * @param {{
   *   allowedIpCidrs?: AllowedIpEntry[],
   *   guestPermissions?: AccessPermissionFlags,
   *   loggedInPermissions?: AccessPermissionFlags,
   * }} patch
   * @param {{ silent?: boolean }} [options]
   */
  const persistSettings = async (patch, { silent = true } = {}) => {
    setSaving(true);
    try {
      const next = await window.nas4usb.settings.update({
        allowedIpCidrs: normalizeAllowedIpCidrs(patch.allowedIpCidrs ?? allowedIpCidrs),
        guestPermissions: normalizeGuestPermissionsFromUi(
          patch.guestPermissions ?? guestPermissions,
        ),
        loggedInPermissions: normalizeGuestPermissionsFromUi(
          patch.loggedInPermissions ?? loggedInPermissions,
        ),
      });
      applySettings(next);
      if (!silent) {
        void appAlert({ title: '환경설정', body: '설정을 저장했습니다.' });
      }
      return true;
    } catch (error) {
      void appAlert({
        title: '환경설정',
        body: error instanceof Error ? error.message : '설정 저장에 실패했습니다.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * @param {'guest' | 'loggedIn'} role
   * @param {'view' | 'read' | 'write'} key
   */
  const togglePermission = (role, key) => {
    const current = role === 'guest' ? guestPermissions : loggedInPermissions;
    const nextValue = !current[key];
    const nextFlags =
      key === 'view' && !nextValue
        ? { view: false, read: false, write: false }
        : { ...current, [key]: nextValue };

    if (role === 'guest') {
      setGuestPermissions(nextFlags);
      void persistSettings({ guestPermissions: nextFlags });
    } else {
      setLoggedInPermissions(nextFlags);
      void persistSettings({ loggedInPermissions: nextFlags });
    }
  };

  const addAllowedIp = async () => {
    const value = ipCidrDraft.trim();
    if (!value) {
      void appAlert({ title: '환경설정', body: '허용 IP 주소를 입력해 주세요.' });
      return;
    }
    if (!isValidIpOrCidr(value)) {
      void appAlert({
        title: '환경설정',
        body: '올바른 IPv4 주소, CIDR, 또는 IP 범위 형식이 아닙니다.\n예: 192.168.0.0/24, 10.0.0.30, 221.168.1.0-221.168.12.255',
      });
      return;
    }
    const key = value.toLowerCase();
    if (allowedIpCidrs.some((item) => item.cidr.toLowerCase() === key)) {
      void appAlert({ title: '환경설정', body: '이미 등록된 IP/CIDR/범위 입니다.' });
      return;
    }
    const description = ipDescriptionDraft.trim();
    const nextList = [
      ...allowedIpCidrs,
      description ? { cidr: value, description } : { cidr: value },
    ];
    setAllowedIpCidrs(nextList);
    setIpCidrDraft('');
    setIpDescriptionDraft('');
    await persistSettings({ allowedIpCidrs: nextList });
  };

  const removeAllowedIp = async (cidr) => {
    const nextList = allowedIpCidrs.filter((item) => item.cidr !== cidr);
    setAllowedIpCidrs(nextList);
    await persistSettings({ allowedIpCidrs: nextList });
  };

  const updateAllowedIpDescription = (cidr, description) => {
    const trimmed = description.trim();
    const nextList = allowedIpCidrs.map((item) => {
      if (item.cidr !== cidr) return item;
      if (!trimmed) return { cidr: item.cidr };
      return { cidr: item.cidr, description: trimmed };
    });
    setAllowedIpCidrs(nextList);

    if (descriptionSaveTimerRef.current) {
      clearTimeout(descriptionSaveTimerRef.current);
    }
    descriptionSaveTimerRef.current = setTimeout(() => {
      void persistSettings({ allowedIpCidrs: nextList });
    }, 400);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {settingsDialog}
      <div className="border-b border-slate-200 px-4 pt-3">
        <div className="flex gap-1" role="tablist" aria-label="환경설정">
          {SETTINGS_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`-mb-px rounded-t-md px-4 py-2.5 text-sm transition-colors ${
                  selected
                    ? 'border border-b-white border-slate-200 bg-white font-semibold text-slate-900'
                    : 'border border-transparent font-medium text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-slate-500">설정을 불러오는 중…</p>
        ) : loadError ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => void loadSettings()}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {activeTab === 'access' && (
              <section className="space-y-4" role="tabpanel">
                <PermissionRow
                  label="손님 :"
                  value={guestPermissions}
                  onToggle={(key) => togglePermission('guest', key)}
                />
                <PermissionRow
                  label="일반사용자 :"
                  value={loggedInPermissions}
                  onToggle={(key) => togglePermission('loggedIn', key)}
                />
                <p className="text-sm leading-relaxed text-slate-600">
                  체크된 권한만 해당 사용자에게 부여됩니다. 보기가 꺼져 있으면 폴더·파일 목록이
                  표시되지 않습니다. 읽기는 열기·다운로드, 쓰기는 새 폴더/파일·수정·삭제·휴지통 등
                  파일 조작 권한입니다(속성에서 비공개·공유·즐겨찾기 설정과 환경설정은
                  총괄관리자만 가능).
                </p>
                {saving ? <p className="text-sm text-slate-500">저장 중…</p> : null}
              </section>
            )}

            {activeTab === 'ip' && (
              <section className="space-y-4" role="tabpanel">
                <p className="text-sm leading-relaxed text-slate-600">
                  목록이 비어 있으면 모든 IP에서 접속할 수 있습니다. 항목을 추가하면 등록된
                  주소·대역·범위에서만 NAS4USB에 접속할 수 있습니다. 단일 IP, CIDR(
                  <code className="rounded bg-slate-100 px-1 text-[12px]">192.168.0.0/24</code>
                  ), 범위(
                  <code className="rounded bg-slate-100 px-1 text-[12px]">
                    221.168.1.0-221.168.12.255
                  </code>
                  ) 형식을 지원합니다. 서버 PC의{' '}
                  <code className="rounded bg-slate-100 px-1 text-[12px]">127.0.0.1</code> 은 항상
                  허용됩니다.
                </p>

                <ul className="space-y-3">
                  {allowedIpCidrs.length === 0 ? (
                    <li className="list-none rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                      등록된 허용 IP가 없습니다.
                    </li>
                  ) : (
                    allowedIpCidrs.map((entry) => (
                      <li
                        key={entry.cidr}
                        className="list-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 break-all font-mono text-sm font-semibold text-slate-800">
                            {entry.cidr}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void removeAllowedIp(entry.cidr)}
                          >
                            삭제
                          </button>
                        </div>
                        <label className="mt-2 flex items-center gap-2">
                          <span className="shrink-0 text-xs font-medium text-slate-500">설명</span>
                          <input
                            type="text"
                            className="min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-0 py-1 text-sm text-slate-800 outline-none focus:border-sky-500"
                            placeholder="예: 본사 사내망, VPN 대역"
                            value={entry.description ?? ''}
                            onChange={(event) =>
                              updateAllowedIpDescription(entry.cidr, event.target.value)
                            }
                          />
                        </label>
                      </li>
                    ))
                  )}
                </ul>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">허용 IP 주소</span>
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500"
                      placeholder="예: 192.168.0.0/24, 10.0.0.30, 221.168.1.0-221.168.12.255"
                      value={ipCidrDraft}
                      onChange={(event) => setIpCidrDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addAllowedIp();
                        }
                      }}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">설명 (선택)</span>
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500"
                      placeholder="예: 본사 사내망, VPN 대역"
                      value={ipDescriptionDraft}
                      onChange={(event) => setIpDescriptionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addAllowedIp();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void addAllowedIp()}
                  >
                    {saving ? '저장 중…' : 'IP 추가'}
                  </button>
                </div>
              </section>
            )}

            {activeTab === 'members' ? (
              <section role="tabpanel">
                <MembersSettingsPanel />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
