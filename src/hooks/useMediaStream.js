import { useEffect, useMemo, useRef, useState } from 'react';
import { base64ToBytes } from '../lib/bytes.js';
import { unwrapWorkspaceBase64 } from '../lib/filePassword/io.js';
import { isSecFileName } from '../lib/filePassword/secPaths.js';
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
 * @param {{ force?: boolean, waitForFull?: boolean, statusOnly?: boolean, startSeconds?: number, replace?: boolean }} [options]
 */
async function prepareVideoPreview(relativePath, options = {}) {
  const url = new URL(buildMediaStreamUrl(relativePath, { preview: true }), window.location.origin);
  url.searchParams.set('prepare', '1');
  if (options.force) url.searchParams.set('force', '1');
  if (options.waitForFull) url.searchParams.set('full', '1');
  if (options.statusOnly) url.searchParams.set('status', '1');
  if (options.replace) url.searchParams.set('replace', '1');
  if (Number(options.startSeconds) > 0.5) url.searchParams.set('start', String(options.startSeconds));
  else if (options.replace) url.searchParams.set('start', '0');
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
 * @param {{ preferFfmpegPreview?: boolean, mediaRef?: import('react').RefObject<HTMLMediaElement | null>, mimeType?: string }} [options]
 */
export function useMediaStream(relativePath, options = {}) {
  const locked = isSecFileName(relativePath);
  const preferFfmpegPreview = Boolean(options.preferFfmpegPreview) && !locked;
  const mediaRef = options.mediaRef;
  const mimeType = options.mimeType || '';
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
  const [durationSeconds, setDurationSeconds] = useState(/** @type {number | null} */ (null));
  const [availableSeconds, setAvailableSeconds] = useState(0);
  const [startSeconds, setStartSeconds] = useState(0);
  const retriedRef = useRef(false);
  const seekingRef = useRef(false);
  const [secUrl, setSecUrl] = useState('');
  const [secError, setSecError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!locked) {
      setSecUrl('');
      setSecError(null);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = '';
    setSecUrl('');
    setSecError(null);
    setLoading(true);

    void (async () => {
      try {
        const raw = await window.nas4usb.fs.readFile(relativePath);
        const plain = await unwrapWorkspaceBase64(relativePath, raw);
        const bytes = base64ToBytes(plain);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/octet-stream' }));
        if (!cancelled) {
          setSecUrl(objectUrl);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setSecUrl('');
          setSecError(error instanceof Error ? error.message : '비밀번호로 보호된 미디어를 열 수 없습니다.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [locked, mimeType, relativePath]);

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
    setDurationSeconds(null);
    setAvailableSeconds(0);
    setStartSeconds(0);
    seekingRef.current = false;

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

      setPreviewNote('변환하며 재생합니다. 아래 막대로 중간부터 이동할 수 있습니다.');
      setUsePreview(true);
      setPlayerKind('hls');
      setPreviewStage('streaming');
      setFfmpegChecked(true);
      setPreparing(false);
      try {
        const data = await prepareVideoPreview(relativePath);
        if (cancelled) return;
        const hls = data.protocol === 'hls' || data.stage === 'streaming';
        const stage =
          data.stage === 'streaming' || data.stage === 'full' ? data.stage : 'source';
        setPreviewStage(stage);
        setPlayerKind(hls ? 'hls' : 'file');
        setUsePreview(true);
        if (Number(data.durationSeconds) > 0) setDurationSeconds(Number(data.durationSeconds));
        if (Number.isFinite(Number(data.availableSeconds))) {
          setAvailableSeconds(Number(data.availableSeconds));
        }
        setStartSeconds(Number(data.startSeconds) > 0 ? Number(data.startSeconds) : 0);
        if (hls && !data.fullReady) {
          setPreviewNote('변환하며 재생합니다. 아래 막대로 중간부터 이동할 수 있습니다.');
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
        const data = await prepareVideoPreview(relativePath, {
          statusOnly: true,
          startSeconds,
        });
        if (cancelled) return;
        if (Number(data.durationSeconds) > 0) setDurationSeconds(Number(data.durationSeconds));
        if (Number.isFinite(Number(data.availableSeconds))) {
          setAvailableSeconds(Number(data.availableSeconds));
        }
        if (!seekingRef.current && Number.isFinite(Number(data.startSeconds))) {
          const reported = Number(data.startSeconds) > 0 ? Number(data.startSeconds) : 0;
          setStartSeconds((current) => {
            if (current > 0.5 && reported < 0.5) return current;
            if (Math.abs(current - reported) < 0.5) return current;
            return reported;
          });
        }
        if (data.fullReady !== true) return;
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
  }, [relativePath, usePreview, playerKind, previewStage, startSeconds]);

  const streamUrl = useMemo(() => {
    if (locked) return secUrl;
    if (!ffmpegChecked || blockStream) return '';
    const url = buildMediaStreamUrl(relativePath, { preview: usePreview });
    if (!usePreview) return url;
    const extra = new URLSearchParams();
    if (forcePreview) extra.set('force', '1');
    if (playerKind === 'hls') extra.set('hls', 'index.m3u8');
    if (startSeconds > 0.5) extra.set('start', String(Math.floor(startSeconds)));
    extra.set('n', String(previewNonce));
    return `${url}&${extra.toString()}`;
  }, [
    locked,
    secUrl,
    relativePath,
    usePreview,
    forcePreview,
    previewNonce,
    ffmpegChecked,
    blockStream,
    playerKind,
    startSeconds,
  ]);

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
    loading: preparing || loading || !ffmpegChecked || (locked && !secUrl && !secError),
    loadError: loadError || secError,
    bufferedPercent,
    mediaHandlers,
    previewNote,
    usingFfmpegPreview: usePreview,
    isStreamingPreview,
    previewStage,
    playerKind,
    setLoadError,
    setLoading,
    setPreparing,
    durationSeconds,
    availableSeconds,
    startSeconds,
    seekTo: async (seconds) => {
      const target = Math.max(0, Number(seconds) || 0);
      const media = mediaRef?.current;
      const duration = durationSeconds || 0;
      const clamped = duration > 0 ? Math.min(duration, target) : target;
      const origin = startSeconds > 0.5 ? startSeconds : 0;
      let localReady = Math.max(0, Number(availableSeconds) || 0);
      if (media instanceof HTMLMediaElement) {
        if (Number.isFinite(media.duration) && media.duration > 0) {
          localReady = Math.max(localReady, media.duration);
        }
        if (media.buffered.length > 0) {
          localReady = Math.max(localReady, media.buffered.end(media.buffered.length - 1));
        }
        if (media.seekable.length > 0) {
          localReady = Math.max(localReady, media.seekable.end(media.seekable.length - 1));
        }
      }
      const convertedEnd = origin + localReady + 0.75;

      if (
        media instanceof HTMLMediaElement &&
        clamped >= origin - 0.25 &&
        clamped <= convertedEnd
      ) {
        media.currentTime = Math.max(0, clamped - origin);
        return;
      }

      if (seekingRef.current) return;
      seekingRef.current = true;
      setPreparing(true);
      setLoadError(null);
      try {
        const data = await prepareVideoPreview(relativePath, { startSeconds: clamped, replace: true });
        setStartSeconds(Number(data.startSeconds) > 0 ? Number(data.startSeconds) : clamped);
        if (Number(data.durationSeconds) > 0) setDurationSeconds(Number(data.durationSeconds));
        if (Number.isFinite(Number(data.availableSeconds))) {
          setAvailableSeconds(Number(data.availableSeconds));
        }
        const stage = data.stage === 'full' ? 'full' : 'streaming';
        setPreviewStage(stage);
        setPreviewNonce((value) => value + 1);
        setPreviewNote('선택한 위치부터 변환하며 재생합니다.');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '해당 위치부터 변환하지 못했습니다.');
      } finally {
        seekingRef.current = false;
        setPreparing(false);
      }
    },
  };
}
