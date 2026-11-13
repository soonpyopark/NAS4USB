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

function HelpCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="block">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        fill="currentColor"
        d="M7.85 7.55c.18-.95.95-1.7 2.2-1.7 1.2 0 2.1.7 2.1 1.75 0 .85-.45 1.3-1.25 1.75-.75.42-1 .75-1 1.4v.35h1.25v-.25c0-.5.2-.8.95-1.2.9-.5 1.55-1.15 1.55-2.2 0-1.55-1.3-2.65-3.35-2.65-1.85 0-3.15 1.05-3.4 2.55l1.2.2Zm1.9 6.2c.45 0 .8-.35.8-.8s-.35-.8-.8-.8-.8.35-.8.8.35.8.8.8Z"
      />
    </svg>
  );
}

/**
 * 본문 검색 문법 도움말 (? 아이콘 + 모달).
 * @param {{ className?: string }} props
 */
export default function DocSearchHelpButton({ className = '' }) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-nas-muted transition-colors hover:bg-nas-accentSoft hover:text-nas-accentText ${className}`.trim()}
        title="검색 도움말"
        aria-label="검색 도움말"
        onClick={() => setHelpOpen(true)}
      >
        <HelpCircleIcon />
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
    </>
  );
}
