import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GUEST_PERMISSIONS,
  normalizeAccessPermissionsFromUi,
} from '../../../shared/guestPermissions.js';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  GUEST_MEMBER_ID,
  defaultMemberPassword,
  isBootstrapAdminMember,
  isGuestMemberId,
  memberRoleToLabel,
  normalizeMemberPermissionsFromUi,
  normalizeMemberRole,
} from '../../../shared/members.js';
import {
  buildMembersExportPayload,
  membersExportFilename,
  parseMembersExportPayload,
} from '../../../shared/membersIo.js';
import { downloadTextFile, readFileAsText } from '../../lib/downloadTextFile.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { useFsSync } from '../../context/FsSyncContext.jsx';

/**
 * @typedef {import('../../../shared/members.js').PublicMember} PublicMember
 * @typedef {import('../../../shared/members.js').MemberRole} MemberRole
 * @typedef {import('../../../shared/members.js').MemberAccessPermissions} MemberAccessPermissions
 * @typedef {PublicMember & {
 *   password?: string,
 *   isNew?: boolean,
 *   markedDelete?: boolean,
 *   isGuestRow?: boolean,
 * }} MemberDraft
 * @typedef {'member-list' | 'member-add'} MembersSubTab
 */

/**
 * @param {PublicMember} member
 * @returns {MemberDraft}
 */
function createMemberDraft(member) {
  return {
    ...member,
    permissions: normalizeMemberPermissionsFromUi(
      member.permissions ?? DEFAULT_MEMBER_PERMISSIONS,
    ),
    password: '',
    isNew: false,
    markedDelete: false,
  };
}

/**
 * @param {MemberAccessPermissions} permissions
 * @returns {MemberDraft}
 */
function createGuestDraft(permissions) {
  return {
    id: GUEST_MEMBER_ID,
    loginId: 'guest',
    displayName: '손님(Guest)',
    role: 'member',
    active: true,
    permissions: normalizeMemberPermissionsFromUi(permissions),
    isGuestRow: true,
    password: '',
    isNew: false,
    markedDelete: false,
  };
}

/**
 * @param {MemberDraft} member
 * @param {string} query
 */
function matchesMemberSearch(member, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    member.displayName.toLowerCase().includes(normalized) ||
    member.loginId.toLowerCase().includes(normalized) ||
    (member.isGuestRow && 'guest 손님'.includes(normalized))
  );
}

/**
 * @param {MemberDraft[]} draftMembers
 */
/**
 * @param {MemberDraft} member
 * @returns {MemberAccessPermissions}
 */
function permissionsPayload(member) {
  const flags = normalizeMemberPermissionsFromUi(
    member.permissions ?? DEFAULT_MEMBER_PERMISSIONS,
  );
  return {
    view: Boolean(flags.view),
    read: Boolean(flags.read),
    write: Boolean(flags.write),
  };
}

function buildPayloadFromDraft(draftMembers) {
  /** @type {Array<Record<string, unknown>>} */
  const memberPayload = [];
  for (const member of draftMembers) {
    if (member.isGuestRow) continue;
    if (member.markedDelete && !member.isNew) {
      memberPayload.push({
        id: member.id,
        loginId: member.loginId,
        displayName: member.displayName,
        role: member.role,
        active: member.active,
        permissions: permissionsPayload(member),
        _delete: true,
      });
      continue;
    }
    if (member.markedDelete) continue;
    if (member.isNew) {
      memberPayload.push({
        loginId: member.loginId,
        displayName: member.displayName,
        role: member.role,
        active: member.active,
        password: member.password,
        permissions: permissionsPayload(member),
      });
    } else {
      memberPayload.push({
        id: member.id,
        loginId: member.loginId,
        displayName: member.displayName,
        role: member.role,
        active: Boolean(member.active),
        permissions: permissionsPayload(member),
        ...(member.password ? { password: member.password } : {}),
      });
    }
  }
  return { members: memberPayload };
}

