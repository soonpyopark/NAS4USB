import { useState } from 'react';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';

const HELP_ROWS = [
  { input: '띄어쓰기', meaning: '모두 포함 (AND)', example: '편제 코드' },
  { input: '|', meaning: '둘 중 하나 (OR)', example: '편제 | 정원' },
  { input: '!', meaning: '제외 (NOT)', example: '편제 !폐지' },
  { input: '"..."', meaning: '연속 문구', example: '"편제 코드"' },
  { input: '*  ?', meaning: '와일드카드', example: '하반기*코드' },
  { input: 'file:', meaning: '파일명', example: 'file:보고 편제' },
  { input: 'path:', meaning: '폴더 경로', example: 'path:인사 편제' },
  { input: 'loc:', meaning: '위치(시트·쪽·문단)', example: 'loc:C5 편제' },
  { input: 'ext:', meaning: '확장자', example: 'ext:xlsx 편제' },
  { input: '( )', meaning: '묶기', example: '(편제 | 정원) !폐지' },
];

function formatBuiltAt(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}. ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatScope(label, scope) {
  const folders = Number(scope?.folderCount ?? 0).toLocaleString();
  const files = Number(scope?.fileCount ?? 0).toLocaleString();
  return `${label}(폴더 ${folders}개, 파일 ${files}개)`;
}

export default function PersonalDocIndexBar({
  status,
  error,
  variant = 'dark',
  onReindex,
  onStop,
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const running = status?.status === 'running';
  const progress = status?.progress;
  const isDark = variant === 'dark';
  const builtAt = formatBuiltAt(status?.builtAt || status?.job?.updatedAt || status?.job?.startedAt);
  const buttonClass =
    'h-8 shrink-0 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-nas-accentHover';
  const helpButtonClass = isDark
    ? 'h-8 shrink-0 rounded-md border border-slate-600 px-2.5 text-[10pt] font-medium text-slate-200 hover:bg-slate-700'
    : 'h-8 shrink-0 rounded-md border border-nas-accentBorder bg-white px-2.5 text-[10pt] font-medium text-nas-accentText hover:bg-white';

  const summary = [
    formatScope('공유폴더', status?.scopes?.share),
    formatScope('개인폴더', status?.scopes?.personal),
    builtAt ? `생성일시(${builtAt})` : null,
    status?.errorCount ? `실패 ${Number(status.errorCount).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <div
      className={
        isDark
          ? 'flex items-center gap-1 border-b border-slate-700 px-2 py-1.5 text-[10pt] text-slate-400'
          : 'flex items-center gap-2 rounded-md border border-nas-accentBorder bg-nas-accentSoft px-3 py-1.5 text-xs text-nas-accentText'
      }
    >
      <span className="min-w-0 flex-1 truncate">
        {error
          ? error
          : running
            ? `인덱싱 중 ${progress?.current ?? 0}/${progress?.total ?? 0}${
                progress?.fileName ? ` · ${progress.fileName}` : ''
              }`
            : summary}
      </span>
      {running ? (
        <button type="button" className={buttonClass} onClick={onStop}>
          중지
        </button>
      ) : (
        <button type="button" className={buttonClass} onClick={() => onReindex({ reset: true })}>
          색인 생성
        </button>
      )}
      <button
        type="button"
        className={helpButtonClass}
        onClick={() => setHelpOpen(true)}
        title="본문 색인 검색 문법"
      >
        도움말
      </button>

      <AppModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="검색 도움말"
        wide
        raised
        showCloseButton
      >
        <AppModalBody>
          <p>
            Everything처럼 조건을 조합할 수 있습니다. 접두사가 없으면 <strong>내용</strong>을
            찾습니다. 탐색기 본문 검색과 편집기에서 파일을 열 때 같은 문법을 씁니다. 결과를 열면
            쪽·셀·문단으로 이동합니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-[#323130]">
              <thead>
                <tr className="border-b border-[#e1dfdd] text-xs text-[#605e5c]">
                  <th className="py-2 pr-3 font-semibold">입력</th>
                  <th className="py-2 pr-3 font-semibold">의미</th>
                  <th className="py-2 font-semibold">예</th>
                </tr>
              </thead>
              <tbody>
                {HELP_ROWS.map((row) => (
                  <tr key={row.input} className="border-b border-[#f3f2f1]">
                    <td className="py-2 pr-3 align-top">
                      <code className="rounded bg-[#f3f2f1] px-1 py-0.5 text-[13px]">{row.input}</code>
                    </td>
                    <td className="py-2 pr-3 align-top">{row.meaning}</td>
                    <td className="py-2 align-top">
                      <code className="rounded bg-[#f3f2f1] px-1 py-0.5 text-[13px]">{row.example}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs">
            <code className="rounded bg-[#f3f2f1] px-1">name:</code>은{' '}
            <code className="rounded bg-[#f3f2f1] px-1">file:</code>과 같습니다. 공백으로 나눈
            단어는 같은 문단·셀에서 모두 있어야 하고, 연속 문구는{' '}
            <code className="rounded bg-[#f3f2f1] px-1">&quot;사용자 지원&quot;</code>처럼
            따옴표로 감쌉니다. 색인 대상은 Excel·한글·Word·슬라이드·PDF·TipTap·텍스트·Markdown·HTML·SQL입니다.
          </p>
        </AppModalBody>
        <AppModalActions>
          <AppModalButton variant="primary" onClick={() => setHelpOpen(false)}>
            닫기
          </AppModalButton>
        </AppModalActions>
      </AppModal>
    </div>
  );
}
