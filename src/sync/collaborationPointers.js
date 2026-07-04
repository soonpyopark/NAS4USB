const POINTER_FIELD = 'pointer';

/**
 * @param {HTMLElement} element
 * @param {(pointer: { px: number, py: number, visible: boolean }) => void} publish
 * @param {{ throttleMs?: number }} [options]
 */
export function trackLocalPointer(element, publish, { throttleMs = 50 } = {}) {
  if (!element) return () => {};

  let lastSent = 0;

  const emit = (clientX, clientY, visible) => {
    const rect = element.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const inside =
      visible &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    publish({
      visible: inside,
      px: inside ? ((clientX - rect.left) / width) * 100 : 0,
      py: inside ? ((clientY - rect.top) / height) * 100 : 0,
    });
  };

  const onMove = (event) => {
    const now = Date.now();
    if (now - lastSent < throttleMs) return;
    lastSent = now;
    emit(event.clientX, event.clientY, true);
  };

  const onLeave = () => {
    publish({ visible: false, px: 0, py: 0 });
  };

  element.addEventListener('mousemove', onMove, { passive: true });
  element.addEventListener('mouseleave', onLeave);

  return () => {
    element.removeEventListener('mousemove', onMove);
    element.removeEventListener('mouseleave', onLeave);
  };
}

/**
 * @param {import('y-websocket').WebsocketProvider} provider
 * @param {HTMLElement | null | undefined} mountElement
 * @param {{ subscribeLocal?: (publish: (pointer: { px: number, py: number, visible: boolean }) => void) => (() => void) | void }} [options]
 */
export function bindCollaborationPointers(provider, mountElement, options = {}) {
  if (!provider?.awareness || !mountElement) {
    return () => {};
  }

  if (getComputedStyle(mountElement).position === 'static') {
    mountElement.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.className = 'collab-pointer-layer';
  overlay.setAttribute('aria-hidden', 'true');
  mountElement.appendChild(overlay);

  const publishLocal = (pointer) => {
    provider.awareness.setLocalStateField(POINTER_FIELD, pointer);
  };

  const unsubscribeLocal = options.subscribeLocal?.(publishLocal);

  const renderRemotePointers = () => {
    overlay.replaceChildren();
    const localClientId = provider.awareness.clientID;

    provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === localClientId) return;

      const pointer = state[POINTER_FIELD];
      const user = state.user;
      if (!pointer?.visible) return;

      const color = user?.color ?? '#64748b';
      const name = user?.name ?? '협업자';

      const marker = document.createElement('div');
      marker.className = 'collab-remote-pointer';
      marker.style.left = `${pointer.px}%`;
      marker.style.top = `${pointer.py}%`;
      marker.style.setProperty('--collab-color', color);

      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('class', 'collab-remote-arrow');
      arrow.setAttribute('viewBox', '0 0 24 24');
      arrow.setAttribute('width', '18');
      arrow.setAttribute('height', '18');
      arrow.innerHTML =
        '<path fill="currentColor" d="M4 3l14 7.5-6.1.9-2.4 6.1z"/><path fill="#fff" fill-opacity=".35" d="M4 3l14 7.5-6.1.9z"/>';

      const label = document.createElement('span');
      label.className = 'collab-remote-name';
      label.textContent = name;

      marker.append(arrow, label);
      overlay.appendChild(marker);
    });
  };

  provider.awareness.on('change', renderRemotePointers);
  renderRemotePointers();

  return () => {
    if (typeof unsubscribeLocal === 'function') unsubscribeLocal();
    provider.awareness.off('change', renderRemotePointers);
    provider.awareness.setLocalStateField(POINTER_FIELD, null);
    overlay.remove();
  };
}
