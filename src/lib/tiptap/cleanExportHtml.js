/**
 * Normalize TipTap HTML for standalone HTML / HWPX export.
 * TipTap tables use `.tableWrapper` divs. Unwrap wrappers and strip editor chrome.
 *
 * @param {string} html
 * @returns {string}
 */
export function cleanTiptapExportHtml(html) {
  const source = String(html ?? '').trim();
  if (!source) return '';

  const doc = new DOMParser().parseFromString(
    `<div id="tiptap-export-root">${source}</div>`,
    'text/html',
  );
  const root = doc.getElementById('tiptap-export-root');
  if (!root) return source;

  // Prefer ProseMirror content when a full editor shell was captured.
  const prose = root.querySelector('.ProseMirror, .tiptap.ProseMirror, .tiptap');
  const work = prose && prose !== root ? prose : root;

  // Innermost tableWrapper first (nested tables).
  let guard = 0;
  while (guard++ < 64) {
    const wrappers = Array.from(work.querySelectorAll('.tableWrapper'));
    if (wrappers.length === 0) break;
    let progressed = false;
    for (const wrap of wrappers) {
      if (wrap.querySelector('.tableWrapper')) continue;
      const table = wrap.querySelector(':scope > table') || wrap.querySelector('table');
      if (table) {
        wrap.replaceWith(table);
      } else {
        wrap.replaceWith(...Array.from(wrap.childNodes));
      }
      progressed = true;
    }
    if (!progressed) {
      for (const wrap of wrappers) {
        const table = wrap.querySelector('table');
        if (table) wrap.replaceWith(table);
        else wrap.replaceWith(...Array.from(wrap.childNodes));
      }
      break;
    }
  }

  work.querySelectorAll('br.ProseMirror-trailingBreak').forEach((el) => el.remove());
  work.querySelectorAll('.ProseMirror-separator, .ProseMirror-gapcursor').forEach((el) => el.remove());
  work.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  work.querySelectorAll('[spellcheck]').forEach((el) => el.removeAttribute('spellcheck'));
  work.querySelectorAll('[translate]').forEach((el) => el.removeAttribute('translate'));
  work.querySelectorAll('[data-placeholder]').forEach((el) => el.removeAttribute('data-placeholder'));
  work.querySelectorAll('.is-empty, .is-editor-empty').forEach((el) => {
    el.classList.remove('is-empty', 'is-editor-empty');
    if (!el.getAttribute('class')) el.removeAttribute('class');
  });
  work.querySelectorAll('.column-resize-handle').forEach((el) => el.remove());
  work.querySelectorAll('input[type="file"]').forEach((el) => el.remove());

  // Drop trailing empty paragraphs TipTap often leaves after tables.
  while (work.lastElementChild?.tagName === 'P' && !work.lastElementChild.textContent?.trim()) {
    work.lastElementChild.remove();
  }

  return work.innerHTML.trim();
}

/**
 * @param {string} bodyHtml
 * @param {string} title
 * @returns {string}
 */
export function wrapCleanHtmlDocument(bodyHtml, title) {
  const safeTitle = String(title || 'document')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
