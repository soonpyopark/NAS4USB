import { DEFAULT_SYNC_PORT } from '../../shared/constants.js';
import { formatAccessUrl, isHttpsEnabledFromPage } from '../../shared/httpsConfig.js';
import { loadSyncHost } from './syncHost.js';

function isLoopbackHost(host) {
  const value = String(host ?? '').trim().toLowerCase();
  return !value || value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

function isLinkLocalHost(host) {
  return String(host ?? '').startsWith('169.254.');
}

function pickShareLinkHost(syncInfo) {
  const configured = loadSyncHost();
  if (configured && !isLinkLocalHost(configured)) return configured;

  const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
  if (pageHost && !isLoopbackHost(pageHost) && !isLinkLocalHost(pageHost)) return pageHost;

  const lanHost = (syncInfo?.addresses ?? []).find(
    (address) => address && !isLinkLocalHost(address) && !isLoopbackHost(address),
  );
  if (lanHost) return lanHost;

  return pageHost || '127.0.0.1';
}

/**
 * @param {string} token
 * @param {{ port?: number, addresses?: string[], https?: boolean } | null | undefined} syncInfo
 */
export function buildShareLinkUrl(token, syncInfo) {
  const host = pickShareLinkHost(syncInfo);
  const port = syncInfo?.port ?? Number(window.location.port || DEFAULT_SYNC_PORT);
  return `${formatAccessUrl(host, port, isHttpsEnabledFromPage(syncInfo))}/?share=${encodeURIComponent(token)}`;
}

/**
 * @param {string} text
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      window.focus?.();
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Clipboard API can fail when an iframe still holds focus.
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('clipboard copy failed');
}
