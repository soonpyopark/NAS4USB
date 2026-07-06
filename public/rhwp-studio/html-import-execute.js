/**
 * @typedef {{ type: 'html', html: string }} HtmlBlock
 * @typedef {{ html?: string, blocks?: ImportBlock[] }} TableCell
 * @typedef {{ type: 'table', rows: TableCell[][] }} TableBlock
 * @typedef {HtmlBlock | TableBlock} ImportBlock
 * @typedef {{ blocks: ImportBlock[] }} RhwpImportPlan
 */

/**
 * @typedef {object} HwpDocumentLike
 * @property {(section_idx: number, para_idx: number, char_offset: number, html: string) => string} pasteHtml
 * @property {(options_json: string) => string} createTableEx
 * @property {(options_json: string) => string} createTableInCellEx
 * @property {(options_json: string) => string} pasteHtmlInCellEx
 * @property {(section_idx: number, parent_para_idx: number, path_json: string, char_offset: number, html: string) => string} pasteHtmlInCellByPath
 */

/**
 * @typedef {{ cellParaIdx: number, charOffset: number }} CellInsertCursor
 */

/**
 * @param {string | undefined | null} raw
 */
function runWasmJson(raw) {
  if (!raw) return { ok: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ok === false) {
      throw new Error(parsed.message || parsed.error || 'rhwp 명령 실패');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: true, raw };
    throw error;
  }
}

/**
 * @param {string} html
 */
function isEmptyHtmlBlock(html) {
  const trimmed = html?.trim() ?? '';
  if (!trimmed) return true;
  return /^<p(?:\s[^>]*)?>\s*(?:<br\s*\/?>)?\s*<\/p>$/i.test(trimmed);
}

/**
 * @param {CellInsertCursor} cursor
 * @param {Record<string, unknown>} result
 * @returns {CellInsertCursor}
 */
function advanceCellCursor(cursor, result) {
  return {
    cellParaIdx:
      typeof result.cellParaIdx === 'number' ? result.cellParaIdx : cursor.cellParaIdx,
    charOffset: typeof result.charOffset === 'number' ? result.charOffset : cursor.charOffset,
  };
}

/**
 * @param {HwpDocumentLike} doc
 * @param {number} sectionIdx
 * @param {number} tableParaIdx
 * @param {number} controlIdx
 * @param {number} cellIdx
 * @param {Array<{ controlIndex: number, cellIndex: number, cellParaIndex: number }>} path
 * @param {string} html
 * @param {CellInsertCursor} insertCursor
 * @returns {CellInsertCursor}
 */
function pasteCellHtml(
  doc,
  sectionIdx,
  tableParaIdx,
  controlIdx,
  cellIdx,
  path,
  html,
  insertCursor = { cellParaIdx: 0, charOffset: 0 },
) {
  let safeHtml = html?.trim() || '<p></p>';
  if (/<(?:table|tr|td|th)[\s>]/i.test(safeHtml)) {
    safeHtml =
      safeHtml.replace(/<\/?(?:table|tbody|thead|tfoot|tr|td|th)[^>]*>/gi, '').trim() || '<p></p>';
  }

  if (path.length === 0) {
    const result = runWasmJson(
      doc.pasteHtmlInCellEx(
        JSON.stringify({
          sectionIdx,
          parentParaIdx: tableParaIdx,
          controlIdx,
          cellIdx,
          cellParaIdx: insertCursor.cellParaIdx,
          charOffset: insertCursor.charOffset,
          html: safeHtml,
        }),
      ),
    );
    return advanceCellCursor(insertCursor, result);
  }

  const result = runWasmJson(
    doc.pasteHtmlInCellByPath(
      sectionIdx,
      tableParaIdx,
      JSON.stringify(path),
      insertCursor.charOffset,
      safeHtml,
    ),
  );
  return advanceCellCursor(insertCursor, result);
}

/**
 * @typedef {{
 *   sectionIdx: number,
 *   paraIdx: number,
 *   charOffset: number,
 *   tableParaIdx?: number,
 *   controlIdx?: number,
 *   path?: Array<{ controlIndex: number, cellIndex: number, cellParaIndex: number }>,
 * }} ImportCursor
 */

/**
 * @param {HwpDocumentLike} doc
 * @param {ImportCursor} cursor
 * @param {TableCell} cell
 * @param {number} cellIdx
 */
function importCell(doc, cursor, cell, cellIdx) {
  const sectionIdx = cursor.sectionIdx;
  const tableParaIdx = cursor.tableParaIdx ?? cursor.paraIdx;
  const controlIdx = cursor.controlIdx ?? 0;
  const path = cursor.path ?? [];

  if (cell.blocks?.length) {
    /** @type {CellInsertCursor} */
    let cellCursor = { cellParaIdx: 0, charOffset: 0 };
    /** @type {string[]} */
    let htmlBatch = [];

    const flushHtmlBatch = () => {
      if (htmlBatch.length === 0) return;
      cellCursor = pasteCellHtml(
        doc,
        sectionIdx,
        tableParaIdx,
        controlIdx,
        cellIdx,
        path,
        htmlBatch.join(''),
        cellCursor,
      );
      htmlBatch = [];
    };

    for (const block of cell.blocks) {
      if (block.type === 'html') {
        if (isEmptyHtmlBlock(block.html)) continue;
        htmlBatch.push(block.html);
        continue;
      }

      flushHtmlBatch();

      if (block.type === 'table') {
        importTable(
          doc,
          {
            sectionIdx,
            paraIdx: cursor.paraIdx,
            charOffset: cellCursor.charOffset,
            tableParaIdx,
            controlIdx,
            path: [
              ...path,
              { controlIndex: controlIdx, cellIndex: cellIdx, cellParaIndex: cellCursor.cellParaIdx },
            ],
            cellParaIdx: cellCursor.cellParaIdx,
          },
          block,
          cellIdx,
        );
      }
    }

    flushHtmlBatch();
    return;
  }

  if (!isEmptyHtmlBlock(cell.html ?? '')) {
    pasteCellHtml(
      doc,
      sectionIdx,
      tableParaIdx,
      controlIdx,
      cellIdx,
      path,
      cell.html ?? '<p></p>',
    );
  }
}

