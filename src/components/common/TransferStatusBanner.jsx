import { formatByteSize } from '../../../shared/videoPreviewCache.js';

/**
 * @param {{
 *   transfer: {
 *     kind: 'upload' | 'download',
 *     current: number,
 *     total: number,
 *     fileName?: string,
 *     bytes?: number,
 *     totalBytes?: number,
 *   } | null,
 *   variant?: 'light' | 'dark',
 * }} props
 */
export default function TransferStatusBanner({ transfer, variant = 'light' }) {
  if (!transfer) return null;

  const verb = transfer.kind === 'upload' ? '업로드' : '다운로드';
  const hasBytes = Number(transfer.totalBytes) > 0;
  const ratio = hasBytes
    ? Math.min(100, Math.round((Number(transfer.bytes) / Number(transfer.totalBytes)) * 100))
    : transfer.total > 0
      ? Math.min(100, Math.round((transfer.current / transfer.total) * 100))
      : 0;
  const dark = variant === 'dark';

  return (
    <div
      className={`shrink-0 overflow-hidden px-3 py-2 text-xs ${
        dark
          ? 'border-b border-slate-700 bg-slate-800 text-sky-100'
          : 'rounded-md border border-sky-200 bg-sky-50 text-sky-900'
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 ${
            dark ? 'border-slate-500 border-t-sky-300' : 'border-sky-300 border-t-sky-700'
          }`}
          aria-hidden="true"
        />
        <span className="font-medium">
          {verb} 중…
          {transfer.total > 0 ? ` ${transfer.current}/${transfer.total}` : ''}
          {hasBytes
            ? ` · ${formatByteSize(transfer.bytes)} / ${formatByteSize(transfer.totalBytes)}`
            : ''}
        </span>
        {transfer.fileName ? (
          <span className={`min-w-0 truncate ${dark ? 'text-slate-300' : 'text-sky-800/80'}`}>
            {transfer.fileName}
          </span>
        ) : null}
      </div>
      {transfer.total > 0 ? (
        <div
          className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-slate-700' : 'bg-sky-100'}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              dark ? 'bg-sky-400' : 'bg-sky-500'
            }`}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
