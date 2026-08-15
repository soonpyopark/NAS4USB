/**
 * @typedef {{
 *   mode: 'unlock' | 'set' | 'remove',
 *   fileName?: string,
 *   title?: string,
 *   body?: string,
 * }} FilePasswordPromptOptions
 */

/** @type {null | ((options: FilePasswordPromptOptions) => Promise<string | null>)} */
let promptHandler = null;

/**
 * @param {(options: FilePasswordPromptOptions) => Promise<string | null>} handler
 */
export function registerFilePasswordPrompt(handler) {
  promptHandler = handler;
  return () => {
    if (promptHandler === handler) promptHandler = null;
  };
}

/**
 * @param {FilePasswordPromptOptions} options
 * @returns {Promise<string | null>}
 */
export async function promptFilePassword(options) {
  if (!promptHandler) {
    throw new Error('비밀번호 입력 창을 열 수 없습니다.');
  }
  return promptHandler(options);
}
