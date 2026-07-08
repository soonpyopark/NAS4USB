/**
 * NAS4USB iframe embed — CDN/SW 없이 WASM만 빠르게 초기화.
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
      html.rhwp-embed-mode #status-bar {
        display: flex !important;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  function hideChrome() {
    // 상단 메뉴바·눈금자만 숨기고, 하단 상태바(쪽/줌)는 온라인 데모와 동일하게 유지
    for (const id of ['menu-bar', 'h-ruler', 'v-ruler', 'ruler-corner']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.style.display = '';
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

  /** 편집용 대화상자 — 자동 닫기 금지 */
  function isProtectedEditorDialog(overlay) {
    if (overlay.querySelector('.tcp-dialog')) return true;
    const title = overlay.querySelector('.dialog-title')?.textContent?.trim() ?? '';
    if (!title) return false;
    if (title === '표/셀 속성') return true;
    if (title.endsWith('속성') || title.endsWith('모양')) return true;
    if (title === '저장 확인' || title === '문서 복구') return false;
    return false;
  }

  /** 문서 로드·초기화를 막는 확인 대화상자의 "건너뛰기" 버튼 */
  function findEmbedSkipButton(overlay) {
    const skipLabels = ['그대로 보기', '대체 글꼴', '나중에'];
    const buttons = overlay.querySelectorAll('button');
    for (const prefer of skipLabels) {
      for (const button of buttons) {
        const label = button.textContent?.trim() ?? '';
        if (label.includes(prefer)) return button;
      }
    }
    return null;
  }

  /** embed 모드: 문서 로드 차단용(글꼴/HWPX 경고·복구) 모달·토스트만 자동으로 닫는다. */
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
        if (isProtectedEditorDialog(overlay)) continue;

        const skipButton = findEmbedSkipButton(overlay);
        if (!skipButton) continue;

        handledModals.add(overlay);
        skipButton.click();
        return;
      }
    };

    const observer = new MutationObserver(tryDismiss);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(tryDismiss, 100);

    // loadFile 요청 직후 모달이 뜨면 즉시 닫기 (Wh → ym/Sm 대기 해제)
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (data?.type !== 'rhwp-request' || data.method !== 'loadFile') return;
      for (const delay of [0, 16, 50, 120, 250, 500, 1000]) {
        window.setTimeout(tryDismiss, delay);
      }
    });
  }

  /** 부모 UI에 rhwp-studio 초기화 상태를 전달한다. */
  function publishInitStatus() {
    if (window.parent === window) return;

    const statusEl = document.getElementById('sb-message');
    if (!statusEl) return;

    const publish = () => {
      const text = statusEl.textContent?.trim();
      if (!text) return;
      window.parent.postMessage({ type: 'rhwp-embed-status', text }, '*');
    };

    publish();
    const observer = new MutationObserver(publish);
    observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
  }

  function bootEmbed() {
    hideChrome();
    autoDismissEmbedUi();
    publishInitStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEmbed, { once: true });
  } else {
    bootEmbed();
  }
})();
