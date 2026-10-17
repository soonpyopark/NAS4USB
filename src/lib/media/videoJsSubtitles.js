/**
 * Native text tracks on the media element (Video.js 10).
 * Keep the chosen subtitle showing after remounts, HLS reloads, and seeks.
 */

/**
 * @param {HTMLMediaElement | null | undefined} media
 * @returns {TextTrack[]}
 */
export function listSubtitleTracks(media) {
  if (!media?.textTracks) return [];
  const tracks = media.textTracks;
  /** @type {TextTrack[]} */
  const list = [];
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    if (track.kind === 'subtitles' || track.kind === 'captions') list.push(track);
  }
  return list;
}

/**
 * @param {HTMLMediaElement | null | undefined} media
 * @returns {string | null} showing label, '' if user turned subtitles off, null if none yet
 */
export function readShowingSubtitleLabel(media) {
  const tracks = listSubtitleTracks(media);
  if (tracks.length === 0) return null;
  const showing = tracks.find((track) => track.mode === 'showing');
  return showing ? showing.label || 'on' : '';
}

/**
 * @param {HTMLMediaElement | null | undefined} media
 * @param {string | null | undefined} preferredLabel
 */
export function applyShowingSubtitle(media, preferredLabel) {
  const tracks = listSubtitleTracks(media);
  if (tracks.length === 0) return;
  if (preferredLabel === '') {
    for (const track of tracks) track.mode = 'disabled';
    return;
  }
  const match = preferredLabel ? tracks.find((track) => track.label === preferredLabel) : null;
  const show = match || tracks[0];
  for (const track of tracks) {
    track.mode = track === show ? 'showing' : 'disabled';
  }
}

/**
 * Chromium often keeps the last cue (or none) after a seek until mode flips.
 * @param {HTMLMediaElement | null | undefined} media
 */
export function refreshShowingSubtitles(media) {
  const tracks = listSubtitleTracks(media);
  const showing = tracks.filter((track) => track.mode === 'showing');
  if (showing.length === 0) return;
  for (const track of showing) track.mode = 'hidden';
  window.requestAnimationFrame(() => {
    if (!media || !media.isConnected) return;
    for (const track of showing) {
      if (track.mode === 'disabled') continue;
      track.mode = 'showing';
    }
  });
}

/**
 * Replace `<track>` children on the media element.
 * @param {HTMLMediaElement} media
 * @param {Array<{ src: string, label: string }>} tracks
 * @param {string | null | undefined} preferredLabel
 */
export function replaceRemoteSubtitles(media, tracks, preferredLabel) {
  const existing = media.querySelectorAll('track[data-nas4usb-sub="1"]');
  for (const node of existing) node.remove();

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const el = document.createElement('track');
    el.kind = 'subtitles';
    el.src = track.src;
    el.srclang = 'ko';
    el.label = track.label;
    el.dataset.nas4usbSub = '1';
    const shouldDefault = preferredLabel == null ? index === 0 : track.label === preferredLabel;
    if (shouldDefault) el.default = true;
    media.appendChild(el);
  }

  const show = () => applyShowingSubtitle(media, preferredLabel);
  show();
  window.setTimeout(show, 80);
  window.setTimeout(show, 400);
}
