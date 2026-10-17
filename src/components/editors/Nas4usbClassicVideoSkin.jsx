import {
  BufferingIndicator,
  CaptionsButton,
  Container,
  Controls,
  FullscreenButton,
  Hotkey,
  MuteButton,
  PiPButton,
  PlayButton,
  PlaybackRateButton,
  SeekButton,
  Time,
  TimeSlider,
  VolumePopover,
  VolumeSlider,
} from '@videojs/react';
import { SeekIcon, VolumeHighIcon, VolumeLowIcon, VolumeOffIcon } from '@videojs/react/icons';
import Nas4usbVideoGestures from './Nas4usbVideoGestures.jsx';

/**
 * Compact seek control: curved arrow icon with a small seconds badge.
 * @param {{ seconds: number }} props
 */
function ClassicSeekGlyph({ seconds }) {
  const abs = Math.abs(seconds);
  const backward = seconds < 0;
  return (
    <span className="nas4usb-classic-seek-glyph" data-direction={backward ? 'backward' : 'forward'}>
      <SeekIcon
        className={`nas4usb-classic-seek-icon${backward ? ' nas4usb-classic-seek-icon--back' : ''}`}
      />
      <span className="nas4usb-classic-seek-num">{abs}</span>
    </span>
  );
}

/**
 * @param {{ seconds: number, title: string }} props
 */
function ClassicSeekButton({ seconds, title }) {
  return (
    <SeekButton
      seconds={seconds}
      className="nas4usb-classic-btn nas4usb-classic-seek"
      render={(props) => (
        <button {...props} type="button" className="nas4usb-classic-btn nas4usb-classic-seek" title={title}>
          <ClassicSeekGlyph seconds={seconds} />
        </button>
      )}
    />
  );
}

/**
 * Classic Video.js 8-style control layout on Video.js 10 primitives.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   className?: string,
 *   ios?: boolean,
 * }} props
 */
