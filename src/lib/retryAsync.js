/**
 * @param {unknown} error
 */
export function isLikelyNetworkError(error) {
  if (!(error instanceof Error)) return false;
  return (
    error.message === 'Failed to fetch' ||
    error.message.includes('서버에 연결') ||
    error.message.includes('응답 시간')
  );
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, delayMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function retryAsync(fn, { retries = 2, delayMs = 500 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isLikelyNetworkError(error)) break;
      await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs * (attempt + 1));
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Operation failed');
}

/**
 * @param {unknown} error
 */
export function formatNetworkError(error) {
  if (!(error instanceof Error)) return '저장에 실패했습니다.';
  if (
    error.message === 'Failed to fetch' ||
    error.message.includes('서버에 연결할 수 없습니다') ||
    error.message.includes('서버 응답 시간이 초과')
  ) {
    return error.message;
  }
  return error.message;
}
