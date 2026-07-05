import { useState } from 'react';
import { useAdminAuth } from '../../hooks/useAdminAuth.js';

function EyeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a18.45 18.45 0 0 1-2.16 3.19" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.61 6.61A18.45 18.45 0 0 0 2 12s3 7 10 7a9.86 9.86 0 0 0 4.39-1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m2 2 20 20" />
    </svg>
  );
}

export default function AdminLoginForm() {
  const { adminId, isLoggedIn, login, logout, loggingIn, error, clearError } = useAdminAuth();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const ok = await login(id, password);
    if (ok) {
      setPassword('');
    }
  };

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10pt] font-medium text-slate-600">
          {adminId}
        </span>
        <button
          type="button"
          className="h-8 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-blue-600"
          onClick={logout}
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <form className="flex items-center gap-1.5" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="admin-id">
        아이디
      </label>
      <input
        id="admin-id"
        type="text"
        value={id}
        onChange={(event) => {
          clearError();
          setId(event.target.value);
        }}
        placeholder="아이디"
        autoComplete="username"
        disabled={loggingIn}
        className="h-8 w-24 rounded-md border border-nas-border bg-white px-2 text-[10pt] text-slate-700 outline-none placeholder:text-slate-400 focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:opacity-60"
      />

      <div className="relative">
        <label className="sr-only" htmlFor="admin-password">
          비밀번호
        </label>
        <input
          id="admin-password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => {
            clearError();
            setPassword(event.target.value);
          }}
          placeholder="비밀번호"
          autoComplete="current-password"
          disabled={loggingIn}
          className="h-8 w-28 rounded-md border border-nas-border bg-white py-0 pl-2 pr-7 text-[10pt] text-slate-700 outline-none placeholder:text-slate-400 focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:opacity-60"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-slate-400 hover:text-slate-600"
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
        </button>
      </div>

      <button
        type="submit"
        disabled={loggingIn || !id.trim() || !password}
        className="h-8 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loggingIn ? '…' : '로그인'}
      </button>

      {error && (
        <span className="max-w-[10rem] truncate text-[10pt] text-red-600" title={error}>
          {error}
        </span>
      )}
    </form>
  );
}
