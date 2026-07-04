/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} line
 */
function renderInlineMarkdown(line) {
  let html = escapeHtml(line);

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  return html;
}

/**
 * CommonMark-style subset for LAN preview.
 * @param {string} source
 */
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  /** @type {string[]} */
  const blocks = [];
  /** @type {string[]} */
  const listItems = [];
  /** @type {string[]} */
  const codeLines = [];
  let inCodeBlock = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine ?? '';

    if (line.startsWith('```')) {
      flushList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines.length = 0;
      } else {
        inCodeBlock = false;
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      blocks.push('<hr />');
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushList();
      blocks.push(`<blockquote><p>${renderInlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    const listItem = line.match(/^[-*+]\s+(.+)$/);
    if (listItem) {
      listItems.push(listItem[1]);
      continue;
    }

    const orderedItem = line.match(/^\d+\.\s+(.+)$/);
    if (orderedItem) {
      flushList();
      blocks.push(`<ol><li>${renderInlineMarkdown(orderedItem[1])}</li></ol>`);
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();

  if (inCodeBlock && codeLines.length > 0) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return blocks.join('\n') || '<p class="text-slate-400">미리보기 내용 없음</p>';
}
