/** Compact toolbar icons for PDF viewer (title / aria-label carry the meaning). */

function Svg({ children, ...props }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconPdfThumbs() {
  return (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="11" width="7" height="5" rx="1" />
      <rect x="3" y="15" width="7" height="6" rx="1" />
    </Svg>
  );
}

export function IconPdfHighlight() {
  return (
    <Svg>
      <path d="M9 11l-6 6v3h3l6-6" />
      <path d="M16 4l4 4-8 8H8v-4l8-8z" />
    </Svg>
  );
}

export function IconPdfChevronLeft() {
  return (
    <Svg>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function IconPdfChevronRight() {
  return (
    <Svg>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

export function IconPdfZoomOut() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M8 11h6" />
    </Svg>
  );
}

export function IconPdfZoomIn() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </Svg>
  );
}

export function IconPdfFitWidth() {
  return (
    <Svg>
      <path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4" />
      <path d="M4 4v2M4 18v2M20 4v2M20 18v2" />
    </Svg>
  );
}

export function IconPdfFitHeight() {
  return (
    <Svg>
      <path d="M12 4v16M8 7l4-3 4 3M8 17l4 3 4-3" />
      <path d="M4 4h2M18 4h2M4 20h2M18 20h2" />
    </Svg>
  );
}

export function IconPdfFitPage() {
  return (
    <Svg>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </Svg>
  );
}

export function IconPdfTwoPages() {
  return (
    <Svg>
      <rect x="3" y="4" width="8" height="16" rx="1" />
      <rect x="13" y="4" width="8" height="16" rx="1" />
    </Svg>
  );
}

export function IconPdfRotate() {
  return (
    <Svg>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function IconPdfPrint() {
  return (
    <Svg>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </Svg>
  );
}

export function IconPdfExportExcel() {
  return (
    <Svg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  );
}

export function IconPdfSearch() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Svg>
  );
}

export function IconPdfSearchClose() {
  return (
    <Svg>
      <path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}
