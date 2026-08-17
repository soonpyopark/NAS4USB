import { getParentPath, joinRelativePath, resolveUniqueName } from '../fsPaths.js';
import { isTiptapDocumentRelativePath } from '../../../shared/tiptapAssetPaths.js';
import { decryptSecBase64, encryptSecBase64, looksLikeSecBase64 } from './aes256.js';
import { getFilePassword, rememberFilePassword } from './session.js';
import { isSecFileName, stripSecSuffix, toSecPath } from './secPaths.js';

/**
 * @param {string} relativePath
 */
async function pathExists(relativePath) {
  try {
    return Boolean(await window.nas4usb.fs.exists(relativePath));
  } catch {
    return false;
  }
}

/**
 * @param {string} destPath
 */
async function uniqueDest(destPath) {
  if (!(await pathExists(destPath))) return destPath;
  const parent = getParentPath(destPath);
  const name = destPath.split('/').pop() || destPath;
  let existing = [];
  try {
    existing = (await window.nas4usb.fs.readDir(parent === '.' ? '' : parent)).map((entry) => entry.name);
  } catch {
    existing = [];
  }
  const unique = resolveUniqueName(existing, name);
  return parent === '.' ? unique : joinRelativePath(parent, unique);
}

/**
 * @param {string} relativePath
 * @param {string} password
 */
export async function lockFileWithPassword(relativePath, password) {
  if (isSecFileName(relativePath)) {
    throw new Error('이미 비밀번호가 설정된 파일입니다.');
  }

  let plain = await window.nas4usb.fs.readFile(relativePath);
  if (looksLikeSecBase64(plain)) {
    throw new Error('이미 암호화된 파일입니다.');
  }

  if (isTiptapDocumentRelativePath(relativePath)) {
    try {
      const { parseTiptapFileBase64, packTiptapFileFromSidecar, extractTiptapPackageAssetsToSidecar } =
        await import('../tiptap/package.js');
      const { getTiptapFileStem } = await import('../tiptap/document.js');
      const parsed = await parseTiptapFileBase64(plain);
      plain = await packTiptapFileFromSidecar({
        title: getTiptapFileStem(relativePath.split('/').pop() || ''),
        content: parsed.content,
        tiptapRelativePath: relativePath,
        embeddedAssets: parsed.embeddedAssets,
        includeAllAssets: true,
      });
      // Keep `{name}.tiptap.assets` beside the new `.tiptap.sec`. Deleting it
      // here is what dropped images/video/audio/file attachments when the ZIP
      // was incomplete. Re-extract so every packed attachment is on disk too.
      await extractTiptapPackageAssetsToSidecar(relativePath, plain);
    } catch {
      // encrypt the on-disk package as-is
    }
  }

  const encrypted = await encryptSecBase64(plain, password);
  const dest = await uniqueDest(toSecPath(relativePath));
  await window.nas4usb.fs.writeFile(dest, encrypted);
  try {
    await window.nas4usb.fs.delete(relativePath);
  } catch {
    // original may already be gone
  }
  rememberFilePassword(dest, password);
  return dest;
}

/**
 * @param {string} relativePath
 * @param {string} password
 */
export async function unlockFileWithPassword(relativePath, password) {
  if (!isSecFileName(relativePath)) {
    throw new Error('비밀번호가 설정된 파일이 아닙니다.');
  }
  const packed = await window.nas4usb.fs.readFile(relativePath);
  const plain = await decryptSecBase64(packed, password);
  const dest = await uniqueDest(stripSecSuffix(relativePath));
  await window.nas4usb.fs.writeFile(dest, plain);
  if (isTiptapDocumentRelativePath(dest) || isTiptapDocumentRelativePath(relativePath)) {
    try {
      const { extractTiptapPackageAssetsToSidecar } = await import('../tiptap/package.js');
      await extractTiptapPackageAssetsToSidecar(dest, plain);
    } catch {
      // sidecar may already exist from lock; editor open will retry
    }
  }
  try {
    await window.nas4usb.fs.delete(relativePath);
  } catch {
    // ignore
  }
  return dest;
}

/**
 * @param {string} relativePath
 * @param {string} rawBase64
 */
export async function unwrapWorkspaceBase64(relativePath, rawBase64) {
  if (!isSecFileName(relativePath) && !looksLikeSecBase64(rawBase64)) {
    return rawBase64;
  }
  const password = getFilePassword(relativePath);
  if (!password) {
    throw new Error('이 파일을 열려면 비밀번호가 필요합니다.');
  }
  return decryptSecBase64(rawBase64, password);
}

/**
 * @param {string} relativePath
 * @param {string} plainBase64
 */
export async function wrapWorkspaceBase64(relativePath, plainBase64) {
  if (!isSecFileName(relativePath)) return plainBase64;
  const password = getFilePassword(relativePath);
  if (!password) {
    throw new Error('암호화된 파일을 저장하려면 비밀번호가 필요합니다.');
  }
  return encryptSecBase64(plainBase64, password);
}

/**
 * @param {string} relativePath
 */
export async function readWorkspacePlainBase64(relativePath) {
  const raw = await window.nas4usb.fs.readFile(relativePath);
  return unwrapWorkspaceBase64(relativePath, raw);
}

/**
 * @param {string} relativePath
 * @param {string} plainBase64
 */
export async function writeWorkspacePlainBase64(relativePath, plainBase64) {
  const packed = await wrapWorkspaceBase64(relativePath, plainBase64);
  return window.nas4usb.fs.writeFile(relativePath, packed);
}
