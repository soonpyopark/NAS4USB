/**
 * Open the system print dialog for a standalone HTML document.
 * Same hidden-iframe pattern as the PDF / image viewers.
 *
 * @param {string} html
 * @returns {Promise<void>}
 */
export async function printHtmlDocument(html) {
  const source = String(html ?? '').trim();
  if (!source) {
    throw new Error('인쇄할 내용이 없습니다.');
  }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error('인쇄 창을 열 수 없습니다.');
  }

  doc.open();
  doc.write(source);
  doc.close();

  await waitForDocumentAssets(doc);

  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    window.setTimeout(() => frame.remove(), 1500);
  }
}

/**
 * @param {Document} doc
 * @param {number} [timeoutMs]
 */
function waitForDocumentAssets(doc, timeoutMs = 8000) {
  const images = Array.from(doc.images || []);
  if (images.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
      ),
    ),
    new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}
