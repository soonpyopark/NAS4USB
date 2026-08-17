import { EXTERNAL_FOLDER, SHARED_FOLDER } from '../../../shared/constants.js';
import { HOMES_FOLDER } from '../../../shared/memberHomes.js';
import { isTiptapDocumentRelativePath } from '../../../shared/tiptapAssetPaths.js';
import { entryExtensionOf } from '../filePassword/secPaths.js';
import { readWorkspacePlainBase64 } from '../filePassword/io.js';
import { getParentPath } from '../fsPaths.js';
import { isExternalHttpUrl } from '../openExternal.js';
import { parseTiptapFileBase64 } from './package.js';

export const NAS4USB_LINK_SCHEME = 'nas4usb:/';

const ANCHOR_NODE_LABELS = {
  heading: '제목',
  paragraph: '문단',
  blockquote: '인용',
  pullQuote: '풀 인용',
  codeBlock: '코드',
  listItem: '목록',
  taskItem: '할 일',
  details: '접기',
};

/**
 * @param {string} relativePath
 */
export function normalizeWorkspaceLinkPath(relativePath) {
  return String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * @param {string} relativePath
 * @param {string} [id]
 */
export function formatWorkspaceLink(relativePath, id = '') {
  const parts = normalizeWorkspaceLinkPath(relativePath).split('/').filter(Boolean);
  const encoded = parts.map((part) => encodeURIComponent(part)).join('/');
  const hash = id ? `#${encodeURIComponent(String(id))}` : '';
  return `${NAS4USB_LINK_SCHEME}${encoded}${hash}`;
}

/**
 * @param {string} id
 */
export function formatDocAnchorLink(id) {
  return `#${encodeURIComponent(String(id ?? ''))}`;
}

/**
 * @param {string} href
 * @returns {{
 *   kind: 'anchor' | 'workspace' | 'external' | 'unknown',
 *   href: string,
 *   id?: string | null,
 *   relativePath?: string,
 *   url?: string,
 * }}
 */
export function parseWorkspaceLink(href) {
  const raw = String(href ?? '').trim();
  if (!raw) return { kind: 'unknown', href: raw };

  if (raw.startsWith('#')) {
    let id = raw.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep
    }
    return { kind: 'anchor', href: raw, id: id || null };
  }

  if (isExternalHttpUrl(raw)) {
    return { kind: 'external', href: raw, url: raw };
  }

  if (/^nas4usb:/i.test(raw)) {
    const afterScheme = raw.replace(/^nas4usb:\/*/i, '');
    const hashAt = afterScheme.indexOf('#');
    const pathPart = hashAt >= 0 ? afterScheme.slice(0, hashAt) : afterScheme;
    const hashPart = hashAt >= 0 ? afterScheme.slice(hashAt + 1) : '';
    let relativePath = pathPart;
    let id = hashPart;
    try {
      relativePath = pathPart
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part))
        .join('/');
    } catch {
      relativePath = pathPart.replace(/^\/+/, '');
    }
    try {
      id = hashPart ? decodeURIComponent(hashPart) : '';
    } catch {
      // keep
    }
    return {
      kind: 'workspace',
      href: raw,
      relativePath: normalizeWorkspaceLinkPath(relativePath),
      id: id || null,
    };
  }

  return { kind: 'unknown', href: raw };
}

/**
 * @param {string} href
 * @param {string} currentPath
 */
export function isSameDocumentWorkspaceLink(href, currentPath) {
  const parsed = parseWorkspaceLink(href);
  if (parsed.kind === 'anchor') return true;
  if (parsed.kind !== 'workspace') return false;
  return normalizeWorkspaceLinkPath(parsed.relativePath) === normalizeWorkspaceLinkPath(currentPath);
}

/**
 * @param {import('@tiptap/core').JSONContent | null | undefined} node
 * @param {number} [pos]
 * @returns {Array<{ id: string, type: string, text: string, pos: number, level: number }>}
 */
export function collectAnchorsFromJson(node, pos = 0) {
  /** @type {Array<{ id: string, type: string, text: string, pos: number, level: number }>} */
  const items = [];
  if (!node || typeof node !== 'object') return items;
  const id = typeof node.attrs?.id === 'string' ? node.attrs.id.trim() : '';
  if (id && node.type && node.type !== 'doc' && node.type !== 'text') {
    const text = String(node.content ? flattenJsonText(node) : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (text || node.type !== 'paragraph') {
      items.push({
        id,
        type: node.type,
        text: text || ANCHOR_NODE_LABELS[node.type] || node.type,
        pos,
        level: node.type === 'heading' ? Number(node.attrs?.level) || 1 : 0,
      });
    }
  }
  const children = Array.isArray(node.content) ? node.content : [];
  let nextPos = pos + 1;
  for (const child of children) {
    items.push(...collectAnchorsFromJson(child, nextPos));
    nextPos += jsonNodeSize(child);
  }
  return items;
}

/**
 * @param {import('@tiptap/core').JSONContent} node
 */
function flattenJsonText(node) {
  if (node.type === 'text') return String(node.text ?? '');
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => flattenJsonText(child)).join('');
}

/**
 * @param {import('@tiptap/core').JSONContent} node
 */
function jsonNodeSize(node) {
  if (node.type === 'text') return String(node.text ?? '').length;
  const children = Array.isArray(node.content) ? node.content : [];
  return 1 + children.reduce((sum, child) => sum + jsonNodeSize(child), 0) + 1;
}

/**
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 */
export function listEditorAnchors(editor) {
  if (!editor || editor.isDestroyed) return [];
  /** @type {Array<{ id: string, type: string, text: string, pos: number, level: number }>} */
  const items = [];
  editor.state.doc.descendants((node, pos) => {
    const id = typeof node.attrs?.id === 'string' ? node.attrs.id.trim() : '';
    if (!id) return;
    const text = node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!text && node.type.name === 'paragraph') return;
    items.push({
      id,
      type: node.type.name,
      text: text || ANCHOR_NODE_LABELS[node.type.name] || node.type.name,
      pos,
      level: node.type.name === 'heading' ? Number(node.attrs.level) || 1 : 0,
    });
  });
  return items;
}

/**
 * @param {string} relativePath
 */
export async function listTiptapFileAnchors(relativePath) {
  if (!isTiptapDocumentRelativePath(relativePath)) return [];
  const base64 = await readWorkspacePlainBase64(relativePath);
  const parsed = await parseTiptapFileBase64(base64);
  return collectAnchorsFromJson(parsed.content);
}

/**
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @param {string} id
 */
export function jumpToTiptapAnchor(editor, id) {
  const target = String(id ?? '').trim();
  if (!editor || editor.isDestroyed || !target) return false;
  let found = /** @type {{ pos: number } | null} */ (null);
  editor.state.doc.descendants((node, pos) => {
    if (String(node.attrs?.id ?? '') === target) {
      found = { pos };
      return false;
    }
    return undefined;
  });
  if (!found) return false;
  editor.chain().focus().setTextSelection(found.pos + 1).run();
  const dom = editor.view.nodeDOM(found.pos);
  const el = dom instanceof HTMLElement ? dom : null;
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  if (el) {
    el.classList.add('tiptap-anchor-flash');
    window.setTimeout(() => el.classList.remove('tiptap-anchor-flash'), 1400);
  }
  return true;
}

/**
 * Ensure the block around the cursor has a UniqueID, then return it.
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @returns {{ id: string, type: string, pos: number } | null}
 */
export function ensureAnchorAtSelection(editor) {
  if (!editor || editor.isDestroyed) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (!node?.type || !('id' in (node.attrs ?? {}))) continue;
    const pos = $from.before(depth);
    let id = typeof node.attrs.id === 'string' ? node.attrs.id.trim() : '';
    if (!id) {
      id = crypto.randomUUID();
      editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
          return true;
        })
        .run();
    }
    return { id, type: node.type.name, pos };
  }
  return null;
}

