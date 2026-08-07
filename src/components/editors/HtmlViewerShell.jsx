import { useMemo, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { getHtmlMimeType } from '../../lib/media/mediaTypes.js';

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension?: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 * }} props
 */
export default function HtmlViewerShell({
  relativePath,
  fileName,
  extension = 'html',
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const mimeType = getHtmlMimeType(extension);
  const streamUrl = useMemo(() => buildMediaStreamUrl(relativePath), [relativePath]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  return (
    <ViewerModal
      title={fileName}
      subtitle={`HTML · ${mimeType}`}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col bg-slate-200">
        {loading && !loadError && (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600">
            HTML 불러오는 중…
          </p>
        )}

        <iframe
          title={fileName}
          src={streamUrl}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          sandbox="allow-same-origin allow-popups allow-forms"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoadError('HTML을 표시할 수 없습니다.');
            setLoading(false);
          }}
        />
      </div>
    </ViewerModal>
  );
}