export default function Nas4usbClassicVideoSkin({ children, className = '', ios = false }) {
  return (
    <Container
      className={`nas4usb-classic-skin media-skin media-container media-video ${className}`.trim()}
      data-theme="compat"
      data-preset="video"
    >
      {children}

      <BufferingIndicator className="nas4usb-classic-buffering" />

      <PlayButton
        className="nas4usb-classic-big-play"
        data-nas4usb-chrome="1"
        render={(props, state) => (
          <button
            {...props}
            type="button"
            className="nas4usb-classic-big-play"
            data-visible={state.paused ? '' : undefined}
            aria-hidden={!state.paused}
            tabIndex={state.paused ? 0 : -1}
          >
            ▶
          </button>
        )}
      />

      <Controls.Root>
        <Controls.Backdrop className="nas4usb-classic-backdrop" />
        <Controls.Content className="nas4usb-classic-controls" data-nas4usb-chrome="1">
          <div className="nas4usb-classic-bar" data-nas4usb-chrome="1">
            <Controls.Group className="nas4usb-classic-group nas4usb-classic-group--start">
              <PlayButton
                className="nas4usb-classic-btn"
                render={(props, state) => (
                  <button {...props} type="button" className="nas4usb-classic-btn" title={state.paused ? '재생' : '일시정지'}>
                    {state.paused ? '▶' : '❚❚'}
                  </button>
                )}
              />
              <ClassicSeekButton seconds={-5} title="5초 뒤로" />
              <ClassicSeekButton seconds={5} title="5초 앞으로" />
              <ClassicSeekButton seconds={-10} title="10초 뒤로" />
              <ClassicSeekButton seconds={10} title="10초 앞으로" />

              <VolumePopover.Root openOnHover delay={120} closeDelay={80} side="top">
                <VolumePopover.Trigger
                  render={
                    <MuteButton
                      className="nas4usb-classic-btn nas4usb-classic-volume-btn"
                      render={(props, state) => {
                        const muted = state.muted || state.volume === 0;
                        const low = !muted && state.volume < 0.5;
                        return (
                          <button
                            {...props}
                            type="button"
                            className="nas4usb-classic-btn nas4usb-classic-volume-btn"
                            title={muted ? '음소거 해제' : '음소거'}
                          >
                            {muted ? (
                              <VolumeOffIcon className="nas4usb-classic-volume-icon" />
                            ) : low ? (
                              <VolumeLowIcon className="nas4usb-classic-volume-icon" />
                            ) : (
                              <VolumeHighIcon className="nas4usb-classic-volume-icon" />
                            )}
                          </button>
                        );
                      }}
                    />
                  }
                />
                <VolumePopover.Popup className="nas4usb-classic-volume-popup nas4usb-classic-menu" data-nas4usb-chrome="1">
                  <VolumeSlider.Root
                    className="nas4usb-classic-volume-slider media-volume-slider"
                    orientation="vertical"
                    thumbAlignment="edge"
                  >
                    <VolumeSlider.Track className="nas4usb-classic-volume-track media-volume-slider-track">
                      <VolumeSlider.Fill className="nas4usb-classic-volume-fill media-volume-slider-fill" />
                    </VolumeSlider.Track>
                    <VolumeSlider.Thumb className="nas4usb-classic-volume-thumb media-volume-slider-thumb" />
                  </VolumeSlider.Root>
                </VolumePopover.Popup>
              </VolumePopover.Root>

              <Time.Group className="nas4usb-classic-time">
                <Time.Value type="current" className="nas4usb-classic-time-value" />
                <Time.Separator className="nas4usb-classic-time-sep" />
                <Time.Value type="duration" className="nas4usb-classic-time-value" />
              </Time.Group>
            </Controls.Group>

            <TimeSlider.Root className="nas4usb-classic-progress media-time-slider" thumbAlignment="edge">
              <TimeSlider.Chapters
                className="nas4usb-classic-progress-chapters media-time-slider-chapters"
                renderChapter={(props) => (
                  <div className="nas4usb-classic-progress-chapter media-time-slider-chapter" {...props}>
                    <TimeSlider.Track className="nas4usb-classic-progress-track media-time-slider-track">
                      <TimeSlider.Buffer className="nas4usb-classic-progress-buffer media-time-slider-buffer" />
                      <TimeSlider.Fill className="nas4usb-classic-progress-fill media-time-slider-fill" />
                    </TimeSlider.Track>
                  </div>
                )}
              />
              <TimeSlider.Thumb className="nas4usb-classic-progress-thumb media-time-slider-thumb" />
            </TimeSlider.Root>

            <Controls.Group className="nas4usb-classic-group nas4usb-classic-group--end">
              <Time.Value type="remaining" className="nas4usb-classic-time-value nas4usb-classic-remaining" negativeSign="−" />
              <PlaybackRateButton
                className="nas4usb-classic-btn"
                render={(props, state) => (
                  <button {...props} type="button" className="nas4usb-classic-btn" title="재생 속도">
                    {Number(state.rate || 1).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}x
                  </button>
                )}
              />
              <CaptionsButton
                className="nas4usb-classic-btn"
                render={(props) => (
                  <button {...props} type="button" className="nas4usb-classic-btn" title="자막">
                    CC
                  </button>
                )}
              />
              {!ios ? (
                <PiPButton
                  className="nas4usb-classic-btn"
                  render={(props) => (
                    <button {...props} type="button" className="nas4usb-classic-btn" title="화면 속 화면">
                      PiP
                    </button>
                  )}
                />
              ) : null}
              <FullscreenButton
                className="nas4usb-classic-btn"
                render={(props, state) => (
                  <button
                    {...props}
                    type="button"
                    className="nas4usb-classic-btn"
                    title={state.isFullscreen ? '전체화면 종료' : '전체화면'}
                  >
                    {state.isFullscreen ? '🮕' : '⛶'}
                  </button>
                )}
              />
            </Controls.Group>
          </div>
        </Controls.Content>
      </Controls.Root>

      <Nas4usbVideoGestures ios={ios} />

      {!ios ? (
        <>
          <Hotkey keys="Space" action="togglePaused" />
          <Hotkey keys="k" action="togglePaused" />
          <Hotkey keys="m" action="toggleMuted" />
          <Hotkey keys="f" action="toggleFullscreen" />
          <Hotkey keys="c" action="toggleSubtitles" />
          <Hotkey keys="i" action="togglePictureInPicture" />
          <Hotkey keys="ArrowLeft" action="seekStep" value={-5} />
          <Hotkey keys="ArrowRight" action="seekStep" value={5} />
          <Hotkey keys="j" action="seekStep" value={-10} />
          <Hotkey keys="l" action="seekStep" value={10} />
        </>
      ) : null}
    </Container>
  );
}
