import { APP_NAME } from '../../../shared/constants.js';
import AppLogo from '../common/AppLogo.jsx';

/** @param {{ message?: string }} props */
export function ShareLinkLoading({ message = '공유 파일을 여는 중…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <AppLogo size={64} className="shadow-sm" />
      <p className="text-sm font-medium text-[#323130]">{message}</p>
      <p className="text-xs text-[#605e5c]">{APP_NAME}</p>
    </div>
  );
}

/** @param {{ message?: string }} props */
export function ShareLinkError({ message = '공유 링크를 열 수 없습니다.' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <AppLogo size={64} className="shadow-sm" />
      <p className="text-sm font-semibold text-[#323130]">공유 링크 오류</p>
      <p className="max-w-md text-sm text-[#605e5c]">{message}</p>
      <p className="text-xs text-[#a19f9d]">{APP_NAME}</p>
    </div>
  );
}
