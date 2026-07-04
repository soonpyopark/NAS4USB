/**
 * EduCowork iframe embed — CDN/SW 없이 WASM만 빠르게 초기화.
 * ?embed=1 쿼리가 있을 때만 동작한다.
 */
(function initRhwpEmbed() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('embed')) return;

  // 이전 PWA Service Worker가 WASM/에셋 로드를 가로채면 초기화가 멈출 수 있다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }
  if ('caches' in window) {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }

  const offlineSettings = { disableExternalWebFonts: true };

  function storageGet(_keys, callback) {
    if (typeof callback === 'function') callback(offlineSettings);
    return Promise.resolve(offlineSettings);
  }

  window.chrome = {
    storage: {
      sync: { get: storageGet },
      local: { get: storageGet },
    },
  };

  document.documentElement.className += ' rhwp-embed-mode';

  function injectEmbedLayoutStyles() {
    if (document.getElementById('rhwp-embed-layout')) return;

    const style = document.createElement('style');
    style.id = 'rhwp-embed-layout';
    style.textContent = `
      html.rhwp-embed-mode,
      html.rhwp-embed-mode body {
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }
      html.rhwp-embed-mode #studio-root.rhwp-embed {
        height: 100%;
        min-height: 0;
      }
      html.rhwp-embed-mode #editor-area {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
      }
      html.rhwp-embed-mode #ruler-corner,
      html.rhwp-embed-mode #h-ruler,
      html.rhwp-embed-mode #v-ruler {
        display: none !important;
      }
      html.rhwp-embed-mode #scroll-container {
        grid-column: 1;
        grid-row: 1;
        min-height: 0;
      }
      html.rhwp-embed-mode #icon-toolbar,
      html.rhwp-embed-mode #style-bar {
        display: flex !important;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  function hideChrome() {
    for (const id of ['menu-bar', 'status-bar', 'h-ruler', 'v-ruler', 'ruler-corner']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    const root = document.getElementById('studio-root');
    if (root) root.classList.add('rhwp-embed');
    injectEmbedLayoutStyles();
  }

  function clickConfirmButton(root) {
    const buttons = root.querySelectorAll('button');
    for (const button of buttons) {
      const label = button.textContent?.trim() ?? '';
      if (label === '확인') {
        button.click();
        return true;
      }
    }
    return false;
  }

  /** 문서가 로드된 뒤 뷰포트·줌을 재계산해 빈 회색 화면을 방지한다. */
  function refreshDocumentView() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      const fitWidth = document.getElementById('sb-zoom-fit-width');
      const fitPage = document.getElementById('sb-zoom-fit');
      if (fitWidth instanceof HTMLButtonElement) {
        fitWidth.click();
      } else if (fitPage instanceof HTMLButtonElement) {
        fitPage.click();
      }
    });
  }

  function scheduleViewRefresh() {
    for (const delay of [0, 120, 400, 1000]) {
      window.setTimeout(refreshDocumentView, delay);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'rhwp-embed-refresh') {
      scheduleViewRefresh();
    }
  });

  /** embed 모드: 차단용 모달·토스트를 자동으로 닫는다. */
  function autoDismissEmbedUi() {
    const handledModals = new WeakSet();

    const tryDismiss = () => {
      const toastContainer = document.getElementById('rhwp-toast-container');
      if (toastContainer) {
        for (const toast of toastContainer.children) {
          if (!(toast instanceof HTMLElement)) continue;
          clickConfirmButton(toast);
        }
      }

      const overlays = document.querySelectorAll('.modal-overlay');
      for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement) || handledModals.has(overlay)) continue;

        const footer = overlay.querySelector('.dialog-footer');
        if (!footer) continue;

        const buttons = footer.querySelectorAll('.dialog-btn, button');
        for (const button of buttons) {
          const label = button.textContent?.trim() ?? '';
          if (label.includes('그대로 보기') || label.includes('대체 글꼴') || label === '확인') {
            handledModals.add(overlay);
            button.click();
            return;
          }
        }
      }
    };

    const observer = new MutationObserver(tryDismiss);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(tryDismiss, 250);
  }

  function bindPointerBroadcast() {
    if (window.parent === window) return;

    const target = document.documentElement;
    let lastSent = 0;

    const publish = (visible, clientX, clientY) => {
      const rect = target.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      const inside =
        visible &&
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      window.parent.postMessage(
        {
          type: 'rhwp-pointer',
          visible: inside,
          px: inside ? ((clientX - rect.left) / width) * 100 : 0,
          py: inside ? ((clientY - rect.top) / height) * 100 : 0,
        },
        '*',
      );
    };

    document.addEventListener(
      'mousemove',
      (event) => {
        const now = Date.now();
        if (now - lastSent < 50) return;
        lastSent = now;
        publish(true, event.clientX, event.clientY);
      },
      { passive: true },
    );

    document.addEventListener('mouseleave', () => {
      window.parent.postMessage({ type: 'rhwp-pointer', visible: false, px: 0, py: 0 }, '*');
    });
  }

  function bootEmbed() {
    hideChrome();
    autoDismissEmbedUi();
    bindPointerBroadcast();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEmbed, { once: true });
  } else {
    bootEmbed();
  }
})();
