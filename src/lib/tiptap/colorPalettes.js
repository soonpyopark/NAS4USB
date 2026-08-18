/**
 * Shared TipTap color swatches (text / highlight / cell fill).
 * Includes a "없음/기본" entry plus a multi-shade palette.
 */

/** @typedef {{ label: string, value: string }} TipTapSwatch */

/** @type {TipTapSwatch[]} */
export const TIPTAP_TEXT_COLORS = [
  { label: '기본', value: '' },
  { label: '검정', value: '#111827' },
  { label: '진한 회색', value: '#374151' },
  { label: '회색', value: '#6b7280' },
  { label: '연한 회색', value: '#9ca3af' },
  { label: '흰색', value: '#ffffff' },

  { label: '빨강', value: '#dc2626' },
  { label: '진한 빨강', value: '#991b1b' },
  { label: '연한 빨강', value: '#f87171' },
  { label: '장미', value: '#e11d48' },

  { label: '주황', value: '#ea580c' },
  { label: '진한 주황', value: '#c2410c' },
  { label: '호박', value: '#d97706' },
  { label: '노랑', value: '#ca8a04' },

  { label: '라임', value: '#65a30d' },
  { label: '초록', value: '#16a34a' },
  { label: '진한 초록', value: '#15803d' },
  { label: '에메랄드', value: '#059669' },

  { label: '청록', value: '#0d9488' },
  { label: '시안', value: '#0891b2' },
  { label: '하늘', value: '#0284c7' },
  { label: '파랑', value: '#2563eb' },

  { label: '인디고', value: '#4f46e5' },
  { label: '남색', value: '#1e4e79' },
  { label: '보라', value: '#7c3aed' },
  { label: '진한 보라', value: '#6d28d9' },
  { label: '자홍', value: '#c026d3' },

  { label: '분홍', value: '#db2777' },
  { label: '핫핑크', value: '#ec4899' },
  { label: '갈색', value: '#92400e' },
  { label: '황토', value: '#a16207' },
];

/** @type {TipTapSwatch[]} */
export const TIPTAP_HIGHLIGHT_COLORS = [
  { label: '없음', value: '' },
  { label: '노랑', value: '#fef08a' },
  { label: '연한 노랑', value: '#fef9c3' },
  { label: '호박', value: '#fde68a' },
  { label: '주황', value: '#fed7aa' },
  { label: '복숭아', value: '#ffedd5' },

  { label: '빨강', value: '#fecaca' },
  { label: '장미', value: '#fecdd3' },
  { label: '분홍', value: '#fbcfe8' },
  { label: '자홍', value: '#f5d0fe' },
  { label: '라벤더', value: '#e9d5ff' },
  { label: '보라', value: '#ddd6fe' },

  { label: '인디고', value: '#c7d2fe' },
  { label: '파랑', value: '#bfdbfe' },
  { label: '하늘', value: '#bae6fd' },
  { label: '시안', value: '#a5f3fc' },
  { label: '청록', value: '#99f6e4' },
  { label: '민트', value: '#a7f3d0' },

  { label: '초록', value: '#bbf7d0' },
  { label: '라임', value: '#d9f99d' },
  { label: '회색', value: '#e5e7eb' },
  { label: '슬레이트', value: '#e2e8f0' },
  { label: '따뜻한 회색', value: '#f3f4f6' },
  { label: '아이보리', value: '#fffbeb' },
];

/** Soft fills for table cells — mirrors highlight tones plus a few deeper washes. */
/** @type {TipTapSwatch[]} */
export const TIPTAP_CELL_BG_COLORS = [
  { label: '없음', value: '' },
  { label: '노랑', value: '#fef9c3' },
  { label: '호박', value: '#fde68a' },
  { label: '주황', value: '#ffedd5' },
  { label: '복숭아', value: '#fed7aa' },
  { label: '빨강', value: '#fee2e2' },

  { label: '장미', value: '#ffe4e6' },
  { label: '분홍', value: '#fce7f3' },
  { label: '자홍', value: '#fae8ff' },
  { label: '라벤더', value: '#f3e8ff' },
  { label: '보라', value: '#ede9fe' },
  { label: '인디고', value: '#e0e7ff' },

  { label: '파랑', value: '#dbeafe' },
  { label: '하늘', value: '#e0f2fe' },
  { label: '시안', value: '#cffafe' },
  { label: '청록', value: '#ccfbf1' },
  { label: '민트', value: '#d1fae5' },
  { label: '초록', value: '#dcfce7' },

  { label: '라임', value: '#ecfccb' },
  { label: '회색', value: '#f3f4f6' },
  { label: '슬레이트', value: '#e2e8f0' },
  { label: '진한 회색', value: '#d1d5db' },
  { label: '아이보리', value: '#fffbeb' },
  { label: '화이트', value: '#ffffff' },
];
