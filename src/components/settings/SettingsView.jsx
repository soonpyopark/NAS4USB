import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_GUEST_PERMISSIONS,
  normalizeGuestPermissionsFromUi,
} from '../../../shared/guestPermissions.js';
import { isValidIpOrCidr, normalizeAllowedIpCidrs } from '../../../shared/ipCidrCore.js';
import {
  buildIpAllowlistPayload,
  ipAllowlistExportFilename,
  parseIpAllowlistPayload,
} from '../../../shared/ipAllowlistIo.js';
import { downloadTextFile, readFileAsText } from '../../lib/downloadTextFile.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import ViewerModal from '../editors/ViewerModal.jsx';
import GeneralSettingsPanel from './GeneralSettingsPanel.jsx';
import MembersSettingsPanel from './MembersSettingsPanel.jsx';
import ServerSettingsPanel from './ServerSettingsPanel.jsx';

/**
 * @typedef {{ cidr: string, description?: string }} AllowedIpEntry
 * @typedef {'general' | 'ip' | 'members' | 'server'} SettingsTabId
 */

/** @type {{ id: SettingsTabId, label: string }[]} */
const SETTINGS_TABS = [
  { id: 'general', label: '일반' },
  { id: 'server', label: '서버 관리' },
  { id: 'ip', label: '접근 가능 IP 대역' },
  { id: 'members', label: '회원 관리' },
];

