import { isAudioExtension, isVideoExtension } from '../../lib/media/mediaTypes.js';

const ICON_COLORS = {
  folder: 'text-amber-500',
  hwpx: 'text-blue-600',
  wb4s: 'text-orange-500',
  xlsx: 'text-emerald-600',
  md: 'text-violet-600',
  txt: 'text-slate-600',
  audio: 'text-pink-500',
  video: 'text-red-500',
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

function WhiteboardSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16v12H4V4zm2 2v8h12V6H6zm-1 14h14v2H5v-2z" />
    </svg>
  );
}

export default function FileIcon({ entry, className = 'h-5 w-5' }) {
  if (entry.isDirectory) {
    return <FolderSvg className={`${className} ${ICON_COLORS.folder}`} />;
  }

  if (entry.extension === 'hwpx') {
    return <DocumentSvg className={`${className} ${ICON_COLORS.hwpx}`} />;
  }

  if (entry.extension === 'wb4s') {
    return <WhiteboardSvg className={`${className} ${ICON_COLORS.wb4s}`} />;
  }

  if (entry.extension === 'xlsx' || entry.extension === 'xls') {
    return <SheetSvg className={`${className} ${ICON_COLORS.xlsx}`} />;
  }

  if (entry.extension === 'md') {
    return <DocumentSvg className={`${className} ${ICON_COLORS.md}`} />;
  }

  if (entry.extension === 'txt') {
    return <DocumentSvg className={`${className} ${ICON_COLORS.txt}`} />;
  }

  if (isAudioExtension(entry.extension)) {
    return <AudioSvg className={`${className} ${ICON_COLORS.audio}`} />;
  }

  if (isVideoExtension(entry.extension)) {
    return <VideoSvg className={`${className} ${ICON_COLORS.video}`} />;
  }

  return <DocumentSvg className={`${className} ${ICON_COLORS.default}`} />;
}
