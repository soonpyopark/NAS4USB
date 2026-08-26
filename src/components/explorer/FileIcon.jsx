import { folderColorHex } from '../../../shared/folderColors.js';
import { folderDisplayDepth } from '../../lib/memberHomes.js';
import { innerExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import {
  isAudioExtension,
  isHtmlExtension,
  isImageExtension,
  isPdfExtension,
  isVideoExtension,
} from '../../lib/media/mediaTypes.js';

const ICON_COLORS = {
  folder: 'text-amber-500',
  folderLevel1: '!text-red-500',
  folderLevel2: '!text-amber-500',
  folderLevel3: '!text-sky-400',
  folderLevel4: '!text-lime-300',
  folderLevel5: '!text-yellow-300',
  folderLevel6: '!text-fuchsia-600',
  hwpx: 'text-blue-600',
  wb4s: 'text-orange-500',
  tiptap: 'text-red-400',
  one: 'text-purple-600',
  xlsx: 'text-emerald-600',
  md: 'text-violet-600',
  txt: 'text-slate-600',
  audio: 'text-pink-500',
  video: 'text-red-500',
  image: 'text-cyan-600',
  pdf: 'text-rose-600',
  html: 'text-orange-600',
  sql: 'text-sky-700',
  default: 'text-slate-400',
};

function FolderSvg({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function FolderBarSvg({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="17" rx="1.5" />
    </svg>
  );
}

function FileDiscSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function FileRingSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

/**
 * @param {string | null | undefined} extension
 */
export function fileTypeColorClass(extension) {
  if (extension === 'hwpx') return ICON_COLORS.hwpx;
  if (extension === 'wb4s') return ICON_COLORS.wb4s;
  if (extension === 'tiptap') return ICON_COLORS.tiptap;
  if (extension === 'one' || extension === 'onepkg') return ICON_COLORS.one;
  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv' || extension === 'tsv') {
    return ICON_COLORS.xlsx;
  }
  if (extension === 'md') return ICON_COLORS.md;
  if (extension === 'txt') return ICON_COLORS.txt;
  if (isAudioExtension(extension)) return ICON_COLORS.audio;
  if (isVideoExtension(extension)) return ICON_COLORS.video;
  if (isImageExtension(extension)) return ICON_COLORS.image;
  if (isPdfExtension(extension)) return ICON_COLORS.pdf;
  if (isHtmlExtension(extension)) return ICON_COLORS.html;
  if (extension === 'sql') return ICON_COLORS.sql;
  return ICON_COLORS.default;
}

const FOLDER_LEVEL_CYCLE = [
  ICON_COLORS.folderLevel1,
  ICON_COLORS.folderLevel2,
  ICON_COLORS.folderLevel3,
  ICON_COLORS.folderLevel4,
  ICON_COLORS.folderLevel5,
  ICON_COLORS.folderLevel6,
];

/**
 * Workspace folder tint cycles: 빨강 → 호박 → 연한 파랑 → 멜론 → 레몬 → 자주.
 * A stored color key or custom hex overrides the depth cycle.
 *
 * @param {{ isDirectory?: boolean, relativePath?: string } | null | undefined} entry
 * @param {string} [colorKey]
 */
export function resolveFolderIconTint(entry, colorKey) {
  if (!entry?.isDirectory) return { className: '', style: undefined };
  const hex = folderColorHex(colorKey);
  if (hex) return { className: '', style: { color: hex } };
  const depth = Math.max(1, folderDisplayDepth(entry.relativePath));
  return { className: FOLDER_LEVEL_CYCLE[(depth - 1) % FOLDER_LEVEL_CYCLE.length], style: undefined };
}

/**
 * @param {{ isDirectory?: boolean, relativePath?: string } | null | undefined} entry
 * @param {string} [colorKey]
 */
export function folderIconTintClass(entry, colorKey) {
  return resolveFolderIconTint(entry, colorKey).className;
}

export default function FileIcon({ entry, className = 'h-5 w-5', folderColor, nameBold = false }) {
  // Put caller `className` last so size/color overrides (e.g. root system folders) win.
  if (entry.isDirectory) {
    const tint = resolveFolderIconTint(entry, folderColor);
    const Icon = folderDisplayDepth(entry.relativePath) >= 3 ? FolderBarSvg : FolderSvg;
    return (
      <Icon
        className={`${ICON_COLORS.folder} ${tint.className} ${className}`}
        style={tint.style}
      />
    );
  }

  const extension = isSecFileName(entry.name || entry.relativePath)
    ? innerExtensionOf(entry.name || entry.relativePath)
    : entry.extension;
  const Icon = nameBold ? FileDiscSvg : FileRingSvg;

  return <Icon className={`${fileTypeColorClass(extension)} ${className}`} />;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot.invalidate();
  });
}
