import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { TIPTAP_FRAGMENT } from './constants.js';
import { createEmptyTiptapDoc, isTiptapDoc } from './document.js';
import { createTiptapExtensions } from './extensions.js';
import { collectTiptapColorKeys, normalizeTiptapTextMarks } from './textMarks.js';

export { TIPTAP_FRAGMENT } from './constants.js';
const SEED_ORIGIN = 'tiptap-seed';

/** Structural nodes that history/disk may contain but a stale Yjs room can drop. */
const IMPORTANT_NODE_TYPES = new Set([
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'image',
  'video',
  'audio',
  'fileAttachment',
  'youtube',
  'inlineMath',
  'blockMath',
  'taskList',
  'taskItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'details',
  'emoji',
]);

/**
 * @param {import('yjs').Map<string, unknown>} meta
 * @param {string} diskRevision
 */
function shouldPreferDiskContent(meta, diskRevision) {
  if (!diskRevision) return false;
  const snapshotRevision = meta.get(`${TIPTAP_FRAGMENT}:diskRevision`);
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
 * @param {import('@tiptap/core').JSONContent | null | undefined} node
 * @param {Set<string>} [into]
 */
function collectNodeTypes(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into;
  if (typeof node.type === 'string') into.add(node.type);
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectNodeTypes(child, into);
  }
  return into;
}

/**
 * True when disk JSON has important blocks (e.g. tables) missing from the live fragment.
 * This is the usual cause of "history shows a table, live editor does not".
 *
 * @param {import('@tiptap/core').Schema} schema
 * @param {import('@tiptap/core').JSONContent} diskJson
 * @param {import('yjs').XmlFragment} fragment
 */
/**
 * True when disk JSON has text/highlight colors the live Yjs room dropped.
 * Same class of bug as missing tables: backup has the marks, the room does not.
 *
 * @param {import('@tiptap/core').Schema} schema
 * @param {import('@tiptap/core').JSONContent} diskJson
 * @param {import('yjs').XmlFragment} fragment
 */
function fragmentMissingDiskMarks(schema, diskJson, fragment) {
  const diskColors = collectTiptapColorKeys(diskJson);
  if (diskColors.size === 0) return false;
  if (fragment.length === 0) return true;

  try {
    const liveJson = yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON();
    const liveColors = collectTiptapColorKeys(liveJson);
    return [...diskColors].some((key) => !liveColors.has(key));
  } catch {
    return true;
  }
}

/**
 * @param {import('@tiptap/core').Schema} schema
 * @param {import('@tiptap/core').JSONContent} diskJson
 * @param {import('yjs').XmlFragment} fragment
 */
function fragmentMissingDiskNodes(schema, diskJson, fragment) {
  const diskTypes = collectNodeTypes(diskJson);
  const needed = [...IMPORTANT_NODE_TYPES].filter((type) => diskTypes.has(type));
  if (needed.length === 0) return false;
  if (fragment.length === 0) return true;

  try {
    const liveJson = yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON();
    const liveTypes = collectNodeTypes(liveJson);
    return needed.some((type) => !liveTypes.has(type));
  } catch {
    return true;
  }
}

function createSeedSchema() {
  // Schema without Collaboration / React node views — seeding only needs node types.
  return getSchema(
    createTiptapExtensions({
      collaboration: null,
      includeImageNodeView: false,
      includeMediaNodeView: false,
      enableSuggestionUi: false,
    }),
  );
}

/**
 * Seed the Yjs XmlFragment from disk when the room is empty, disk is newer,
 * or the live room is missing structural nodes that exist on disk (e.g. tables).
 *
 * @param {import('yjs').Doc} ydoc
 * @param {import('@tiptap/core').JSONContent} content
 * @param {{ diskRevision?: string, force?: boolean }} [options]
 * @returns {boolean}
 */
export function seedTiptapRoomFromDisk(ydoc, content, { diskRevision = '', force = false } = {}) {
  const meta = ydoc.getMap('meta');
  const fragment = ydoc.getXmlFragment(TIPTAP_FRAGMENT);
  const preferDisk = force || shouldPreferDiskContent(meta, diskRevision);
  const fragmentEmpty = fragment.length === 0;
  const docJson = normalizeTiptapTextMarks(isTiptapDoc(content) ? content : createEmptyTiptapDoc());
  const schema = createSeedSchema();

  let shouldSeed = preferDisk || fragmentEmpty;
  if (!shouldSeed) {
    if (!meta.get(`${TIPTAP_FRAGMENT}:seeded`)) {
      shouldSeed = true;
    } else if (
      fragmentMissingDiskNodes(schema, docJson, fragment) ||
      fragmentMissingDiskMarks(schema, docJson, fragment)
    ) {
      shouldSeed = true;
    }
  }

  if (!shouldSeed) return false;

  ydoc.transact(() => {
    if (fragment.length > 0) {
      clearXmlFragment(fragment);
    }
    prosemirrorJSONToYXmlFragment(schema, docJson, fragment);
    meta.set(`${TIPTAP_FRAGMENT}:seeded`, true);
    if (diskRevision) {
      meta.set(`${TIPTAP_FRAGMENT}:diskRevision`, diskRevision);
    }
  }, SEED_ORIGIN);

  return true;
}

/**
 * @param {import('yjs').Doc} ydoc
 * @param {string} diskRevision
 */
export function setTiptapDiskRevision(ydoc, diskRevision) {
  if (!diskRevision) return;
  ydoc.getMap('meta').set(`${TIPTAP_FRAGMENT}:diskRevision`, diskRevision);
}
