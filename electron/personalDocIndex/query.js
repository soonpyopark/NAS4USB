const FIELD_MAP = {
  content: 'content',
  file: 'file_name',
  name: 'file_name',
  path: 'folder_path',
  loc: 'location_label',
  ext: 'file_name',
};

const PREFIXES = Object.keys(FIELD_MAP);

function escapeLike(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

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

function compileTerm(term) {
  const column = FIELD_MAP[term.field] || 'content';
  const patterns = toLikePattern(term.value, term.field);
  const parts = patterns.map(() => `${column} LIKE ? ESCAPE '\\'`);
  return {
    sql: parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0],
    params: patterns,
  };
}

function parseExpression(tokens) {
  let index = 0;

  const peek = () => tokens[index] || null;
  const consume = () => {
    const token = tokens[index];
    index += 1;
    return token;
  };

  function parseOr() {
    let left = parseAnd();
    while (peek()?.type === 'OR') {
      consume();
      const right = parseAnd();
      if (!right) break;
      if (!left) {
        left = right;
        continue;
      }
      left = {
        sql: `(${left.sql} OR ${right.sql})`,
        params: [...left.params, ...right.params],
      };
    }
    return left;
  }

  function parseAnd() {
    const parts = [];
    while (peek() && peek().type !== 'OR' && peek().type !== 'RPAREN') {
      const part = parseUnary();
      if (!part) break;
      parts.push(part);
    }
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    return {
      sql: `(${parts.map((part) => part.sql).join(' AND ')})`,
      params: parts.flatMap((part) => part.params),
    };
  }

  function parseUnary() {
    if (peek()?.type === 'NOT') {
      consume();
      const inner = parseUnary();
      if (!inner) return null;
      return { sql: `NOT (${inner.sql})`, params: inner.params };
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
      return compileTerm(token);
    }
    consume();
    return null;
  }

  return parseOr();
}

/**
 * @param {string} query
 * @returns {{ sql: string, params: string[] } | null}
 */
export function compileQuery(query) {
  const text = String(query || '').trim();
  if (!text) return null;
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  return parseExpression(tokens);
}
