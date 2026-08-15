/**
 * Write live edits, then close the editor. If persist throws, the editor stays open.
 *
 * @param {{
 *   closingRef: { current: boolean },
 *   persist?: () => Promise<unknown>,
 *   cleanup?: () => void,
 *   closeWorkspace: () => Promise<unknown>,
 *   onClose: () => void,
 * }} options
 */
export async function persistAndCloseEditor({
  closingRef,
  persist,
  cleanup,
  closeWorkspace,
  onClose,
}) {
  if (closingRef.current) return;
  closingRef.current = true;
  try {
    if (persist) await persist();
    cleanup?.();
    await closeWorkspace();
    onClose();
  } catch {
    closingRef.current = false;
  }
}
