/** Shared 본문 검색 / 편집기 찾기 문법 (Doc Search Engine 계열). */

export const DOC_SEARCH_FIELD_MAP = {
  content: 'content',
  file: 'file_name',
  name: 'file_name',
  path: 'folder_path',
  loc: 'location_label',
  ext: 'file_name',
};

const PREFIXES = Object.keys(DOC_SEARCH_FIELD_MAP);

/**
 * @param {string} text
 */
function escapeLike(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * @param {string} text
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {unknown} value
 * @param {string} field
 */
function toLikePattern(value, field) {
  const raw = String(value ?? '');
  if (field === 'ext') {
    const extensions = raw
      .split(/[;,]/)
      .map((item) => item.trim().replace(/^\./, ''))
      .filter(Boolean);
    return extensions.map((ext) => `%.${escapeLike(ext)}`);
  }
  const hasWild = /[*?]/.test(raw);
  let pattern = escapeLike(raw).replace(/\*/g, '%').replace(/\?/g, '_');
  if (!hasWild) {
    pattern = `%${pattern}%`;
  }
  return [pattern];
}

/**
 * @param {string} raw
 */
export function parseExtValues(raw) {
  return String(raw ?? '')
    .split(/[;,]/)
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} input
 * @param {number} start
 */
function readQuoted(input, start) {
  let value = '';
  let i = start + 1;
  while (i < input.length) {
    if (input[i] === '\\') {
      value += input[i + 1] || '';
      i += 2;
      continue;
    }
    if (input[i] === '"') {
      return { value, next: i + 1 };
    }
    value += input[i];
    i += 1;
  }
  return { value, next: i };
}

/**
 * @param {string} query
 */
function tokenize(query) {
  const tokens = [];
  let i = 0;
  const text = String(query || '');

  const readPrefixValue = (field, from) => {
    let j = from;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (text[j] === '"') {
      const quoted = readQuoted(text, j);
      tokens.push({ type: 'TERM', field, value: quoted.value });
      return quoted.next;
    }
    let value = '';
    while (j < text.length && !/[\s|()!]/.test(text[j])) {
      value += text[j];
      j += 1;
    }
    if (value) {
      tokens.push({ type: 'TERM', field, value });
    }
    return j;
  };

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i += 1;
      continue;
    }
    if (ch === '|') {
      tokens.push({ type: 'OR' });
      i += 1;
      continue;
    }
    if (ch === '!' && (i === 0 || /[\s(|]/.test(text[i - 1] || ''))) {
      tokens.push({ type: 'NOT' });
      i += 1;
      continue;
    }
    if (ch === '"') {
      const quoted = readQuoted(text, i);
      tokens.push({ type: 'TERM', field: 'content', value: quoted.value });
      i = quoted.next;
      continue;
    }

    const rest = text.slice(i);
    const prefixMatch = rest.match(new RegExp(`^(${PREFIXES.join('|')}):`, 'i'));
    if (prefixMatch) {
      i = readPrefixValue(prefixMatch[1].toLowerCase(), i + prefixMatch[0].length);
      continue;
    }

    let value = '';
    while (i < text.length && !/[\s|()!]/.test(text[i])) {
      value += text[i];
      i += 1;
    }
    if (value) {
      tokens.push({ type: 'TERM', field: 'content', value });
    }
  }

  return tokens;
}

/**
 * @param {ReturnType<typeof tokenize>} tokens
 * @returns {object | null}
 */
