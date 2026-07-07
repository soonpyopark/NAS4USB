const HTML_DOCUMENT_STYLES = `
body {
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #1e293b;
  margin: 24px;
}
p { margin: 0 0 0.75em; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}
td, th {
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  vertical-align: top;
  min-width: 48px;
}
th {
  background: #f8fafc;
  font-weight: 600;
}
td table, th table {
  width: 100%;
  margin: 4px 0;
}
`.trim();

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} html
 */
export function enrichTablesWithInlineStyles(html) {
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div id="nas4usb-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('nas4usb-root');
  if (!root) return html;

  root.querySelectorAll('table').forEach((table) => {
    table.setAttribute('border', '1');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.margin = '12px 0';
    table.style.minWidth = '';
  });

  root.querySelectorAll('colgroup col').forEach((col) => {
    col.style.removeProperty('min-width');
    if (!col.style.cssText && !col.hasAttribute('width')) {
      col.removeAttribute('style');
    }
  });

  root.querySelectorAll('th').forEach((cell) => {
    cell.style.border = '1px solid #cbd5e1';
    cell.style.padding = '4px 8px';
    if (!cell.style.verticalAlign) cell.style.verticalAlign = 'top';
    cell.style.backgroundColor = '#f8fafc';
    cell.style.fontWeight = '600';
    cell.style.minWidth = '48px';
  });

  root.querySelectorAll('td').forEach((cell) => {
    cell.style.border = '1px solid #cbd5e1';
    cell.style.padding = '4px 8px';
    if (!cell.style.verticalAlign) cell.style.verticalAlign = 'top';
    cell.style.minWidth = '48px';
  });

  return root.innerHTML;
}

/**
 * @param {string} bodyHtml
 * @param {string} [title]
 */
export function wrapHtmlDocument(bodyHtml, title = 'Document') {
  const body = enrichTablesWithInlineStyles(bodyHtml || '<p></p>');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="NAS4USB TipTap">
<title>${escapeHtml(title)}</title>
<style>
${HTML_DOCUMENT_STYLES}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * 저장된 HTML(전체 문서 또는 fragment)에서 TipTap 본문만 추출합니다.
 * @param {string} stored
 */
export function unwrapHtmlDocument(stored) {
  const trimmed = stored.trim();
  if (!trimmed) return '<p></p>';
  if (!/<html[\s>]/i.test(trimmed) && !/<!doctype/i.test(trimmed)) {
    return trimmed;
  }

  if (typeof DOMParser === 'undefined') {
    const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch?.[1]?.trim() || trimmed;
  }

  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  const bodyHtml = doc.body?.innerHTML?.trim();
  return bodyHtml || '<p></p>';
}

/**
 * @param {string} bodyHtml
 * @param {string} [title]
 */
export function serializeHtmlForFile(bodyHtml, title = 'Document') {
  return wrapHtmlDocument(bodyHtml, title);
}
