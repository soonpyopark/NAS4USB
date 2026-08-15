import { splitEntryExtension } from './entryNames.js';

/**
 * Pick a free sibling name: `name.ext` → `name (1).ext` → `name (2).ext` …
 * Only a real trailing extension (`.txt`, `.tiptap.sec`) is kept at the end.
 * Dots in the title (`01. 업무노트`) stay in the stem: `01. 업무노트 (1)`.
 * Folders never split on a dot.
 *
 * If `desiredName` is already part of that numbered series
 * (`name (1).ext`), continue as `name (2).ext` — not `name (1) (1).ext`.
 * Intentional parentheses like `Report (2024).pdf` keep the stem and become
 * `Report (2024) (1).pdf` when they are not a duplicate series.
 *
 * @param {Set<string>|string[]} existingNames
 * @param {string} desiredName
 * @param {boolean} [isDirectory]
 * @returns {string}
 */
export function resolveUniqueName(existingNames, desiredName, isDirectory = false) {
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames);
  if (!names.has(desiredName)) return desiredName;

  const split = isDirectory
    ? { stem: desiredName, extension: '' }
    : splitEntryExtension(desiredName);
  const stem = split.stem;
  const ext = split.extension;

  const numbered = stem.match(/^(.*) \((\d+)\)$/);
  let baseStem = stem;
  if (numbered) {
    const candidate = numbered[1];
    const n = Number(numbered[2]);
    let inSeries = n === 1 || names.has(`${candidate}${ext}`);
    if (!inSeries) {
      for (let i = 1; i < n; i += 1) {
        if (names.has(`${candidate} (${i})${ext}`)) {
          inSeries = true;
          break;
        }
      }
    }
    if (inSeries) baseStem = candidate;
  }

  let counter = 1;
  while (names.has(`${baseStem} (${counter})${ext}`)) counter += 1;
  return `${baseStem} (${counter})${ext}`;
}
