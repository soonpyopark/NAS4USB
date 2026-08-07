import { DEFAULT_SYNC_PORT } from '../../shared/constants.js';
import { loadSyncHost } from './syncHost.js';

/**
 * @param {string} token
 * @param {{ port?: number, addresses?: string[] } | null | undefined} syncInfo
 */
export function buildShareLinkUrl(token, syncInfo) {
  const host = loadSyncHost() || syncInfo?.addresses?.[0] || window.location.hostname || '127.0.0.1';
  const port = syncInfo?.port ?? Number(window.location.port || DEFAULT_SYNC_PORT);
  return `http://${host}:${port}/?share=${encodeURIComponent(token)}`;
}

/**
 * @param {string} text
 */
export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