/**
 * Workspace root and the three system folders are not file-link destinations.
 * @param {string} relativePath
 */
export function isWorkspaceLinkSystemFolder(relativePath) {
  const normalized = normalizeWorkspaceLinkPath(relativePath);
  return (
    !normalized ||
    normalized === '.' ||
    normalized === SHARED_FOLDER ||
    normalized === HOMES_FOLDER ||
    normalized === EXTERNAL_FOLDER
  );
}

/**
 * Tree ceiling for the file-link picker. Stays inside the current
 * 공유폴더 / 개인폴더 홈 / 외부폴더 마운트. Workspace root is not allowed.
 * @param {string} relativePath
 */
export function workspaceLinkBrowseRoot(relativePath) {
  let folder = normalizeWorkspaceLinkPath(relativePath);
  const last = folder.split('/').pop() || '';
  if (last.includes('.') && getParentPath(folder) && getParentPath(folder) !== '.') {
    folder = getParentPath(folder);
  }
  const parts = folder.split('/').filter(Boolean);
  if (parts[0] === SHARED_FOLDER) return SHARED_FOLDER;
  if (parts[0] === HOMES_FOLDER && parts[1]) return `${HOMES_FOLDER}/${parts[1]}`;
  if (parts[0] === EXTERNAL_FOLDER && parts[1]) return `${EXTERNAL_FOLDER}/${parts[1]}`;
  if (parts[0] && !isWorkspaceLinkSystemFolder(parts[0])) return parts[0];
  return '';
}

