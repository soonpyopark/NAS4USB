import { useEffect, useMemo, useState } from 'react';
import { buildMediaStreamUrl, getMediaBufferedPercent } from '../lib/media/streamUrl.js';
import { getShareTokenFromUrl } from '../lib/shareAccess.js';
import { getStoredAdminToken } from '../lib/nas4usbClient.js';

/**
 * @returns {Promise<boolean>}
 */
async function fetchFfmpegAvailable() {
  try {
    const headers = {};
    const adminToken = getStoredAdminToken();
    if (adminToken) headers['X-Admin-Token'] = adminToken;
    const share = getShareTokenFromUrl();
    const url = share
      ? `/api/media/ffmpegStatus?share=${encodeURIComponent(share)}`
      : '/api/media/ffmpegStatus';
    const response = await fetch(url, { headers });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.available);
  } catch {
    return false;
  }
}

/**
 * @param {string} relativePath
 * @param {{ preferFfmpegPreview?: boolean }} [options]
 */
export function useMediaStream(relativePath, options = {}) {
  const preferFfmpegPreview = Boolean(options.preferFfmpegPreview);
  const [usePreview, setUsePreview] = useState(false);
  const [ffmpegChecked, setFfmpegChecked] = useState(!preferFfmpegPreview);
  const [preparing, setPreparing] = useState(preferFfmpegPreview);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [previewNote, setPreviewNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setBufferedPercent(0);
    setLoading(true);
    setPreviewNote('');

    if (!preferFfmpegPreview) {
      setUsePreview(false);
      setPreparing(false);
      setFfmpegChecked(true);
      return undefined;
    }

    setPreparing(true);
    setFfmpegChecked(false);
    (async () => {
      const available = await fetchFfmpegAvailable();
      if (cancelled) return;
      setUsePreview(available);
      setPreviewNote(available ? 'FFmpeg 호환 변환을 사용합니다.' : '');
      setPreparing(false);
      setFfmpegChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [relativePath, preferFfmpegPreview]);

  const streamUrl = useMemo(() => {
    if (!ffmpegChecked) return '';
    return buildMediaStreamUrl(relativePath, { preview: usePreview });
  }, [relativePath, usePreview, ffmpegChecked]);

  const mediaHandlers = {
    onLoadedMetadata: () => {
      setLoading(false);
      setPreparing(false);
    },
    onCanPlay: () => {
      setLoading(false);
      setPreparing(false);
    },
    onProgress: (event) => {
      const media = event.currentTarget;
      if (media instanceof HTMLMediaElement) {
        setBufferedPercent(getMediaBufferedPercent(media));
      }
    },
    onError: () => {
      setLoadError(
        usePreview
          ? '호환 변환 영상을 재생할 수 없습니다.'
          : '미디어 파일을 재생할 수 없습니다.',
      );
      setLoading(false);
      setPreparing(false);
    },
  };

  return {
    streamUrl,
    loading: preparing || loading || !ffmpegChecked,
    loadError,
    bufferedPercent,
    mediaHandlers,
    previewNote,
    usingFfmpegPreview: usePreview,
  };
}
