/**
 * FortuneSheet (Immer) mutates sheet objects in place. Plain mutable copies are required
 * for the controlled `data` prop — never pass Immer-frozen refs from getAllSheets/onChange.
 *
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @returns {import('@fortune-sheet/core').Sheet[]}
 */
export function cloneFortuneSheets(sheets) {
  if (!Array.isArray(sheets)) return [];
  return JSON.parse(JSON.stringify(sheets));
}
