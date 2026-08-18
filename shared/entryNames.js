const INVALID_ENTRY_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;

/** `.tiptap`, `.PNG`, `.tar` … — not `.)` or `. 31.` from a date inside the name. */
const EXTENSION_PATTERN = /^\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/;

/**
 * List/title label without the file extension (`.tiptap`, `.pdf.sec`, …).
 * Folders keep their full name.
 * @param {{ name?: string, relativePath?: string, isDirectory?: boolean } | string | null | undefined} entryOrName
 * @param {{ isDirectory?: boolean }} [options]
 */
export function displayEntryName(entryOrName, options) {
  const isDirectory =
    options?.isDirectory ??
    (entryOrName && typeof entryOrName === 'object' ? Boolean(entryOrName.isDirectory) : false);
  const raw =
    typeof entryOrName === 'string'
      ? entryOrName
      : String(entryOrName?.name || entryOrName?.relativePath || '')
          .replace(/\\/g, '/')
          .split('/')
          .pop() || '';
  if (isDirectory || !raw) return raw;
  return splitEntryExtension(raw).stem || raw;
}

export function splitEntryExtension(name) {
  const normalized = String(name ?? '');
  if (normalized.toLowerCase().endsWith('.sec') && normalized.length > 4) {
    const inner = splitEntryExtension(normalized.slice(0, -4));
    if (inner.extension) {
      return { stem: inner.stem, extension: `${inner.extension}.sec` };
    }
    return { stem: normalized.slice(0, -4), extension: '.sec' };
  }
  const index = normalized.lastIndexOf('.');
  if (index <= 0) {
    return { stem: normalized, extension: '' };
  }

  const extension = normalized.slice(index);
  if (!EXTENSION_PATTERN.test(extension)) {
    return { stem: normalized, extension: '' };
  }

  return {
    stem: normalized.slice(0, index),
    extension,
  };
}

/**
 * Puts a locked extension back on a user-typed stem, without doubling it up.
 *
 * @param {string} stem
 * @param {string} extension
 */
export function joinEntryExtension(stem, extension) {
  const trimmedStem = String(stem ?? '').trim();
  if (!extension) return trimmedStem;
  if (trimmedStem.toLowerCase().endsWith(String(extension).toLowerCase())) return trimmedStem;
  return `${trimmedStem}${extension}`;
}

/**
 * @param {string} name
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function validateEntryStem(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: '이름을 입력해 주세요.' };
  }

  const sanitized = trimmed.replace(INVALID_ENTRY_NAME_PATTERN, '').replace(/[. ]+$/g, '');
  if (!sanitized) {
    return { ok: false, error: '사용할 수 없는 문자가 포함되어 있습니다.' };
  }

  if (sanitized === '.' || sanitized === '..') {
    return { ok: false, error: '사용할 수 없는 이름입니다.' };
  }

  return { ok: true, name: sanitized };
}

/**
 * @param {string} nextName
 * @param {string} originalName
 * @param {boolean} isDirectory
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function validateRenameEntryName(nextName, originalName, isDirectory) {
  if (isDirectory) {
    return validateEntryStem(nextName);
  }

  const { extension: originalExtension } = splitEntryExtension(originalName);

  if (!originalExtension) {
    return validateEntryStem(nextName);
  }

  const { stem: nextStem, extension: nextExtension } = splitEntryExtension(nextName);
  const stemSource = nextExtension ? nextStem : nextName;
  const stemValidation = validateEntryStem(stemSource);
  if (!stemValidation.ok) {
    return stemValidation;
  }

  if (nextExtension && nextExtension.toLowerCase() !== originalExtension.toLowerCase()) {
    return {
      ok: false,
      error: `확장자(${originalExtension})는 변경할 수 없습니다.`,
    };
  }

  return { ok: true, name: `${stemValidation.name}${originalExtension}` };
}

/**
 * Setting a file password stores the file as `{name}.sec`, so lock/unlock is a
 * rename that adds or drops that marker. Every other extension change stays blocked.
 * @param {string} fromName
 * @param {string} toName
 */
function isSecMarkerChange(fromName, toName) {
  const from = splitEntryExtension(String(fromName ?? '')).extension.toLowerCase();
  const to = splitEntryExtension(String(toName ?? '')).extension.toLowerCase();
  if (!from || !to) return false;
  return to === `${from}.sec` || from === `${to}.sec`;
}

/**
 * @param {string} fromName
 * @param {string} toName
 * @param {boolean} isDirectory
 */
export function assertRenamePreservesExtension(fromName, toName, isDirectory) {
  if (!isDirectory && isSecMarkerChange(fromName, toName)) return;
  const result = validateRenameEntryName(toName, fromName, isDirectory);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
