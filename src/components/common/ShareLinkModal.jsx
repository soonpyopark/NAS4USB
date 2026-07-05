import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '../../lib/shareLink.js';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from './AppModal.jsx';

/**
 * @param {{
 *   open: boolean,
 *   url: string,
 *   fileName?: string,
 *   onClose: () => void,
 * }} props
 */
export default function ShareLinkModal({ open, url, fileName, onClose }) {
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert('클립보드 복사에 실패했습니다.');
    }
  };

  return (
    <AppModal open={open} onClose={onClose} title="공유 링크" wide>
      <AppModalBody>
        {fileName ? (
          <>
            <strong className="text-[#323130]">{fileName}</strong> 파일의 공유 링크입니다.
            <br />
            아래 URL을 복사해 전달하세요.
          </>
        ) : (
          '아래 URL을 복사해 전달하세요.'
        )}
      </AppModalBody>

      <input
        ref={inputRef}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        className="mb-4 w-full rounded border border-[#8a8886] bg-[#faf9f8] px-3 py-2 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
      />

      <AppModalActions>
        <AppModalButton variant="primary" onClick={handleCopy}>
          {copied ? '복사됨' : '링크 복사'}
        </AppModalButton>
        <AppModalButton onClick={onClose}>닫기</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
