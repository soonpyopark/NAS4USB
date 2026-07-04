/**
 * 두 문자열 사이의 최소 Y.Text 변경(delta)을 계산합니다.
 * @param {string} oldText
 * @param {string} newText
 * @returns {{ retain: number, delete: number, insert: string }}
 */
export function computeTextDiff(oldText, newText) {
  if (oldText === newText) {
    return { retain: oldText.length, delete: 0, insert: '' };
  }

  let prefix = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefix < minLen && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > prefix && newEnd > prefix && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return {
    retain: prefix,
    delete: oldEnd - prefix,
    insert: newText.slice(prefix, newEnd),
  };
}

/**
 * Y.Text delta를 문자열에 적용합니다.
 * @param {string} text
 * @param {Array<{ retain?: number, insert?: string, delete?: number }>} delta
 */
export function applyDeltaToString(text, delta) {
  let result = '';
  let index = 0;

  for (const op of delta) {
    if (op.retain) {
      result += text.slice(index, index + op.retain);
      index += op.retain;
    }
    if (op.delete) {
      index += op.delete;
    }
    if (op.insert) {
      result += op.insert;
    }
  }

  result += text.slice(index);
  return result;
}
