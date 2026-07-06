/**
 * @param {Element} element
 */
function formatAttributes(element) {
  return [...element.attributes]
    .map((attr) => ` ${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`)
    .join('');
}

/**
 * @param {Node} node
 * @param {number} depth
 * @returns {string}
 */
function formatNode(node, depth) {
  const pad = '  '.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    return text ? `${pad}${text}` : '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = /** @type {Element} */ (node);
  const tag = el.tagName.toLowerCase();
  const attrs = formatAttributes(el);
  const childLines = [...el.childNodes]
    .map((child) => formatNode(child, depth + 1))
    .filter(Boolean);

  if (childLines.length === 0) {
    return `${pad}<${tag}${attrs}></${tag}>`;
  }

  if (childLines.length === 1 && el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
    const text = el.textContent?.trim() ?? '';
    return `${pad}<${tag}${attrs}>${text}</${tag}>`;
  }

  return `${pad}<${tag}${attrs}>\n${childLines.join('\n')}\n${pad}</${tag}>`;
}

/**
 * TipTap 본문 HTML fragment를 읽기 쉽게 들여쓰기합니다.
 * @param {string} html
 */
export function formatHtmlFragment(html) {
  const trimmed = html?.trim();
  if (!trimmed) return '<p></p>';
  if (typeof DOMParser === 'undefined') return trimmed;

  const doc = new DOMParser().parseFromString(`<div id="fmt-root">${trimmed}</div>`, 'text/html');
  const root = doc.getElementById('fmt-root');
  if (!root) return trimmed;

  const lines = [...root.childNodes].map((node) => formatNode(node, 0)).filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : trimmed;
}
