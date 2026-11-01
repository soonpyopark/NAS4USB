import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initNas4usb } from './lib/initNas4usb.js';
import { restoreAdminSession } from './hooks/useAdminAuth.js';
import { loadAndApplyAccentColor } from './lib/theme.js';
import { APP_ICON_URL, APP_NAME } from '../shared/constants.js';
import './styles/index.css';

const CSS_RELOAD_KEY = 'nas4usb.cssReloadOnce';

/**
 * Packaged builds load Tailwind via `<link rel="stylesheet" crossorigin>`.
 * On a cold start the first CSS fetch can fail (server race / CORS cache).
 * Reload once when an assets stylesheet never becomes available.
 */
function ensurePackagedStylesheets() {
  if (import.meta.env.DEV) return Promise.resolve();
  const links = [...document.querySelectorAll('link[rel="stylesheet"][href*="assets/"]')];
  if (links.length === 0) return Promise.resolve();

  return Promise.all(
    links.map(
      (link) =>
        new Promise((resolve) => {
          if (link.sheet) {
            resolve(true);
            return;
          }
          const done = (ok) => resolve(ok);
          link.addEventListener('load', () => done(true), { once: true });
          link.addEventListener('error', () => done(false), { once: true });
          window.setTimeout(() => done(Boolean(link.sheet)), 2500);
        }),
    ),
  ).then((results) => {
    if (results.every(Boolean)) {
      try {
        sessionStorage.removeItem(CSS_RELOAD_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      if (!sessionStorage.getItem(CSS_RELOAD_KEY)) {
        sessionStorage.setItem(CSS_RELOAD_KEY, '1');
        window.location.reload();
      }
    } catch {
      /* ignore */
    }
  });
}

const iconSrc = `${import.meta.env.BASE_URL}${APP_ICON_URL.replace(/^\//, '')}`;
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <div className="flex min-h-screen items-center justify-center bg-[#0a1a33] px-6">
    <div className="flex items-center gap-[18px]">
      <img
        className="h-[68px] w-[68px] shrink-0 rounded-[14px] bg-white object-contain"
        src={iconSrc}
        alt=""
      />
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold leading-tight tracking-tight text-white">{APP_NAME}</h1>
        <p className="m-0 text-[11px] text-[#8fa0b8]">연결 중…</p>
      </div>
    </div>
  </div>,
);

void ensurePackagedStylesheets()
  .then(() => initNas4usb())
  // Bind (or discard) the stored session before App mounts, so the very first
  // data fetch already carries the right identity.
  .then(() => restoreAdminSession().catch(() => null))
  .then(() => loadAndApplyAccentColor())
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : '서버에 연결할 수 없습니다.';
    root.render(
      <React.StrictMode>
        <App connectionError={message} />
      </React.StrictMode>,
    );
  });
