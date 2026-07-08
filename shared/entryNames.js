const INVALID_ENTRY_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * @param {string} name
 * @returns {{ stem: string, extension: string }}
 */
export function splitEntryExtension(name) {
  const normalized = String(name ?? '');
  const index = normalized.lastIndexOf('.');
  if (index <= 0) {
    return { stem: normalized, extension: '' };
  }
  return {
    stem: normalized.slice(0, index),
    extension: normalized.slice(index),
  };
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
 * @param {string} fromName
 * @param {string} toName
 * @param {boolean} isDirectory
 */
export function assertRenamePreservesExtension(fromName, toName, isDirectory) {
  const result = validateRenameEntryName(toName, fromName, isDirectory);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
