/**
 * The dev launcher starts Electron with `stdio: 'inherit'`, so the terminal that
 * ran `npm run dev` owns stdout/stderr. When that terminal closes while the app
 * keeps running, the next log write (Vite HMR logs most often) fails with EPIPE
 * and Electron turns the throw into a fatal "JavaScript error in the main
 * process" dialog. Logging must never be able to kill the app, so swallow the
 * pipe errors and let everything else surface as before.
 */

const PIPE_ERROR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED']);

const GUARD_FLAG = Symbol.for('nas4usb.stdioPipeGuard');

/**
 * @param {unknown} error
 */
function isPipeError(error) {
  if (!error || typeof error !== 'object') return false;
  const code = String(/** @type {{ code?: unknown }} */ (error).code ?? '');
  return PIPE_ERROR_CODES.has(code);
}

/**
 * @param {import('node:stream').Writable & { [key: symbol]: unknown } | undefined} stream
 */
function guardStream(stream) {
  if (!stream || stream[GUARD_FLAG]) return;
  stream[GUARD_FLAG] = true;

  stream.on('error', (error) => {
    if (!isPipeError(error)) throw error;
  });

  const write = stream.write.bind(stream);
  stream.write = (...args) => {
    try {
      return write(...args);
    } catch (error) {
      if (isPipeError(error)) return true;
      throw error;
    }
  };
}

export function installStdioPipeGuard() {
  guardStream(process.stdout);
  guardStream(process.stderr);
}
