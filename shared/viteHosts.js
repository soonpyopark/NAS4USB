/**
 * @param {string | undefined} raw
 * @returns {true | string[]}
 */
export function parseAllowedHosts(raw) {
  const value = String(raw ?? '*')
    .trim()
    .replace(/^['"]|['"]$/g, '');

  if (!value || value === '*' || value.toLowerCase() === 'all') {
    return true;
  }

  return value
    .split(',')
    .map((host) => host.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}
