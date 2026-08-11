/**
 * Shown when the current user (guest or member) has no global view permission.
 */
export default function ViewAccessDeniedPanel({ isLoggedIn, onLogin }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
          <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9zm3 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
        </svg>
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-base font-semibold text-slate-800">보기 권한이 없습니다</h2>
        {isLoggedIn ? (
          <p className="text-sm leading-relaxed text-slate-500">
            현재 계정으로는 파일·폴더를 볼 수 없습니다. 관리자에게 보기 권한을 요청해 주세요.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-500">
            손님 계정에는 보기 권한이 없어 목록이 비어 있습니다. 회원으로 로그인하면 이용할 수
            있습니다.
          </p>
        )}
      </div>
      {!isLoggedIn && onLogin ? (
        <button
          type="button"
          onClick={onLogin}
          className="h-9 rounded-md bg-nas-accent px-4 text-sm font-medium text-white transition-colors hover:bg-nas-accentHover"
        >
          로그인
        </button>
      ) : null}
    </div>
  );
}