/**
 * @param {HwpDocumentLike} doc
 * @param {ImportCursor} cursor
 * @param {TableBlock} table
 * @param {number} [parentCellIdx]
 */
function importTable(doc, cursor, table, parentCellIdx) {
  const rows = table.rows.length || 1;
  const cols = Math.max(1, ...table.rows.map((row) => row.length));
  const path = cursor.path ?? [];
  let createResult;

  if (path.length === 0) {
    createResult = runWasmJson(
      doc.createTableEx(
        JSON.stringify({
          sectionIdx: cursor.sectionIdx,
          paraIdx: cursor.paraIdx,
          charOffset: cursor.charOffset,
          rowCount: rows,
          colCount: cols,
        }),
      ),
    );
    cursor.tableParaIdx = createResult.paraIdx ?? cursor.paraIdx;
    cursor.controlIdx = createResult.controlIdx ?? 0;
  } else {
    createResult = runWasmJson(
      doc.createTableInCellEx(
        JSON.stringify({
          sectionIdx: cursor.sectionIdx,
          parentParaIdx: cursor.tableParaIdx ?? cursor.paraIdx,
          charOffset: cursor.charOffset ?? 0,
          rowCount: rows,
          colCount: cols,
          controlIdx: cursor.controlIdx ?? 0,
          cellIdx: parentCellIdx ?? 0,
          cellParaIdx: cursor.cellParaIdx ?? 0,
          cellPath: JSON.stringify(path.slice(0, -1)),
        }),
      ),
    );
    cursor.controlIdx = createResult.controlIdx ?? cursor.controlIdx ?? 0;
  }

  const tableParaIdx = cursor.tableParaIdx ?? createResult.paraIdx ?? cursor.paraIdx;
  const outerControlIdx = cursor.controlIdx ?? createResult.controlIdx ?? 0;
  const nestedControlIdx = path.length > 0 ? (createResult.controlIdx ?? 0) : outerControlIdx;

  let cellIdx = 0;
  for (const row of table.rows) {
    for (const cell of row) {
      const cellPath =
        path.length > 0
          ? [
              ...path,
              { controlIndex: nestedControlIdx, cellIndex: cellIdx, cellParaIndex: 0 },
            ]
          : [];

      importCell(
        doc,
        {
          sectionIdx: cursor.sectionIdx,
          paraIdx: cursor.paraIdx,
          charOffset: cursor.charOffset,
          tableParaIdx,
          controlIdx: path.length > 0 ? nestedControlIdx : outerControlIdx,
          path: cellPath,
        },
        cell,
        cellIdx,
      );
      cellIdx += 1;
    }
  }

  if (path.length === 0) {
    cursor.paraIdx = tableParaIdx + 1;
    cursor.charOffset = 0;
    cursor.tableParaIdx = undefined;
    cursor.controlIdx = undefined;
  }
}

/**
 * @param {HwpDocumentLike} doc
 * @param {ImportCursor} cursor
 * @param {HtmlBlock} block
 */
function importHtmlBlock(doc, cursor, block) {
  const html = block.html || '<p></p>';
  if (isEmptyHtmlBlock(html)) return;
  if (/<(?:table|tr|td|th)[\s>]/i.test(html)) {
    throw new Error('표 HTML은 pasteHtml로 처리할 수 없습니다. import plan을 확인하세요.');
  }

  const result = runWasmJson(
    doc.pasteHtml(cursor.sectionIdx, cursor.paraIdx, cursor.charOffset, html),
  );
  if (typeof result.paraIdx === 'number') {
    cursor.paraIdx = result.paraIdx;
  } else {
    cursor.paraIdx += 1;
  }
  cursor.charOffset = typeof result.charOffset === 'number' ? result.charOffset : 0;
  if (typeof result.endParaIdx === 'number') {
    cursor.paraIdx = result.endParaIdx;
    cursor.charOffset = typeof result.endCharOffset === 'number' ? result.endCharOffset : 0;
  }
}

/**
 * @param {HwpDocumentLike} doc
 * @param {RhwpImportPlan} plan
 */
export function executeRhwpImportPlan(doc, plan) {
  /** @type {ImportCursor} */
  const cursor = { sectionIdx: 0, paraIdx: 0, charOffset: 0, path: [] };

  for (const block of plan.blocks ?? []) {
    if (block.type === 'html') {
      importHtmlBlock(doc, cursor, block);
    } else if (block.type === 'table') {
      importTable(doc, cursor, block);
    }
  }
}
