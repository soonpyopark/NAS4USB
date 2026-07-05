/**
 * @param {string | URLSearchParams | undefined} [search]
 */
export function getShareTokenFromSearch(search) {
  if (typeof window === 'undefined') return '';

  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === 'string' ? search : window.location.search);

  return params.get('share')?.trim() ?? '';
}

export function getShareTokenFromUrl() {
  return getShareTokenFromSearch();
}

/**
 * @param {string} url
 * @param {string | undefined} [shareToken]
 */
export function appendShareTokenToUrl(url, shareToken = getShareTokenFromUrl()) {
  if (!shareToken) return url;

  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('share', shareToken);
  return `${path}?${params.toString()}`;
}
