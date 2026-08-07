import { triggerBrowserDownload } from './browserDownload.js';

/**
 * @param {string} fileName
 * @param {string} content
 * @param {string} [mimeType]
 */
export function downloadTextFile(fileName, content, mimeType = 'application/json') {
  triggerBrowserDownload(fileName, new Blob([content], { type: mimeType }));
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return file.text();
}
