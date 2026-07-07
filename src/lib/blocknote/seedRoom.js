import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYXmlFragment } from '@blocknote/core/yjs';

export const BLOCKNOTE_FRAGMENT = 'blocknote';
const SEED_ORIGIN = 'block-seed';

/**
 * @param {import('yjs').Map<string, unknown>} meta
 * @param {string} diskRevision
 */
function shouldPreferDiskContent(meta, diskRevision) {
  if (!diskRevision) return false;
  const snapshotRevision = meta.get(`${BLOCKNOTE_FRAGMENT}:diskRevision`);
  if (typeof snapshotRevision !== 'string' || !snapshotRevision) return false;
  return diskRevision > snapshotRevision;
}

/**
 * @param {import('yjs').XmlFragment} fragment
 */
function clearXmlFragment(fragment) {
  while (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }
}

/**
 * Seed the Yjs XmlFragment from disk when the room is empty or disk is newer.
 *
 * @param {import('yjs').Doc} ydoc
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 * @param {{ diskRevision?: string }} [options]
 * @returns {boolean} whether seeding ran
 */
export function seedBlocknoteRoomFromDisk(ydoc, blocks, { diskRevision = '' } = {}) {
  const meta = ydoc.getMap('meta');
  const fragment = ydoc.getXmlFragment(BLOCKNOTE_FRAGMENT);
  const preferDisk = shouldPreferDiskContent(meta, diskRevision);
  const fragmentEmpty = fragment.length === 0;

  if (!preferDisk && !fragmentEmpty) return false;
  if (!preferDisk && meta.get(`${BLOCKNOTE_FRAGMENT}:seeded`)) return false;

  const initialBlocks =
    Array.isArray(blocks) && blocks.length > 0
      ? blocks
      : [{ type: 'paragraph', content: '' }];

  ydoc.transact(() => {
    if (!fragmentEmpty) {
      clearXmlFragment(fragment);
    }

    const editor = BlockNoteEditor.create({ initialContent: initialBlocks });
    blocksToYXmlFragment(editor, editor.document, fragment);
    meta.set(`${BLOCKNOTE_FRAGMENT}:seeded`, true);
    if (diskRevision) {
      meta.set(`${BLOCKNOTE_FRAGMENT}:diskRevision`, diskRevision);
    }
  }, SEED_ORIGIN);

  return true;
}

/**
 * @param {import('yjs').Doc} ydoc
 * @param {string} diskRevision
 */
export function setBlocknoteDiskRevision(ydoc, diskRevision) {
  if (!diskRevision) return;
  ydoc.getMap('meta').set(`${BLOCKNOTE_FRAGMENT}:diskRevision`, diskRevision);
}
