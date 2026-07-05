import { APP_NAME } from '../../../shared/constants.js';
import AppLogo from '../common/AppLogo.jsx';

export default function BrowserOnlyNotice({ error = null }) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-slate-100 px-6 text-center">
      <div className="w-full max-w-lg rounded-xl border border-nas-border bg-white p-8 shadow-sm">
        <div className="mb-4 flex justify-center">
          <AppLogo size={72} className="shadow-sm" />
        </div>
        <p className="text-lg font-semibold text-slate-800">
          {error ? `${APP_NAME} 서버에 연결할 수 없습니다` : `${APP_NAME} 서버가 필요합니다`}
        </p>
        {error ? (
          <p className="mt-3 text-sm leading-6 text-red-600">{error}</p>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-slate-600">
          브라우저에서도 {APP_NAME}를 사용할 수 있습니다. 먼저 PC에서{' '}
          <code className="rounded bg-slate-100 px-1">npm run dev</code> 또는 Electron 앱을 실행한 뒤,
          같은 주소(<code className="rounded bg-slate-100 px-1">http://호스트IP:3008</code>)로 접속하세요.
        </p>
        <ul className="mt-4 space-y-2 text-left text-sm text-slate-600">
          <li>• 파일 탐색·HWPX/XLSX 편집·실시간 협업 모두 브라우저에서 가능</li>
          <li>• LAN: 다른 PC 브라우저에서 <code className="rounded bg-slate-100 px-1">http://서버IP:3008</code></li>
          <li>• Electron 창과 브라우저 탭을 동시에 사용해도 Y.js로 동기화됩니다</li>
        </ul>
      </div>
    </div>
  );
}
