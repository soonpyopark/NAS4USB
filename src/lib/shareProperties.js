import { setShareLinkForEntry, revokeShareLinkForEntry } from './shareLinkActions.js';
import { SHARE_LINK_MODE_EDIT, SHARE_LINK_MODE_VIEW } from '../../shared/shareLinkModes.js';

/**
 * @param {{
 *   entry: { relativePath: string, name?: string, isDirectory?: boolean },
 *   mode: 'view' | 'edit',
 *   syncInfo: { port?: number, addresses?: string[] } | null | undefined,
 *   shareMap: Record<string, { token?: string, mode?: string }>,
 *   refreshShareMap: () => Promise<void>,
 * }} options
 */
export async function enableShareLinkForEntry({ entry, mode, syncInfo, shareMap, refreshShareMap }) {
  return setShareLinkForEntry({ entry, mode, syncInfo, shareMap, refreshShareMap });
}

/**
 * @param {{
 *   entry: { relativePath: string, name?: string, isDirectory?: boolean },
 *   checked: boolean,
 *   mode: 'view' | 'edit',
 *   syncInfo: { port?: number, addresses?: string[] } | null | undefined,
 *   shareMap: Record<string, { token?: string, mode?: string }>,
 *   refreshShareMap: () => Promise<void>,
 * }} options
 */
export async function handleShareModeToggle({
  entry,
  checked,
  mode,
  syncInfo,
  shareMap,
  refreshShareMap,
}) {
  if (checked) {
    return enableShareLinkForEntry({ entry, mode, syncInfo, shareMap, refreshShareMap });
  }

  await revokeShareLinkForEntry({ entry, refreshShareMap });
  return null;
}

export { SHARE_LINK_MODE_EDIT, SHARE_LINK_MODE_VIEW };