/**
 * @param {{
 *   value: MemberAccessPermissions,
 *   disabled?: boolean,
 *   onToggle: (key: 'view' | 'read' | 'write') => void,
 * }} props
 */
function PermissionChecks({ value, disabled = false, onToggle }) {
  return (
    <div className="flex w-[11.5rem] shrink-0 items-center justify-end gap-x-3 text-xs text-slate-700">
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300 accent-nas-accent"
          checked={value.view}
          disabled={disabled}
          onChange={() => onToggle('view')}
        />
        <span>보기</span>
      </label>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300 accent-nas-accent"
          checked={value.read}
          disabled={disabled || !value.view}
          onChange={() => onToggle('read')}
        />
        <span className={!value.view ? 'text-slate-400' : undefined}>읽기</span>
      </label>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300 accent-nas-accent"
          checked={value.write}
          disabled={disabled || !value.view}
          onChange={() => onToggle('write')}
        />
        <span className={!value.view ? 'text-slate-400' : undefined}>쓰기</span>
      </label>
    </div>
  );
}

export default function MembersSettingsPanel() {
  const { confirm: appConfirm, alert: appAlert, dialog } = useAppConfirm();
  const { notifyLocalChange } = useFsSync();
  /** @type {[MembersSubTab, Function]} */
  const [tab, setTab] = useState('member-list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** @type {[MemberDraft[], Function]} */
  const [members, setMembers] = useState([]);
  const [editingMemberId, setEditingMemberId] = useState(/** @type {string | null} */ (null));
  const [memberLoginId, setMemberLoginId] = useState('');
  /** @type {[MemberRole, Function]} */
  const [memberRole, setMemberRole] = useState('member');
  const [memberActive, setMemberActive] = useState(true);
  const [memberPassword, setMemberPassword] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const membersImportInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [loginLockoutEnabled, setLoginLockoutEnabled] = useState(false);

  const applyMembers = useCallback((nextMembers, guestPermissions) => {
    const drafts = (Array.isArray(nextMembers) ? nextMembers : []).map(createMemberDraft);
    const withoutGuest = drafts.filter((member) => !isGuestMemberId(member.id));
    const bootstrapIndex = withoutGuest.findIndex((member) => isBootstrapAdminMember(member));
    const guestDraft = createGuestDraft(guestPermissions ?? DEFAULT_GUEST_PERMISSIONS);
    if (bootstrapIndex >= 0) {
      withoutGuest.splice(bootstrapIndex + 1, 0, guestDraft);
    } else {
      withoutGuest.unshift(guestDraft);
    }
    setMembers(withoutGuest);
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.nas4usb?.members?.list) {
        throw new Error('회원 관리 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
      }
      const [result, settings] = await Promise.all([
        window.nas4usb.members.list(),
        window.nas4usb.settings.get(),
      ]);
      applyMembers(result?.members ?? [], settings?.guestPermissions);
      setLoginLockoutEnabled(settings?.loginLockoutEnabled === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [applyMembers]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const visibleMembers = members.filter((member) => !member.markedDelete);
  const filteredMembers = useMemo(
    () => visibleMembers.filter((member) => matchesMemberSearch(member, memberSearchQuery)),
    [visibleMembers, memberSearchQuery],
  );

  const editingMember = editingMemberId
    ? members.find((member) => member.id === editingMemberId) ?? null
    : null;
  const editingBootstrapAdmin = isBootstrapAdminMember(editingMember);
  const editingGuest = Boolean(editingMember?.isGuestRow);

  const resetMemberForm = () => {
    setEditingMemberId(null);
    setMemberLoginId('');
    setMemberRole('member');
    setMemberActive(true);
    setMemberPassword('');
  };

  const openMemberAddTab = () => {
    resetMemberForm();
    setTab('member-add');
  };

  const startEditMember = (member) => {
    if (member.isGuestRow) return;
    setEditingMemberId(member.id);
    setMemberLoginId(member.loginId);
    setMemberRole(normalizeMemberRole(member.role));
    setMemberActive(member.active);
    setMemberPassword('');
    setTab('member-add');
  };

  /**
   * @param {MemberDraft[]} draftMembers
   */
  const persistGuestPermissions = async (draftMembers) => {
    const guest = draftMembers.find((member) => member.isGuestRow);
    if (!guest || !window.nas4usb?.settings?.update) return true;
    const current = await window.nas4usb.settings.get();
    await window.nas4usb.settings.update({
      allowedIpCidrs: current?.allowedIpCidrs ?? [],
      guestPermissions: normalizeAccessPermissionsFromUi(guest.permissions),
      loggedInPermissions: normalizeAccessPermissionsFromUi(
        current?.loggedInPermissions ?? DEFAULT_MEMBER_PERMISSIONS,
      ),
      loginLockoutEnabled,
    });
    return true;
  };

  /**
   * @param {boolean} enabled
   */
  const persistLoginLockout = async (enabled) => {
    if (!window.nas4usb?.settings?.update) return;
    const previous = loginLockoutEnabled;
    setLoginLockoutEnabled(enabled);
    try {
      await window.nas4usb.settings.update({ loginLockoutEnabled: enabled });
    } catch (err) {
      setLoginLockoutEnabled(previous);
      const message = err instanceof Error ? err.message : '로그인 제한 설정을 저장하지 못했습니다.';
      setError(message);
      void appAlert({ title: '회원 관리', body: message });
    }
  };

  /**
   * @param {MemberDraft[]} draftMembers
   * @param {{ silent?: boolean, includeGuest?: boolean }} [options]
   */
  const persistMembers = async (
    draftMembers,
    { silent = false, includeGuest = false } = {},
  ) => {
    setSaving(true);
    setError('');
    try {
      if (!window.nas4usb?.members?.save) {
        throw new Error('회원 관리 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
      }
      if (includeGuest) {
        await persistGuestPermissions(draftMembers);
      }

      const result = await window.nas4usb.members.save(buildPayloadFromDraft(draftMembers));
      if (!result?.ok) {
        const message = result?.message || '회원 저장에 실패했습니다.';
        setError(message);
        void appAlert({ title: '회원 관리', body: message });
        await loadMembers();
        return false;
      }

      let guestPermissions = draftMembers.find((member) => member.isGuestRow)?.permissions;
      try {
        const settings = await window.nas4usb.settings.get();
        guestPermissions = settings?.guestPermissions ?? guestPermissions;
      } catch {
        // keep draft guest permissions when settings reload fails
      }
      applyMembers(result.members ?? [], guestPermissions);
      notifyLocalChange('members-settings');
      if (!silent) {
        void appAlert({ title: '회원 관리', body: '회원 설정을 저장했습니다.' });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '회원 저장에 실패했습니다.';
      setError(message);
      void appAlert({ title: '회원 관리', body: message });
      await loadMembers();
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * @param {MemberAccessPermissions} flags
   * @param {'view' | 'read' | 'write'} key
   */
  const nextPermissionFlags = (flags, key) => {
    const nextValue = !flags[key];
    if (key === 'view' && !nextValue) {
      return { view: false, read: false, write: false };
    }
    return normalizeMemberPermissionsFromUi({
      ...flags,
      [key]: nextValue,
    });
  };

  /**
   * @param {string} memberId
   * @param {'view' | 'read' | 'write'} key
   */
  const toggleMemberPermission = async (memberId, key) => {
    if (saving) return;
    const current = members.find((member) => member.id === memberId);
    if (!current) return;
    const flags = current.permissions ?? { ...DEFAULT_MEMBER_PERMISSIONS };
    const normalized = nextPermissionFlags(flags, key);
    const nextMembers = members.map((member) =>
      member.id === memberId ? { ...member, permissions: normalized } : member,
    );
    setMembers(nextMembers);

    if (current.isGuestRow) {
      setSaving(true);
      setError('');
      try {
        await persistGuestPermissions(nextMembers);
        notifyLocalChange('members-settings');
      } catch (err) {
        const message = err instanceof Error ? err.message : '손님 권한 저장에 실패했습니다.';
        setError(message);
        void appAlert({ title: '회원 관리', body: message });
        await loadMembers();
      } finally {
        setSaving(false);
      }
      return;
    }

    await persistMembers(nextMembers, { silent: true, includeGuest: false });
  };

  const handleMemberSubmit = async () => {
    if (editingGuest) return;
    const loginId = (
      editingBootstrapAdmin ? editingMember?.loginId ?? memberLoginId : memberLoginId
    ).trim();
    if (!loginId) {
      void appAlert({ title: '회원 관리', body: '로그인 아이디를 입력해 주세요.' });
      return;
    }
    if (!editingMemberId && memberPassword.trim().length < 6) {
      void appAlert({ title: '회원 관리', body: '비밀번호는 6자 이상이어야 합니다.' });
      return;
    }
    if (editingMemberId && memberPassword.trim() && memberPassword.trim().length < 6) {
      void appAlert({ title: '회원 관리', body: '비밀번호는 6자 이상이어야 합니다.' });
      return;
    }

    const duplicate = members.some(
      (member) =>
        !member.markedDelete &&
        !member.isGuestRow &&
        member.id !== editingMemberId &&
        member.loginId.toLowerCase() === loginId.toLowerCase(),
    );
    if (duplicate) {
      void appAlert({ title: '회원 관리', body: `아이디 「${loginId}」가 이미 사용 중입니다.` });
      return;
    }

    /** @type {MemberDraft[]} */
    let nextMembers;
    if (editingMemberId) {
      nextMembers = members.map((member) =>
        member.id === editingMemberId
          ? {
              ...member,
              loginId: editingBootstrapAdmin ? member.loginId : loginId,
              displayName: editingBootstrapAdmin
                ? member.displayName || member.loginId
                : loginId,
              role: editingBootstrapAdmin ? 'super_admin' : memberRole,
              active: editingBootstrapAdmin ? true : memberActive,
              password: memberPassword,
            }
          : member,
      );
    } else {
      nextMembers = [
        ...members,
        {
          id: `new-member-${Date.now()}`,
          loginId,
          displayName: loginId,
          role: memberRole,
          active: memberActive,
          permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
          password: memberPassword,
          isNew: true,
        },
      ];
    }

    setMembers(nextMembers);
    resetMemberForm();
    setTab('member-list');
    await persistMembers(nextMembers, { silent: true, includeGuest: false });
  };

  const markMemberDelete = async (member) => {
    if (member.isGuestRow) {
      void appAlert({ title: '회원 관리', body: '손님(Guest) 항목은 삭제할 수 없습니다.' });
      return;
    }
    if (isBootstrapAdminMember(member)) {
      void appAlert({
        title: '회원 관리',
        body: '기본 관리자(admin) 계정은 삭제할 수 없습니다.',
      });
      return;
    }

    const ok = await appConfirm({
      title: '회원 삭제',
      body:
        `「${member.loginId}」 회원이 삭제됩니다.\n\n` +
        `이 회원의 개인폴더와 그 안의 파일·하위 폴더도 모두 영구 삭제되며, 복구할 수 없습니다.`,
      confirmLabel: '삭제',
      confirmVariant: 'danger',
    });
    if (!ok) return;

    /** @type {MemberDraft[]} */
    const nextMembers = member.isNew
      ? members.filter((entry) => entry.id !== member.id)
      : members.map((entry) =>
          entry.id === member.id ? { ...entry, markedDelete: true } : entry,
        );

    if (editingMemberId === member.id) resetMemberForm();
    setMembers(nextMembers);
    await persistMembers(nextMembers, { silent: true, includeGuest: false });
  };

  const handleExportMembers = async () => {
    try {
      if (!window.nas4usb?.members?.export) {
        throw new Error('회원 내보내기 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
      }
      const bundle = await window.nas4usb.members.export();
      const payload = buildMembersExportPayload({
        members: bundle?.members ?? [],
        guestPermissions: bundle?.guestPermissions,
      });
      downloadTextFile(membersExportFilename(), `${JSON.stringify(payload, null, 2)}\n`);
      const count = payload.members.length;
      void appAlert({
        title: '내보내기',
        body: `회원 ${count}명과 손님 권한을 내보냈습니다.`,
      });
    } catch (err) {
      void appAlert({
        title: '내보내기',
        body: err instanceof Error ? err.message : '내보내기에 실패했습니다.',
      });
    }
  };

  const handleImportMembers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const parsed = parseMembersExportPayload(text);
      const ok = await appConfirm({
        title: '가져오기',
        body:
          `「${file.name}」에서 회원 ${parsed.members.length}명을 가져옵니다.\n` +
          `현재 회원 목록을 이 내용으로 바꾸고, 손님 권한도 함께 적용할까요?\n` +
          `(파일에 없는 일반 회원은 삭제됩니다. 기본 관리자는 유지됩니다.)\n\n` +
          `삭제되는 회원의 개인폴더와 그 안의 파일·하위 폴더도 모두 영구 삭제되며, 복구할 수 없습니다.\n` +
          `회원 목록에 없는 개인폴더(고아 폴더)도 함께 삭제됩니다.`,
        confirmLabel: '가져오기',
      });
      if (!ok) return;

      setSaving(true);
      setError('');

      const current = await window.nas4usb.members.list();
      const currentMembers = Array.isArray(current?.members) ? current.members : [];
      const settings = await window.nas4usb.settings.get();

      await window.nas4usb.settings.update({
        allowedIpCidrs: settings?.allowedIpCidrs ?? [],
        guestPermissions: normalizeAccessPermissionsFromUi(parsed.guestPermissions),
        loggedInPermissions: normalizeAccessPermissionsFromUi(
          settings?.loggedInPermissions ?? DEFAULT_MEMBER_PERMISSIONS,
        ),
        loginLockoutEnabled: settings?.loginLockoutEnabled === true,
      });

      /** @type {Array<Record<string, unknown>>} */
      const memberPayload = [];
      const importByLogin = new Map(
        parsed.members.map((member) => [member.loginId.toLowerCase(), member]),
      );

      for (const member of currentMembers) {
        if (isBootstrapAdminMember(member)) continue;
        if (!importByLogin.has(member.loginId.toLowerCase())) {
          memberPayload.push({
            id: member.id,
            loginId: member.loginId,
            displayName: member.displayName,
            role: member.role,
            active: member.active,
            permissions: member.permissions,
            _delete: true,
          });
        }
      }

      for (const item of parsed.members) {
        const existing = currentMembers.find(
          (member) =>
            member.loginId.toLowerCase() === item.loginId.toLowerCase() ||
            (item.isBootstrapAdmin && isBootstrapAdminMember(member)),
        );
        if (existing) {
          memberPayload.push({
            id: existing.id,
            loginId: isBootstrapAdminMember(existing) ? existing.loginId : item.loginId,
            displayName: isBootstrapAdminMember(existing)
              ? existing.displayName || existing.loginId
              : item.displayName || item.loginId,
            role: isBootstrapAdminMember(existing) ? 'super_admin' : item.role,
            active: isBootstrapAdminMember(existing) ? true : item.active !== false,
            permissions: item.permissions,
            ...(item.passwordHash ? { passwordHash: item.passwordHash } : {}),
            ...(item.password ? { password: item.password } : {}),
          });
        } else if (!item.isBootstrapAdmin) {
          memberPayload.push({
            loginId: item.loginId,
            displayName: item.displayName || item.loginId,
            role: item.role,
            active: item.active !== false,
            permissions: item.permissions,
            ...(item.passwordHash
              ? { passwordHash: item.passwordHash }
              : { password: item.password || defaultMemberPassword(item.loginId) }),
          });
        }
      }

      const result = await window.nas4usb.members.save({ members: memberPayload });
      if (!result?.ok) {
        throw new Error(result?.message || '회원 가져오기에 실패했습니다.');
      }

      const nextSettings = await window.nas4usb.settings.get();
      applyMembers(result.members ?? [], nextSettings?.guestPermissions);
      notifyLocalChange('members-settings');
      resetMemberForm();
      setTab('member-list');
      void appAlert({
        title: '가져오기',
        body: `회원 ${parsed.members.length}명과 손님 권한을 가져왔습니다.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '가져오기에 실패했습니다.';
      setError(message);
      void appAlert({ title: '가져오기', body: message });
      await loadMembers();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {dialog}
      <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-nas-accent"
            checked={loginLockoutEnabled}
            disabled={loading || saving}
            onChange={(event) => void persistLoginLockout(event.target.checked)}
          />
          로그인 3회 실패 시 5분간 제한
        </label>
        <p className="mt-1 pl-6 text-xs text-slate-500">
          같은 아이디로 비밀번호를 3번 틀리면 5분간 로그인을 막습니다. 서버 PC(127.0.0.1)는
          제한되지 않습니다.
        </p>
      </section>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-600">
          회원별로 공유폴더의 보기·읽기·쓰기 권한을 설정합니다. 외부폴더는 총괄관리자에게만 보이며
          이 권한과 무관합니다. 기본 관리자 아래의 손님(Guest)은 로그인하지 않은 사용자 권한입니다.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading || saving}
            onClick={() => void handleExportMembers()}
          >
            내보내기
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading || saving}
            onClick={() => membersImportInputRef.current?.click()}
          >
            가져오기
          </button>
          <input
            ref={membersImportInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportMembers(event)}
          />
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="회원 관리">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'member-list'}
          className={`-mb-px rounded-t-md px-3 py-2 text-sm ${
            tab === 'member-list'
              ? 'border border-b-white border-slate-200 bg-white font-semibold text-slate-900'
              : 'border border-transparent font-medium text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setTab('member-list')}
        >
          회원목록
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'member-add'}
          className={`-mb-px rounded-t-md px-3 py-2 text-sm ${
            tab === 'member-add'
              ? 'border border-b-white border-slate-200 bg-white font-semibold text-slate-900'
              : 'border border-transparent font-medium text-slate-500 hover:text-slate-800'
          }`}
          onClick={openMemberAddTab}
        >
          회원추가
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">회원 목록을 불러오는 중…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">저장 중…</p> : null}

      {!loading && tab === 'member-list' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">회원 목록</h3>
              <p className="text-xs text-slate-500">
                총 {visibleMembers.filter((member) => !member.isGuestRow).length}명
                {memberSearchQuery.trim() ? ` · 검색 결과 ${filteredMembers.length}명` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                className="h-8 w-52 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-nas-accent"
                value={memberSearchQuery}
                onChange={(event) => setMemberSearchQuery(event.target.value)}
                placeholder="회원 이름·아이디 검색"
                aria-label="회원 검색"
              />
              {memberSearchQuery ? (
                <button
                  type="button"
                  className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50"
                  onClick={() => setMemberSearchQuery('')}
                >
                  검색 초기화
                </button>
              ) : null}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            공유폴더 기준입니다. 보기가 꺼져 있으면 목록이 비고, 읽기는 열기·다운로드, 쓰기는
            생성·수정·삭제·휴지통 권한입니다. 개인폴더는 본인만, 외부폴더는 총괄관리자만 이용합니다.
          </p>

          {filteredMembers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              표시할 회원이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
              {filteredMembers.map((member) => {
                const bootstrapAdmin = isBootstrapAdminMember(member);
                const guestRow = Boolean(member.isGuestRow);
                return (
                  <li
                    key={member.id}
                    className={`grid grid-cols-[minmax(0,1fr)_7.5rem_11.5rem] items-center gap-x-3 px-3 py-2.5 ${
                      editingMemberId === member.id
                        ? 'bg-nas-accentSoft'
                        : guestRow
                          ? 'bg-slate-50'
                          : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {member.displayName}
                        {bootstrapAdmin ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            (기본 관리자)
                          </span>
                        ) : null}
                        {guestRow ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            (로그인 안 함)
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {guestRow
                          ? 'guest · 손님'
                          : `${member.loginId} · ${memberRoleToLabel(member.role)}${
                              !member.active ? ' · 비활성' : ''
                            }`}
                      </p>
                    </div>

                    <div className="flex h-7 items-center justify-end gap-1.5">
                      {guestRow ? null : (
                        <>
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            disabled={saving}
                            onClick={() => startEditMember(member)}
                          >
                            수정
                          </button>
                          {bootstrapAdmin ? null : (
                            <button
                              type="button"
                              className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              disabled={saving}
                              onClick={() => void markMemberDelete(member)}
                            >
                              삭제
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <PermissionChecks
                      value={member.permissions ?? DEFAULT_MEMBER_PERMISSIONS}
                      disabled={saving}
                      onToggle={(key) => void toggleMemberPermission(member.id, key)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {!loading && tab === 'member-add' ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            {editingMemberId
              ? editingBootstrapAdmin
                ? '기본 관리자 수정'
                : '회원 수정'
              : '회원 추가'}
          </h3>
          <p className="text-xs text-slate-500">
            {editingBootstrapAdmin
              ? '기본 관리자 비밀번호를 변경할 수 있습니다. 변경한 비밀번호가 .env 설정보다 우선합니다.'
              : editingMemberId
                ? '회원 정보를 수정합니다. 비밀번호는 변경할 때만 입력하세요.'
                : '새 회원 추가 (표시 이름은 로그인 아이디와 동일하게 등록됩니다.)'}
          </p>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">로그인 아이디</span>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-nas-accent disabled:bg-slate-100 disabled:text-slate-500"
                value={memberLoginId}
                onChange={(event) => setMemberLoginId(event.target.value)}
                placeholder="로그인 아이디"
                autoComplete="off"
                disabled={editingBootstrapAdmin}
              />
            </label>
            {editingBootstrapAdmin ? null : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600">역할</span>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-nas-accent"
                    value={memberRole}
                    onChange={(event) =>
                      setMemberRole(event.target.value === 'super_admin' ? 'super_admin' : 'member')
                    }
                  >
                    <option value="member">일반사용자</option>
                    <option value="super_admin">총괄관리자</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={memberActive}
                    onChange={(event) => setMemberActive(event.target.checked)}
                  />
                  활성 계정
                </label>
              </>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 space-y-1">
                <span className="text-xs font-medium text-slate-600">비밀번호</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-nas-accent"
                  value={memberPassword}
                  onChange={(event) => setMemberPassword(event.target.value)}
                  placeholder={
                    editingMemberId ? '비밀번호 (변경 시에만 입력)' : '비밀번호 (6자 이상)'
                  }
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="h-[38px] rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMemberPassword(defaultMemberPassword(memberLoginId))}
              >
                초기 비밀번호 설정
              </button>
            </div>
            <div className="flex justify-end gap-2">
              {editingMemberId ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  disabled={saving}
                  onClick={() => {
                    resetMemberForm();
                    setTab('member-list');
                  }}
                >
                  취소
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-nas-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-nas-accentHover disabled:opacity-50"
                disabled={saving}
                onClick={() => void handleMemberSubmit()}
              >
                {saving ? '저장 중…' : editingMemberId ? '적용' : '회원 추가'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
