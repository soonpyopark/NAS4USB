/**
 * Turn pasted HTML images into sidecar assets.
 *
 * Word / OneNote / browsers often put:
 * - `data:` URLs (TipTap drops these when allowBase64 is false)
 * - `file://` / `cid:` temp paths that the editor cannot load
 * - clipboard image files that match those broken <img> tags
 *
 * The full-page screenshot that Office also puts on the clipboard is not
 * appended; it is only used to fill an existing <img> slot.
 */

/**
 * @param {string} src
 */
export function isInlinePasteImageSrc(src) {
  return /^(data:|blob:)/i.test(String(src || '').trim());
}

/**
 * src values the editor cannot display as-is.
 * @param {string} src
 */
export function isUnusablePasteImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return true;
  if (isInlinePasteImageSrc(value)) return false;
  if (/^(https?:|assets\/|\/api\/fs\/stream)/i.test(value)) return false;
  if (value.startsWith('//')) return false;
  return true;
}

/**
 * @param {string} src
 */
function imageFileNameFromSrc(src) {
  const value = String(src || '').trim();
  const fromPath = value.split(/[/\\?#]/).filter(Boolean).pop() || '';
  if (fromPath && !fromPath.startsWith('data:') && fromPath.includes('.')) {
    return fromPath;
  }
  return '';
}

/**
 * @param {string} dataUrl
 * @returns {File | null}
 */
export function fileFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(String(dataUrl || ''));
  if (!match) return null;

  const mime = (match[1] || 'image/png').trim() || 'image/png';
  const payload = match[3] || '';
  /** @type {BlobPart} */
  let bytes;
  try {
    if (match[2]) {
      const binary = atob(payload);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      bytes = out;
    } else {
      bytes = decodeURIComponent(payload);
    }
  } catch {
    return null;
  }

  const ext = mime.split('/')[1]?.split('+')[0] || 'png';
  return new File([bytes], `pasted-image.${ext}`, { type: mime });
}

/**
 * @param {DataTransfer | null | undefined} clipboard
 * @returns {File[]}
 */
export function collectClipboardImageFiles(clipboard) {
  /** @type {File[]} */
  const files = [];
  const seen = new Set();

  const add = (file) => {
    if (!(file instanceof File) && !(file instanceof Blob)) return;
    const type = String(file.type || '').toLowerCase();
    if (!type.startsWith('image/')) return;
    const name = 'name' in file ? String(file.name || '') : '';
    const key = `${type}:${file.size}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file instanceof File ? file : new File([file], name || 'pasted-image.png', { type }));
  };

  for (const file of clipboard?.files || []) add(file);
  const items = clipboard?.items;
  if (items) {
    for (const item of items) {
      if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
        add(item.getAsFile());
      }
    }
  }
  return files;
}

/**
 * Word VML → <img> so SchemaDOMParser can see the picture.
 * Skip when a fallback <img> with the same src already exists.
 * @param {ParentNode} root
 */
export function promoteVmlImages(root) {
  const nodes = [...root.querySelectorAll('*')].filter((el) => /imagedata$/i.test(el.tagName));
  for (const data of nodes) {
    const src =
      data.getAttribute('src') ||
      data.getAttribute('href') ||
      data.getAttribute('o:href') ||
      '';
    if (!src) continue;

    const duplicate = [...root.querySelectorAll('img')].some(
      (img) => (img.getAttribute('src') || '') === src,
    );
    if (duplicate) continue;

    const img = data.ownerDocument.createElement('img');
    img.setAttribute('src', src);
    let shape = data.parentElement;
    let walk = data.parentElement;
    while (walk) {
      if (/shape$/i.test(walk.tagName) && !/shapetype$/i.test(walk.tagName)) {
        shape = walk;
        break;
      }
      walk = walk.parentElement;
    }
    if (shape?.parentNode) {
      shape.parentNode.insertBefore(img, shape);
    } else {
      data.parentNode?.insertBefore(img, data);
    }
  }
}

/**
 * @param {File[]} files
 * @param {number} slotCount
 */
function pickFilesForImageSlots(files, slotCount) {
  if (slotCount <= 0 || files.length === 0) return [];
  if (files.length === slotCount) return [...files];
  if (files.length === 1 && slotCount > 1) return [];
  if (files.length === slotCount + 1) {
    return [...files].sort((a, b) => a.size - b.size).slice(0, slotCount);
  }
  return files.slice(0, slotCount);
}

/**
 * @param {string} src
 * @param {File[]} files
 */
function takeFileMatchingSrc(src, files) {
  const want = imageFileNameFromSrc(src).toLowerCase();
  if (!want) return null;
  const index = files.findIndex((file) => String(file.name || '').toLowerCase() === want);
  if (index < 0) return null;
  return files.splice(index, 1)[0] || null;
}

/**
 * @param {string} html
 * @param {{
 *   files?: File[],
 *   uploadFile: (file: File) => Promise<string>,
 * }} options
 */
export async function materializePastedImages(html, { files = [], uploadFile }) {
  const raw = String(html || '').trim();
  if (!raw || typeof document === 'undefined' || typeof uploadFile !== 'function') {
    return raw;
  }

  const template = document.createElement('template');
  template.innerHTML = raw;
  const images = [...template.content.querySelectorAll('img')];
  if (images.length === 0) return raw;

  const leftover = [...files];

  for (const img of images) {
    const src = img.getAttribute('src') || '';
    if (!isInlinePasteImageSrc(src)) continue;
    const file =
      (/^data:/i.test(src) ? fileFromDataUrl(src) : null) ||
      (await fileFromBlobUrl(src));
    if (!file) {
      img.remove();
      continue;
    }
    try {
      img.setAttribute('src', await uploadFile(file));
    } catch {
      img.remove();
    }
  }

  const broken = [...template.content.querySelectorAll('img')].filter((img) =>
    isUnusablePasteImageSrc(img.getAttribute('src') || ''),
  );

  for (const img of broken) {
    const matched = takeFileMatchingSrc(img.getAttribute('src') || '', leftover);
    if (!matched) continue;
    try {
      img.setAttribute('src', await uploadFile(matched));
    } catch {
      img.remove();
    }
  }

  const stillBroken = [...template.content.querySelectorAll('img')].filter((img) =>
    isUnusablePasteImageSrc(img.getAttribute('src') || ''),
  );
  const assigned = pickFilesForImageSlots(leftover, stillBroken.length);

  for (let i = 0; i < stillBroken.length; i += 1) {
    const file = assigned[i];
    if (!file) {
      stillBroken[i].remove();
      continue;
    }
    try {
      stillBroken[i].setAttribute('src', await uploadFile(file));
    } catch {
      stillBroken[i].remove();
    }
  }

  return template.innerHTML.trim();
}

/**
 * @param {string} src
 * @returns {Promise<File | null>}
 */
async function fileFromBlobUrl(src) {
  if (!/^blob:/i.test(src)) return null;
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    if (!String(blob.type || '').startsWith('image/')) return null;
    const ext = blob.type.split('/')[1] || 'png';
    return new File([blob], `pasted-image.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}
