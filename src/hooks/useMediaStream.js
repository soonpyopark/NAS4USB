import { useEffect, useMemo, useRef, useState } from 'react';
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
 * @param {{ force?: boolean, waitForFull?: boolean, statusOnly?: boolean }} [options]
 */
async function prepareVideoPreview(relativePath, options = {}) {
  const url = new URL(buildMediaStreamUrl(relativePath, { preview: true }), window.location.origin);
  url.searchParams.set('prepare', '1');
  if (options.force) url.searchParams.set('force', '1');
  if (options.waitForFull) url.searchParams.set('full', '1');
  if (options.statusOnly) url.searchParams.set('status', '1');
  const headers = {};
  const adminToken = getStoredAdminToken();
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const response = await fetch(`${url.pathname}${url.search}`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : '';
    throw new Error(message || '호환 변환에 실패했습니다.');
  }
  return data;
}

/**
 * @param {string} relativePath
 * @param {{ preferFfmpegPreview?: boolean, mediaRef?: import('react').RefObject<HTMLMediaElement | null> }} [options]
 */
export function useMediaStream(relativePath, options = {}) {
  const preferFfmpegPreview = Boolean(options.preferFfmpegPreview);
  const mediaRef = options.mediaRef;
  const [usePreview, setUsePreview] = useState(false);
  const [forcePreview, setForcePreview] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [ffmpegChecked, setFfmpegChecked] = useState(!preferFfmpegPreview);
  const [preparing, setPreparing] = useState(preferFfmpegPreview);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [previewNote, setPreviewNote] = useState('');
  const [blockStream, setBlockStream] = useState(false);
  const [playerKind, setPlayerKind] = useState(/** @type {'file' | 'hls'} */ ('file'));
  const [previewStage, setPreviewStage] = useState(
    /** @type {'source' | 'streaming' | 'full'} */ ('source'),
  );
  const retriedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    retriedRef.current = false;
    setLoadError(null);
    setBufferedPercent(0);
    setLoading(true);
    setPreviewNote('');
    setForcePreview(false);
    setPreviewNonce(0);
    setBlockStream(false);
    setPlayerKind('file');
    setPreviewStage('source');

    if (!preferFfmpegPreview) {
      setUsePreview(false);
      setPreparing(false);
      setFfmpegChecked(true);
      return undefined;
    }

    setPreparing(true);
    setFfmpegChecked(false);
    setUsePreview(false);
    (async () => {
      const available = await fetchFfmpegAvailable();
      if (cancelled) return;
      if (!available) {
        setUsePreview(false);
        setPreviewNote('');
        setPreparing(false);
        setFfmpegChecked(true);
        return;
      }

      setPreviewNote('FFmpeg 호환 변환을 사용합니다.');
      try {
        const data = await prepareVideoPreview(relativePath);
        if (cancelled) return;
        const hls = data.protocol === 'hls' || data.stage === 'streaming';
        const stage =
          data.stage === 'streaming' || data.stage === 'full' ? data.stage : 'source';
        setPreviewStage(stage);
        setPlayerKind(hls ? 'hls' : 'file');
        setUsePreview(true);
        if (hls && !data.fullReady) {
          setPreviewNote('변환하며 재생합니다.');
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : '호환 변환에 실패했습니다.');
        setUsePreview(false);
        setBlockStream(true);
        setLoading(false);
      }
      setPreparing(false);
      setFfmpegChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [relativePath, preferFfmpegPreview]);

  useEffect(() => {
    if (!usePreview || playerKind !== 'hls' || previewStage !== 'streaming') return undefined;
    let cancelled = false;

    async function pollFull() {
      try {
        const data = await prepareVideoPreview(relativePath, { statusOnly: true });
        if (cancelled || data.fullReady !== true) return;
        setPreviewStage('full');
        setPreviewNote('');
      } catch {
        // playlist is still live
      }
    }

    const timer = window.setInterval(() => {
      void pollFull();
    }, 3000);
    void pollFull();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [relativePath, usePreview, playerKind, previewStage]);

  const streamUrl = useMemo(() => {
    if (!ffmpegChecked || blockStream) return '';
    const url = buildMediaStreamUrl(relativePath, { preview: usePreview });
    if (!usePreview) return url;
    const extra = new URLSearchParams();
    if (forcePreview) extra.set('force', '1');
    if (playerKind === 'hls') extra.set('hls', 'index.m3u8');
    extra.set('n', String(previewNonce));
    return `${url}&${extra.toString()}`;
  }, [relativePath, usePreview, forcePreview, previewNonce, ffmpegChecked, blockStream, playerKind]);

  const isStreamingPreview = usePreview && playerKind === 'hls' && previewStage === 'streaming';

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
      if (playerKind === 'hls') return;
      if (usePreview && !retriedRef.current) {
        retriedRef.current = true;
        setPreparing(true);
        setLoadError(null);
        (async () => {
          try {
            await prepareVideoPreview(relativePath, { force: true, waitForFull: true });
            setForcePreview(true);
            setPreviewStage('full');
            setPreviewNonce((value) => value + 1);
            setPreparing(false);
          } catch (error) {
            setLoadError(
              error instanceof Error && error.message
                ? error.message
                : '호환 변환 영상을 재생할 수 없습니다.',
            );
            setBlockStream(true);
            setLoading(false);
            setPreparing(false);
          }
        })();
        return;
      }
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
    isStreamingPreview,
    playerKind,
    setLoadError,
    setLoading,
    setPreparing,
  };
}
