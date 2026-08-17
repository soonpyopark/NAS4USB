/**
 * Video.js remote text tracks: keep the chosen subtitle showing after
 * remounts, HLS reloads, and progress-bar seeks.
 */

/**
 * @param {import('video.js').VideoJsPlayer | null | undefined} player
 * @returns {TextTrack[]}
 */
export function listSubtitleTracks(player) {
  if (!player) return [];
  const tracks = player.textTracks?.();
  if (!tracks) return [];
  /** @type {TextTrack[]} */
  const list = [];
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    if (track.kind === 'subtitles' || track.kind === 'captions') list.push(track);
  }
  return list;
}

/**
 * @param {import('video.js').VideoJsPlayer | null | undefined} player
 * @returns {string | null} showing label, '' if user turned subtitles off, null if none yet
 */
export function readShowingSubtitleLabel(player) {
  const tracks = listSubtitleTracks(player);
  if (tracks.length === 0) return null;
  const showing = tracks.find((track) => track.mode === 'showing');
  return showing ? showing.label || 'on' : '';
}

/**
 * @param {import('video.js').VideoJsPlayer | null | undefined} player
 * @param {string | null | undefined} preferredLabel
 */
export function applyShowingSubtitle(player, preferredLabel) {
  const tracks = listSubtitleTracks(player);
  if (tracks.length === 0) return;
  if (preferredLabel === '') {
    for (const track of tracks) track.mode = 'disabled';
    return;
  }
  const match = preferredLabel
    ? tracks.find((track) => track.label === preferredLabel)
    : null;
  const show = match || tracks[0];
  for (const track of tracks) {
    track.mode = track === show ? 'showing' : 'disabled';
  }
}

/**
 * Chromium often keeps the last cue (or none) after a seek until mode flips.
 * @param {import('video.js').VideoJsPlayer | null | undefined} player
 */
export function refreshShowingSubtitles(player) {
  const tracks = listSubtitleTracks(player);
  const showing = tracks.filter((track) => track.mode === 'showing');
  if (showing.length === 0) return;
  for (const track of showing) track.mode = 'hidden';
  window.requestAnimationFrame(() => {
    if (!player || player.isDisposed?.()) return;
    for (const track of showing) {
      if (track.mode === 'disabled') continue;
      track.mode = 'showing';
    }
  });
}

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {Array<{ src: string, label: string }>} tracks
 * @param {string | null | undefined} preferredLabel
 */
export function replaceRemoteSubtitles(player, tracks, preferredLabel) {
  const existing = player.remoteTextTracks?.();
  if (existing) {
    for (let i = existing.length - 1; i >= 0; i -= 1) {
      player.removeRemoteTextTrack(existing[i]);
    }
  }

  const handles = tracks.map((track, index) =>
    player.addRemoteTextTrack(
      {
        kind: 'subtitles',
        src: track.src,
        srclang: 'ko',
        label: track.label,
        default: preferredLabel == null ? index === 0 : track.label === preferredLabel,
      },
      false,
    ),
  );

  const show = () => applyShowingSubtitle(player, preferredLabel);
  show();
  window.setTimeout(show, 80);
  window.setTimeout(show, 400);

  for (const handle of handles) {
    const el = handle?.track || handle;
    if (!el || typeof el.addEventListener !== 'function') continue;
    el.addEventListener('load', show);
    el.addEventListener('loadeddata', show);
  }
}