function parseExpression(tokens) {
  let index = 0;

  const peek = () => tokens[index] || null;
  const consume = () => {
    const token = tokens[index];
    index += 1;
    return token;
  };

  function parseOr() {
    const items = [];
    const first = parseAnd();
    if (first) items.push(first);
    while (peek()?.type === 'OR') {
      consume();
      const right = parseAnd();
      if (right) items.push(right);
    }
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    return { type: 'or', items };
  }

  function parseAnd() {
    const items = [];
    while (peek() && peek().type !== 'OR' && peek().type !== 'RPAREN') {
      const part = parseUnary();
      if (!part) break;
      items.push(part);
    }
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    return { type: 'and', items };
  }

  function parseUnary() {
    if (peek()?.type === 'NOT') {
      consume();
      const inner = parseUnary();
      if (!inner) return null;
      return { type: 'not', item: inner };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) return null;
    if (token.type === 'LPAREN') {
      consume();
      const inner = parseOr();
      if (peek()?.type === 'RPAREN') consume();
      return inner;
    }
    if (token.type === 'TERM') {
      consume();
      return { type: 'term', field: token.field, value: token.value };
    }
    consume();
    return null;
  }

  return parseOr();
}

/**
 * @param {unknown} query
 * @returns {object | null}
 */
export function parseDocSearchQuery(query) {
  const text = String(query ?? '').trim();
  if (!text) return null;
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  return parseExpression(tokens);
}

/**
 * @param {object} term
 */
function compileTerm(term) {
  const column = DOC_SEARCH_FIELD_MAP[term.field] || 'content';
  const patterns = toLikePattern(term.value, term.field);
  const parts = patterns.map(() => `${column} LIKE ? ESCAPE '\\'`);
  return {
    sql: parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0],
    params: patterns,
  };
}

/**
 * @param {object | null} ast
 * @returns {{ sql: string, params: string[] } | null}
 */
function astToSql(ast) {
  if (!ast) return null;
  if (ast.type === 'term') return compileTerm(ast);
  if (ast.type === 'not') {
    const inner = astToSql(ast.item);
    if (!inner) return null;
    return { sql: `NOT (${inner.sql})`, params: inner.params };
  }
  if (ast.type === 'and' || ast.type === 'or') {
    const parts = ast.items.map((item) => astToSql(item)).filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    const joiner = ast.type === 'and' ? ' AND ' : ' OR ';
    return {
      sql: `(${parts.map((part) => part.sql).join(joiner)})`,
      params: parts.flatMap((part) => part.params),
    };
  }
  return null;
}

/**
 * @param {string} query
 * @returns {{ sql: string, params: string[] } | null}
 */
export function compileQuery(query) {
  return astToSql(parseDocSearchQuery(query));
}

/**
 * @param {string} value
 * @param {{ caseSensitive?: boolean }} [options]
 */
export function termToRegExp(value, options = {}) {
  const raw = String(value ?? '');
  const hasWild = /[*?]/.test(raw);
  const source = hasWild
    ? escapeRegExp(raw).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')
    : escapeRegExp(raw);
  return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
}

/**
 * @param {string} haystack
 * @param {string} value
 * @param {string} field
 * @param {{ caseSensitive?: boolean }} [options]
 */
function termMatches(haystack, value, field, options = {}) {
  const text = String(haystack ?? '');
  if (field === 'ext') {
    const lower = text.toLowerCase();
    return parseExtValues(value).some((ext) => lower.endsWith(`.${ext}`));
  }
  const re = termToRegExp(value, options);
  re.lastIndex = 0;
  return re.test(text);
}

/**
 * @param {object | null} ast
 * @param {Record<string, string | undefined>} record
 * @param {{ caseSensitive?: boolean, missingField?: 'pass' | 'fail' }} [options]
 */
export function recordMatchesAst(ast, record, options = {}) {
  if (!ast) return false;
  const missingField = options.missingField ?? 'fail';

  const fieldText = (field) => {
    const column = DOC_SEARCH_FIELD_MAP[field] || 'content';
    if (record && Object.prototype.hasOwnProperty.call(record, column) && record[column] != null) {
      return String(record[column]);
    }
    if (field === 'content' && record?.content != null) return String(record.content);
    return null;
  };

  const evalAst = (node) => {
    if (!node) return false;
    if (node.type === 'term') {
      const text = fieldText(node.field);
      if (text == null) return missingField === 'pass';
      return termMatches(text, node.value, node.field, options);
    }
    if (node.type === 'not') return !evalAst(node.item);
    if (node.type === 'and') return node.items.every((item) => evalAst(item));
    if (node.type === 'or') return node.items.some((item) => evalAst(item));
    return false;
  };

  return evalAst(ast);
}

