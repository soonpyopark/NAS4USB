import {
  isAudioExtension,
  isHtmlExtension,
  isImageExtension,
  isPdfExtension,
  isVideoExtension,
} from '../../lib/media/mediaTypes.js';

const ICON_COLORS = {
  folder: 'text-amber-500',
  hwpx: 'text-blue-600',
  wb4s: 'text-orange-500',
  tiptap: 'text-red-400',
  xlsx: 'text-emerald-600',
  md: 'text-violet-600',
  txt: 'text-slate-600',
  audio: 'text-pink-500',
  video: 'text-red-500',
  image: 'text-cyan-600',
  pdf: 'text-rose-600',
  html: 'text-orange-600',
  default: 'text-slate-400',
};

function FolderSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function DocumentSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
    </svg>
  );
}

function SheetSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
  );
}

function AudioSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
    </svg>
  );
}

function VideoSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function ImageSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
    </svg>
  );
}

function PdfSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8.5 17.5H7v-4h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.7 1.5-1.5 1.5zm4.5 0h-1.5v-4H14c.6 0 1 .4 1 1v2c0 .6-.4 1-1 1zm4.5-2.5H16v1h1.5v1H16v1.5h-1.5v-4H17.5v1.5zM9 14.5H8.5v1H9v-1zm4 .5h-.5v1.5h.5v-1.5z" />
    </svg>
  );
}

function WhiteboardSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16v12H4V4zm2 2v8h12V6H6zm-1 14h14v2H5v-2z" />
    </svg>
  );
}

export default function FileIcon({ entry, className = 'h-5 w-5' }) {
  // Put caller `className` last so size/color overrides (e.g. root system folders) win.
  if (entry.isDirectory) {
    return <FolderSvg className={`${ICON_COLORS.folder} ${className}`} />;
  }

  if (entry.extension === 'hwpx') {
    return <DocumentSvg className={`${ICON_COLORS.hwpx} ${className}`} />;
  }

  if (entry.extension === 'wb4s') {
    return <WhiteboardSvg className={`${ICON_COLORS.wb4s} ${className}`} />;
  }

  if (entry.extension === 'tiptap') {
    return <DocumentSvg className={`${ICON_COLORS.tiptap} ${className}`} />;
  }

  if (entry.extension === 'xlsx' || entry.extension === 'xls') {
    return <SheetSvg className={`${ICON_COLORS.xlsx} ${className}`} />;
  }

  if (entry.extension === 'md') {
    return <DocumentSvg className={`${ICON_COLORS.md} ${className}`} />;
  }

  if (entry.extension === 'txt') {
    return <DocumentSvg className={`${ICON_COLORS.txt} ${className}`} />;
  }

  if (isAudioExtension(entry.extension)) {
    return <AudioSvg className={`${ICON_COLORS.audio} ${className}`} />;
  }

  if (isVideoExtension(entry.extension)) {
    return <VideoSvg className={`${ICON_COLORS.video} ${className}`} />;
  }

  if (isImageExtension(entry.extension)) {
    return <ImageSvg className={`${ICON_COLORS.image} ${className}`} />;
  }

  if (isPdfExtension(entry.extension)) {
    return <PdfSvg className={`${ICON_COLORS.pdf} ${className}`} />;
  }

  if (isHtmlExtension(entry.extension)) {
    return <DocumentSvg className={`${ICON_COLORS.html} ${className}`} />;
  }

  return <DocumentSvg className={`${ICON_COLORS.default} ${className}`} />;
}
