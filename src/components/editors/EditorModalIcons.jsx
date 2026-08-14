/**
 * Icons for the editor window header actions.
 * 16px glyphs on a 24 grid, single color so they inherit the button color.
 */

/** @param {{ children: import('react').ReactNode }} props */
function Glyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** 백업 보기 — clock with a counter-clockwise arrow */
export function IconHistory() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M12 4a8 8 0 1 1-7.44 5.05l1.87.7A6 6 0 1 0 12 6v2.5L8 5.75 12 3Z"
      />
      <path fill="currentColor" d="M11.25 8h1.5v4.31l3.02 1.75-.75 1.3-3.77-2.18Z" />
    </Glyph>
  );
}

/** 백업 생성 — save disk with a plus */
export function IconBackupCreate() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M5 3h11l3 3v15H5Zm2 2v4h8V5Zm1 0v3h2V5Zm-1 8v6h10v-6Z"
      />
      <path fill="currentColor" d="M11.25 14h1.5v1.75h1.75v1.5H12.75V19h-1.5v-1.75H9.5v-1.5h1.75Z" />
    </Glyph>
  );
}

/** 닫기 */
export function IconClose() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z"
      />
    </Glyph>
  );
}

/** HTML 가져오기 — code page with an arrow coming in */
export function IconImportHtml() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-8h-2v8H6V5h7Z"
      />
      <path fill="currentColor" d="M18 2v5.6l2.1-2.1 1.4 1.4L17 11.4 12.5 6.9l1.4-1.4L16 7.6V2Z" />
      <path
        fill="currentColor"
        d="m9.6 13.2-2 2 2 2 .9-1-1-1 1-1Zm3.8 0-.9 1 1 1-1 1 .9 1 2-2Z"
      />
    </Glyph>
  );
}

/** HTML 내보내기 — code page with an arrow going out */
export function IconExportHtml() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-8h-2v8H6V5h7Z"
      />
      <path fill="currentColor" d="M17 2l4.5 4.5-1.4 1.4L18 5.8V11h-2V5.8l-2.1 2.1-1.4-1.4Z" />
      <path
        fill="currentColor"
        d="m9.6 13.2-2 2 2 2 .9-1-1-1 1-1Zm3.8 0-.9 1 1 1-1 1 .9 1 2-2Z"
      />
    </Glyph>
  );
}

/** HWPX 내보내기 — document marked H with an arrow going out */
export function IconExportHwpx() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-8h-2v8H6V5h7Z"
      />
      <path fill="currentColor" d="M17 2l4.5 4.5-1.4 1.4L18 5.8V11h-2V5.8l-2.1 2.1-1.4-1.4Z" />
      <path fill="currentColor" d="M8 13h1.6v2.2h2.3V13h1.6v6h-1.6v-2.3H9.6V19H8Z" />
    </Glyph>
  );
}

/** PDF 내보내기 — document marked P with an arrow going out */
export function IconExportPdf() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-8h-2v8H6V5h7Z"
      />
      <path fill="currentColor" d="M17 2l4.5 4.5-1.4 1.4L18 5.8V11h-2V5.8l-2.1 2.1-1.4-1.4Z" />
      <path
        fill="currentColor"
        d="M8 13h2.7a2.15 2.15 0 0 1 0 4.3H9.6V19H8Zm1.6 1.4v1.5h1.1a.75.75 0 0 0 0-1.5Z"
      />
    </Glyph>
  );
}

/** 원노트 가져오기 — notebook marked N with an arrow coming in */
export function IconImportOnenote() {
  return (
    <Glyph>
      <path
        fill="currentColor"
        d="M13 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8h-2v8H8V5h5Z"
      />
      <path fill="currentColor" d="M18 2v5.6l2.1-2.1 1.4 1.4L17 11.4 12.5 6.9l1.4-1.4L16 7.6V2Z" />
      <path fill="currentColor" d="M9.5 13h1.4l2.1 3.2V13h1.5v6h-1.4l-2.1-3.2V19H9.5Z" />
      <path fill="currentColor" d="M4 7h2v1.6H4Zm0 3.6h2v1.6H4Zm0 3.6h2v1.6H4Z" />
    </Glyph>
  );
}