export default function SettingsView({ onClose }) {
  const { alert: appAlert, confirm: appConfirm, dialog: settingsDialog } = useAppConfirm();
  /** @type {[AllowedIpEntry[], Function]} */
  const [allowedIpCidrs, setAllowedIpCidrs] = useState([]);
  const [shareLinksBypassIpAllowlist, setShareLinksBypassIpAllowlist] = useState(false);
  /** @type {[SettingsTabId, Function]} */
  const [activeTab, setActiveTab] = useState('general');
  const [ipCidrDraft, setIpCidrDraft] = useState('');
  const [ipDescriptionDraft, setIpDescriptionDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const descriptionSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const ipImportInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const applySettings = useCallback((settings) => {
    setAllowedIpCidrs(normalizeAllowedIpCidrs(settings?.allowedIpCidrs ?? []));
    setShareLinksBypassIpAllowlist(settings?.shareLinksBypassIpAllowlist === true);
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
   *   shareLinksBypassIpAllowlist?: boolean,
   * }} patch
   * @param {{ silent?: boolean }} [options]
   */
  const persistSettings = async (patch, { silent = true } = {}) => {
    setSaving(true);
    try {
      const current = await window.nas4usb.settings.get();
      const next = await window.nas4usb.settings.update({
        allowedIpCidrs: normalizeAllowedIpCidrs(patch.allowedIpCidrs ?? allowedIpCidrs),
        guestPermissions: normalizeGuestPermissionsFromUi(
          current?.guestPermissions ?? DEFAULT_GUEST_PERMISSIONS,
        ),
        loggedInPermissions: normalizeGuestPermissionsFromUi(
          current?.loggedInPermissions ?? DEFAULT_GUEST_PERMISSIONS,
        ),
        shareLinksBypassIpAllowlist:
          typeof patch.shareLinksBypassIpAllowlist === 'boolean'
            ? patch.shareLinksBypassIpAllowlist
            : shareLinksBypassIpAllowlist,
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

  const toggleShareLinksBypassIp = async () => {
    const next = !shareLinksBypassIpAllowlist;
    setShareLinksBypassIpAllowlist(next);
    const ok = await persistSettings({ shareLinksBypassIpAllowlist: next });
    if (!ok) setShareLinksBypassIpAllowlist(!next);
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

  const handleExportIp = () => {
    try {
      const payload = buildIpAllowlistPayload(allowedIpCidrs);
      downloadTextFile(
        ipAllowlistExportFilename(),
        `${JSON.stringify(payload, null, 2)}\n`,
      );
      void appAlert({
        title: '내보내기',
        body:
          allowedIpCidrs.length === 0
            ? '허용 IP가 비어 있는 목록을 내보냈습니다.'
            : `허용 IP ${allowedIpCidrs.length}건을 내보냈습니다.`,
      });
    } catch (error) {
      void appAlert({
        title: '내보내기',
        body: error instanceof Error ? error.message : '내보내기에 실패했습니다.',
      });
    }
  };

  const handleImportIp = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const { allowedIpCidrs: nextList } = parseIpAllowlistPayload(text);
      const ok = await appConfirm({
        title: '가져오기',
        body:
          nextList.length === 0
            ? `「${file.name}」의 허용 IP가 비어 있습니다.\n현재 목록을 모두 지울까요?`
            : `「${file.name}」에서 허용 IP ${nextList.length}건을 가져옵니다.\n현재 목록을 이 내용으로 바꿀까요?`,
        confirmLabel: '가져오기',
      });
      if (!ok) return;
      const saved = await persistSettings({ allowedIpCidrs: nextList });
      if (saved) {
        void appAlert({
          title: '가져오기',
          body:
            nextList.length === 0
              ? '허용 IP 목록을 비웠습니다.'
              : `허용 IP ${nextList.length}건을 가져왔습니다.`,
        });
      }
    } catch (error) {
      void appAlert({
        title: '가져오기',
        body: error instanceof Error ? error.message : '가져오기에 실패했습니다.',
      });
    }
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
    <ViewerModal title="환경설정" onClose={onClose} allowClose={Boolean(onClose)}>
      {settingsDialog}
      <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 pt-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="환경설정">
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
        {activeTab === 'general' ? (
          <div role="tabpanel">
            <GeneralSettingsPanel />
          </div>
        ) : null}

        {activeTab === 'server' ? (
          <div role="tabpanel">
            <ServerSettingsPanel />
          </div>
        ) : null}

        {activeTab === 'ip' ? (
          loading ? (
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
            <div className="space-y-6">
              <section className="space-y-4" role="tabpanel">
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-slate-600">
                    목록이 비어 있으면 모든 IP에서 접속할 수 있습니다. 항목을 추가하면 등록된
                    주소·대역·범위에서만 NAS4USB에 접속할 수 있습니다. 단일 IP, CIDR(
                    <code className="rounded bg-slate-100 px-1 text-[12px]">192.168.0.0/24</code>
                    ), 범위(
                    <code className="rounded bg-slate-100 px-1 text-[12px]">
                      221.168.1.0-221.168.12.255
                    </code>
                    ) 형식을 지원합니다. 서버 PC의{' '}
                    <code className="rounded bg-slate-100 px-1 text-[12px]">127.0.0.1</code> 은
                    항상 허용됩니다.
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
                      checked={shareLinksBypassIpAllowlist}
                      disabled={saving}
                      onChange={() => void toggleShareLinksBypassIp()}
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium text-slate-800">
                        공유링크는 허용 IP 밖에서도 접속 허용
                      </span>
                      <span className="block text-xs leading-relaxed text-slate-500">
                        켜면 유효한 공유링크(
                        <code className="rounded bg-slate-100 px-1">?share=…</code>
                        )를 가진 사용자만 IP 목록과 무관하게 접속할 수 있습니다. 일반
                        접속·로그인에는 허용 IP가 그대로 적용됩니다.
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={saving}
                      onClick={handleExportIp}
                    >
                      내보내기
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => ipImportInputRef.current?.click()}
                    >
                      가져오기
                    </button>
                    <input
                      ref={ipImportInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => void handleImportIp(event)}
                    />
                  </div>
                </div>

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
                            className="min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-0 py-1 text-sm text-slate-800 outline-none focus:border-nas-accent"
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-nas-accent"
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-nas-accent"
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
            </div>
          )
        ) : null}

        {activeTab === 'members' ? (
          <div>
            <MembersSettingsPanel />
          </div>
        ) : null}
      </div>
      </div>
    </ViewerModal>
  );
}
