import { useCallback, useEffect, useRef, useState } from 'react';
import { AppModalButton } from '../common/AppModal.jsx';
import ViewerModal from './ViewerModal.jsx';
import { useMediaSeriesQueue } from '../../hooks/useMediaSeriesQueue.js';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { getAudioMimeType } from '../../lib/media/mediaTypes.js';
import {
  MEDIA_PLAY_MODE_LABEL,
  MEDIA_PLAY_MODE_ORDER,
  loadMediaPlayMode,
  mediaPlayModeTitle,
  pickRandomSibling,
  storeMediaPlayMode,
} from '../../lib/media/mediaPlayMode.js';

const PLAY_MODE_STORAGE_KEY = 'nas4usb.audioPlayer.playMode';

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 *   raised?: boolean,
 *   onOpenSibling?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void | Promise<boolean>,
 * }} props
 */
export default function AudioPlayerShell({
  relativePath,
  fileName,
  extension,
  onClose,
  allowClose = true,
  fullscreen = false,
  raised = false,
  onOpenSibling,
}) {
  const mimeType = getAudioMimeType(extension);
  const audioRef = useRef(/** @type {HTMLAudioElement | null} */ (null));
  const { streamUrl, loadError, loading, bufferedPercent, mediaHandlers } = useMediaStream(relativePath, {
    mimeType,
    mediaRef: audioRef,
  });
  const [playMode, setPlayMode] = useState(() => loadMediaPlayMode(PLAY_MODE_STORAGE_KEY));
  const {
    prev: prevInSeries,
    next: nextInSeries,
    siblings: seriesSiblings,
    index: seriesIndex,
    total: seriesTotal,
  } = useMediaSeriesQueue(relativePath, fileName, 'audio', Boolean(onOpenSibling));
  const hasSeries = seriesTotal > 1;

  const cyclePlayMode = useCallback(() => {
    setPlayMode((current) => {
      const index = MEDIA_PLAY_MODE_ORDER.indexOf(current);
      const next = MEDIA_PLAY_MODE_ORDER[(index + 1) % MEDIA_PLAY_MODE_ORDER.length] ?? 'off';
      storeMediaPlayMode(PLAY_MODE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const openSeriesEntry = useCallback(
    (entry) => {
      if (!entry || !onOpenSibling) return;
      void onOpenSibling(entry);
    },
    [onOpenSibling],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = playMode === 'one';
  }, [playMode, streamUrl]);

  const handleEnded = useCallback(() => {
    if (playMode === 'off' || playMode === 'one') return;
    if (playMode === 'series') {
      if (nextInSeries) openSeriesEntry(nextInSeries);
      return;
    }
    if (playMode === 'random') {
      const pick = pickRandomSibling(seriesSiblings, relativePath);
      if (pick) {
        openSeriesEntry(pick);
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.currentTime = 0;
          void audio.play();
        } catch {
          // ignore
        }
      }
    }
  }, [nextInSeries, openSeriesEntry, playMode, relativePath, seriesSiblings]);

  useEffect(() => {
    if (!hasSeries) return undefined;
    const onKeyDown = (event) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (event.key === 'ArrowLeft' && prevInSeries) {
        event.preventDefault();
        openSeriesEntry(prevInSeries);
      } else if (event.key === 'ArrowRight' && nextInSeries) {
        event.preventDefault();
        openSeriesEntry(nextInSeries);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSeries, nextInSeries, openSeriesEntry, prevInSeries]);

  const playModeLabel = MEDIA_PLAY_MODE_LABEL[playMode] ?? MEDIA_PLAY_MODE_LABEL.off;
  const playModeTitle = mediaPlayModeTitle(playMode, 'audio');

  const statusBits = [
    `음원 · ${extension.toUpperCase()} · ${mimeType}`,
    hasSeries && seriesIndex >= 0 ? `${seriesIndex + 1}/${seriesTotal}` : '',
    playMode === 'series' && nextInSeries ? `다음 ${nextInSeries.name}` : '',
    playMode === 'random' ? '랜덤 재생' : '',
    playMode === 'one' ? '한곡 반복' : '',
  ].filter(Boolean);

  const actions = (
    <>
      <AppModalButton
        title={playModeTitle}
        onClick={cyclePlayMode}
        aria-label={`재생 모드 ${playModeLabel}. 클릭하면 다음 모드`}
      >
        {playModeLabel}
      </AppModalButton>
      {hasSeries ? (
        <>
          <AppModalButton
            disabled={!prevInSeries || loading}
            title={prevInSeries ? `이전 파일: ${prevInSeries.name} (Shift+←)` : '이전 파일 없음'}
            onClick={() => openSeriesEntry(prevInSeries)}
          >
            이전
          </AppModalButton>
          <AppModalButton
            disabled={!nextInSeries || loading}
            title={nextInSeries ? `다음 파일: ${nextInSeries.name} (Shift+→)` : '다음 파일 없음'}
            onClick={() => openSeriesEntry(nextInSeries)}
          >
            다음
          </AppModalButton>
        </>
      ) : null}
    </>
  );

  return (
    <ViewerModal
      title={fileName}
      subtitle={statusBits.join(' · ')}
      actions={actions}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
      raised={raised}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-slate-950 p-8">
        {loading && (
          <p className="text-sm text-slate-300">
            {bufferedPercent > 0 ? `버퍼링 중… ${bufferedPercent}%` : '음원 준비 중…'}
          </p>
        )}

        <>
          <div className="flex h-40 w-40 items-center justify-center rounded-full bg-slate-800 text-slate-300">
            <svg className="h-16 w-16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
          <audio
            ref={audioRef}
            controls
            autoPlay
            className="w-full max-w-xl"
            src={streamUrl || undefined}
            {...mediaHandlers}
            onEnded={(event) => {
              mediaHandlers?.onEnded?.(event);
              handleEnded();
            }}
          >
            이 브라우저는 오디오 재생을 지원하지 않습니다.
          </audio>
        </>
      </div>
    </ViewerModal>
  );
}
