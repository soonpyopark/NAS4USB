import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  defaultMemberPassword,
  memberRoleToLabel,
  normalizeMemberRole,
} from '../../../shared/members.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';

/**
 * @typedef {import('../../../shared/members.js').PublicMember} PublicMember
 * @typedef {import('../../../shared/members.js').MemberRole} MemberRole
 * @typedef {PublicMember & { password?: string, isNew?: boolean, markedDelete?: boolean }} MemberDraft
 * @typedef {'member-list' | 'member-add'} MembersSubTab
 */

/**
 * @param {PublicMember} member
 * @returns {MemberDraft}
 */
function createMemberDraft(member) {
  return { ...member, password: '', isNew: false, markedDelete: false };
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
    member.loginId.toLowerCase().includes(normalized)
  );
}

/**
 * @param {MemberDraft[]} draftMembers
 */
function buildPayloadFromDraft(draftMembers) {
  /** @type {Array<Record<string, unknown>>} */
  const memberPayload = [];
  for (const member of draftMembers) {
    if (member.markedDelete && !member.isNew) {
      memberPayload.push({
        id: member.id,
        loginId: member.loginId,
        displayName: member.displayName,
        role: member.role,
        active: member.active,
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
      });
    } else {
      memberPayload.push({
        id: member.id,
        loginId: member.loginId,
        displayName: member.displayName,
        role: member.role,
        active: member.active,
        ...(member.password ? { password: member.password } : {}),
      });
    }
  }
  return { members: memberPayload };
}

export default function MembersSettingsPanel() {
  const { confirm: appConfirm, alert: appAlert, dialog } = useAppConfirm();
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

  const applyMembers = useCallback((nextMembers) => {
    setMembers((Array.isArray(nextMembers) ? nextMembers : []).map(createMemberDraft));
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.nas4usb?.members?.list) {
        throw new Error('회원 관리 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
      }
      const result = await window.nas4usb.members.list();
      applyMembers(result?.members ?? []);
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
    setEditingMemberId(member.id);
    setMemberLoginId(member.loginId);
    setMemberRole(normalizeMemberRole(member.role));
    setMemberActive(member.active);
    setMemberPassword('');
    setTab('member-add');
  };

  /**
   * Persist draft immediately so members don't vanish when leaving the tab.
   * @param {MemberDraft[]} draftMembers
   * @param {{ silent?: boolean }} [options]
   */
  const persistMembers = async (draftMembers, { silent = false } = {}) => {
    setSaving(true);
    setError('');
    try {
      if (!window.nas4usb?.members?.save) {
        throw new Error('회원 관리 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
      }
      const result = await window.nas4usb.members.save(buildPayloadFromDraft(draftMembers));
      if (!result?.ok) {
        const message = result?.message || '회원 저장에 실패했습니다.';
        setError(message);
        setMembers(draftMembers);
        void appAlert({ title: '회원 관리', body: message });
        return false;
      }
      applyMembers(result.members ?? []);
      if (!silent) {
        void appAlert({ title: '회원 관리', body: '회원 설정을 저장했습니다.' });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '회원 저장에 실패했습니다.';
      setError(message);
      setMembers(draftMembers);
      void appAlert({ title: '회원 관리', body: message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleMemberSubmit = async () => {
    const loginId = memberLoginId.trim();
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
              loginId,
              displayName: loginId,
              role: memberRole,
              active: memberActive,
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
          password: memberPassword,
          isNew: true,
        },
      ];
    }

    setMembers(nextMembers);
    resetMemberForm();
    setTab('member-list');
    await persistMembers(nextMembers, { silent: true });
  };

  const markMemberDelete = async (member) => {
    const ok = await appConfirm({
      title: '회원 삭제',
      body: `「${member.loginId}」 회원이 삭제됩니다.`,
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
    await persistMembers(nextMembers, { silent: true });
  };

  return (
    <div className="space-y-4">
      {dialog}
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
                총 {visibleMembers.length}명
                {memberSearchQuery.trim() ? ` · 검색 결과 ${filteredMembers.length}명` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                className="h-8 w-52 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
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

          {filteredMembers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              표시할 회원이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
              {filteredMembers.map((member) => (
                <li
                  key={member.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                    editingMemberId === member.id ? 'bg-sky-50' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{member.displayName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {member.loginId} · {memberRoleToLabel(member.role)}
                      {!member.active ? ' · 비활성' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      disabled={saving}
                      onClick={() => startEditMember(member)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      disabled={saving}
                      onClick={() => void markMemberDelete(member)}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!loading && tab === 'member-add' ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            {editingMemberId ? '회원 수정' : '회원 추가'}
          </h3>
          <p className="text-xs text-slate-500">
            {editingMemberId
              ? '회원 수정 중'
              : '새 회원 추가 (표시 이름은 로그인 아이디와 동일하게 등록됩니다.)'}
          </p>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">로그인 아이디</span>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={memberLoginId}
                onChange={(event) => setMemberLoginId(event.target.value)}
                placeholder="로그인 아이디"
                autoComplete="off"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">역할</span>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
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
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 space-y-1">
                <span className="text-xs font-medium text-slate-600">비밀번호</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                  value={memberPassword}
                  onChange={(event) => setMemberPassword(event.target.value)}
                  placeholder={editingMemberId ? '비밀번호 (변경 시에만 입력)' : '비밀번호 (6자 이상)'}
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
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
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