/**
 * @param {string} relativePath
 */
export function workspaceLinkBrowseLabel(relativePath) {
  const path = normalizeWorkspaceLinkPath(relativePath);
  if (!path || isWorkspaceLinkSystemFolder(path)) return '1레벨';
  const root = workspaceLinkBrowseRoot(path);
  if (path === root) return '1레벨';
  return path;
}

/**
 * @param {string} relativePath
 * @param {string} rootPath
 */
export function isWithinWorkspaceLinkBrowseRoot(relativePath, rootPath) {
  const path = normalizeWorkspaceLinkPath(relativePath);
  const root = normalizeWorkspaceLinkPath(rootPath);
  if (!root) return !isWorkspaceLinkSystemFolder(path);
  return path === root || path.startsWith(`${root}/`);
}

/**
 * @param {string} relativePath
 * @param {string} documentPath
 */
export function clampWorkspaceBrowsePath(relativePath, documentPath) {
  const path = normalizeWorkspaceLinkPath(relativePath);
  const hint = isWorkspaceLinkSystemFolder(path) ? documentPath : path;
  const root = workspaceLinkBrowseRoot(hint) || workspaceLinkBrowseRoot(documentPath);
  if (root && isWithinWorkspaceLinkBrowseRoot(path, root)) return path;
  if (root) return root;
  if (!isWorkspaceLinkSystemFolder(path)) return path;
  return '';
}

/**
 * @param {string} currentPath
 */
export function defaultWorkspaceBrowsePath(currentPath) {
  const parent = getParentPath(currentPath);
  return clampWorkspaceBrowsePath(parent, currentPath);
}

/**
 * @param {string} relativePath
 */
export function isTiptapLinkTarget(relativePath) {
  return isTiptapDocumentRelativePath(relativePath);
}

/**
 * @param {string} relativePath
 */
export function workspaceLinkFileLabel(relativePath) {
  const base = normalizeWorkspaceLinkPath(relativePath).split('/').pop() || relativePath;
  return base;
}

/**
 * Short label when pasting a workspace / in-doc location link.
 * @param {{ kind: string, relativePath?: string, id?: string | null }} parsed
 * @param {string} [currentPath]
 */
export function workspaceLinkDisplayLabel(parsed, currentPath = '') {
  if (parsed?.kind === 'anchor') return '문서 위치';
  if (parsed?.kind !== 'workspace' || !parsed.relativePath) return '';
  const name = workspaceLinkFileLabel(parsed.relativePath).replace(/\.tiptap$/i, '');
  if (
    currentPath &&
    normalizeWorkspaceLinkPath(parsed.relativePath) === normalizeWorkspaceLinkPath(currentPath)
  ) {
    return parsed.id ? '문서 위치' : name;
  }
  return name || parsed.relativePath;
}

/**
 * @param {string} relativePath
 */
export function workspaceLinkExtension(relativePath) {
  return entryExtensionOf(relativePath.split('/').pop() || relativePath);
}
