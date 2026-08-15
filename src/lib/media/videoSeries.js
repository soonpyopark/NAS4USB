import { compareNames } from '../fsPaths.js';

/**
 * @param {string} fileName
 */
export function fileStem(fileName) {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Split a file name into text runs and the numbers between them.
 * `귀멸의 칼날 1기 10화` → texts `["귀멸의 칼날 ", "기 ", "화"]`, numbers `[1, 10]`
 *
 * @param {string} fileName
 * @returns {{ texts: string[], numbers: number[] }}
 */
export function parseVideoNameTokens(fileName) {
  const stem = fileStem(fileName);
  /** @type {string[]} */
  const texts = [];
  /** @type {number[]} */
  const numbers = [];
  const digit = /\d+/g;
  let last = 0;
  let match = digit.exec(stem);
  while (match) {
    texts.push(stem.slice(last, match.index).replace(/\s+/g, ' '));
    numbers.push(Number.parseInt(match[0], 10));
    last = match.index + match[0].length;
    match = digit.exec(stem);
  }
  texts.push(stem.slice(last).replace(/\s+/g, ' '));
  return { texts, numbers };
}

/**
 * @param {{ texts: string[], numbers: number[] }} left
 * @param {{ texts: string[], numbers: number[] }} right
 */
function sameNameShape(left, right) {
  if (left.texts.length !== right.texts.length || left.numbers.length !== right.numbers.length) {
    return false;
  }
  return left.texts.every((text, index) => compareNames(text, right.texts[index]) === 0);
}

/**
 * Numbers that stay put with the current file (season, resolution) vs numbers
 * that change across the folder (episode). Tied slots keep the last one moving.
 *
 * @param {number[]} currentNumbers
 * @param {number[][]} groupNumbers
 * @returns {Set<number>}
 */
function frozenNumberSlots(currentNumbers, groupNumbers) {
  const slotCount = currentNumbers.length;
  const sameCounts = currentNumbers.map(
    (value, slot) => groupNumbers.filter((numbers) => numbers[slot] === value).length,
  );
  const maxSame = Math.max(...sameCounts);
  /** @type {Set<number>} */
  const frozen = new Set();
  if (sameCounts.every((count) => count === maxSame)) {
    if (maxSame === groupNumbers.length) return frozen;
    for (let slot = 0; slot < slotCount - 1; slot += 1) frozen.add(slot);
    return frozen;
  }
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (sameCounts[slot] === maxSame) frozen.add(slot);
  }
  return frozen;
}

/**
 * Videos in `entries` that belong with `currentFileName`: same non-numeric
 * name, matching the numbers that do not change in this folder.
 *
 * @param {import('../../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} currentFileName
 * @returns {import('../../types/nas4usb.d.ts').FsEntry[]}
 */
export function selectVideoSeries(entries, currentFileName) {
  const parsed = (Array.isArray(entries) ? entries : []).map((entry) => ({
    entry,
    tokens: parseVideoNameTokens(entry.name),
  }));
  const current = parsed.find((item) => item.entry.name === currentFileName);
  if (!current || current.tokens.numbers.length === 0) return [];

  const sameShape = parsed.filter((item) => sameNameShape(item.tokens, current.tokens));
  if (sameShape.length < 2) return [];

  const frozen = frozenNumberSlots(
    current.tokens.numbers,
    sameShape.map((item) => item.tokens.numbers),
  );
  const series = sameShape.filter((item) =>
    [...frozen].every((slot) => item.tokens.numbers[slot] === current.tokens.numbers[slot]),
  );
  if (series.length < 2) return [];

  const sortSlots = current.tokens.numbers
    .map((_, slot) => slot)
    .filter((slot) => !frozen.has(slot));
  if (!sortSlots.length) sortSlots.push(current.tokens.numbers.length - 1);

  series.sort((left, right) => {
    for (const slot of sortSlots) {
      const delta = left.tokens.numbers[slot] - right.tokens.numbers[slot];
      if (delta !== 0) return delta;
    }
    return compareNames(left.entry.name, right.entry.name);
  });
  return series.map((item) => item.entry);
}
