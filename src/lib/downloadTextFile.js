/**
 * @param {string} fileName
 * @param {string} content
 * @param {string} [mimeType]
 */
export function downloadTextFile(fileName, content, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return file.text();
}
