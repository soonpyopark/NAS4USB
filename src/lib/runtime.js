/**
 * EduCowork API(Electron preload 또는 HTTP 클라이언트) 사용 가능 여부.
 */
export function hasEducoworkApi() {
  return Boolean(window.educowork?.getPaths && window.educowork?.fs?.readDir);
}

/** Electron preload로 주입된 렌더러인지 확인합니다. */
export function isElectronRenderer() {
  return hasEducoworkApi() && window.educowork?.__source !== 'http';
}

/** 브라우저에서 HTTP API로 연결된 클라이언트인지 확인합니다. */
export function isBrowserClient() {
  return hasEducoworkApi() && window.educowork?.__source === 'http';
}