/**
 * @param {string} text
 * @param {unknown} query
 * @param {{ caseSensitive?: boolean, fields?: Record<string, string | undefined> }} [options]
 */
export function textMatchesQuery(text, query, options = {}) {
  const ast = query && typeof query === 'object' && query.type ? query : parseDocSearchQuery(query);
  if (!ast) return false;
  return recordMatchesAst(
    ast,
    { content: String(text ?? ''), ...(options.fields ?? {}) },
    { caseSensitive: options.caseSensitive, missingField: options.missingField ?? 'pass' },
  );
}

/**
 * Positive content terms used for in-document highlighting.
 * @param {object | null} ast
 * @returns {string[]}
 */
export function collectHighlightTerms(ast) {
  if (!ast) return [];
  if (ast.type === 'term') {
    return ast.field === 'content' ? [String(ast.value ?? '')] : [];
  }
  if (ast.type === 'not') return [];
  if (ast.type === 'and' || ast.type === 'or') {
    return ast.items.flatMap((item) => collectHighlightTerms(item));
  }
  return [];
}

/**
 * @param {{ from: number, to: number }[]} ranges
 */
export function mergeSearchRanges(ranges) {
  const sorted = [...ranges].sort((left, right) => left.from - right.from || right.to - left.to);
  /** @type {{ from: number, to: number }[]} */
  const out = [];
  for (const range of sorted) {
    if (range.to <= range.from) continue;
    const last = out[out.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      out.push({ from: range.from, to: range.to });
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} value
 * @param {{ caseSensitive?: boolean }} [options]
 */
export function findTermRanges(text, value, options = {}) {
  const source = String(text ?? '');
  const needle = String(value ?? '');
  if (!source || !needle) return [];
  const re = termToRegExp(needle, options);
  /** @type {{ from: number, to: number }[]} */
  const ranges = [];
  let match = re.exec(source);
  while (match) {
    if (!match[0]) {
      re.lastIndex += 1;
    } else {
      ranges.push({ from: match.index, to: match.index + match[0].length });
    }
    match = re.exec(source);
  }
  return ranges;
}

/**
 * Highlight spans for content terms. Does not re-check AND/OR.
 * @param {string} text
 * @param {unknown} query
 * @param {{ caseSensitive?: boolean }} [options]
 */
export function findHighlightRanges(text, query, options = {}) {
  const ast = query && typeof query === 'object' && query.type ? query : parseDocSearchQuery(query);
  if (!ast) return [];
  const ranges = collectHighlightTerms(ast).flatMap((value) => findTermRanges(text, value, options));
  return mergeSearchRanges(ranges);
}

/**
 * Ranges only when `text` satisfies the full query (same as one index record).
 * @param {string} text
 * @param {unknown} query
 * @param {{ caseSensitive?: boolean, fields?: Record<string, string | undefined> }} [options]
 */
export function findQueryRanges(text, query, options = {}) {
  if (!textMatchesQuery(text, query, options)) return [];
  return findHighlightRanges(text, query, options);
}

/**
 * @param {string[]} fragments
 * @param {unknown} query
 * @param {{ caseSensitive?: boolean, fields?: Record<string, string | undefined> }} [options]
 */
export function fragmentsMatchQuery(fragments, query, options = {}) {
  const ast = query && typeof query === 'object' && query.type ? query : parseDocSearchQuery(query);
  if (!ast) return false;
  return (fragments ?? []).some((fragment) => textMatchesQuery(fragment, ast, options));
}
