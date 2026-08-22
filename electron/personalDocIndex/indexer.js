import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PERSONAL_DOC_ALL_EXTENSIONS,
  PERSONAL_DOC_MAX_FILE_BYTES,
  personalDocTypeForName,
} from '../../shared/personalDocIndex.js';
import { parseExcel } from './parsers/excel.js';
import { parseHwp } from './parsers/hwp.js';
import { parseText } from './parsers/text.js';
import { parseTiptap } from './parsers/tiptap.js';

const BATCH_SIZE = 2000;

const PARSERS = {
  excel: parseExcel,
  hwp: parseHwp,
  tiptap: parseTiptap,
  text: parseText,
};

/**
 * @param {string} root
 * @returns {Promise<{ files: string[], folderCount: number }>}
 */
export async function collectPersonalDocFiles(root) {
  const files = [];
  let folderCount = 0;
  const allowed = new Set(PERSONAL_DOC_ALL_EXTENSIONS.map((ext) => ext.toLowerCase()));

  async function walk(dir) {
    let names;
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }

    for (const name of names) {
      if (name.startsWith('.') || name.startsWith('~$')) continue;
      if (name.endsWith('.tiptap.assets') || name.endsWith('.assets')) continue;
      const fullPath = path.join(dir, name);
      let stats;
      try {
        // Follow junctions/cloud placeholders. Dirent.isFile/isDirectory() is
        // false for Windows reparse points, which skipped every nested folder.
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        folderCount += 1;
        await walk(fullPath);
        continue;
      }
      if (!allowed.has(path.extname(name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }

  await walk(root);
  files.sort((left, right) => left.localeCompare(right, 'ko'));
  return { files, folderCount };
}

/**
 * @param {string} root
 * @param {string} filePath
 */
export function toSourcePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

/**
 * @param {string} docType
 * @param {string} filePath
 * @param {string} root
 * @param {(batch: Array<Array<string>> ) => void} onBatch
 */
export async function indexPersonalDocFile(docType, filePath, root, onBatch) {
  const parser = PARSERS[docType];
  if (!parser) {
    throw new Error(`지원하지 않는 문서 종류입니다: ${docType}`);
  }

  const sourcePath = toSourcePath(root, filePath);
  const relativeFolder = path.posix.dirname(sourcePath) === '.' ? '' : path.posix.dirname(sourcePath);
  const fileName = path.basename(filePath);
  const records = await parser(filePath);
  let inserted = 0;
  /** @type {Array<Array<string>>} */
  let batch = [];

  const flush = () => {
    if (!batch.length) return;
    onBatch(batch);
    inserted += batch.length;
    batch = [];
  };

  for (const record of records) {
    batch.push([
      docType,
      relativeFolder,
      fileName,
      sourcePath,
      record.location_label,
      record.location_json,
      record.content,
    ]);
    if (batch.length >= BATCH_SIZE) flush();
  }
  flush();
  return inserted;
}

/**
 * @param {{ size: number, mtime?: number, status?: string } | null | undefined} existing
 * @param {{ size: number, mtimeMs: number }} stats
 */
export function shouldSkipIndexedFile(existing, stats) {
  return (
    existing &&
    existing.status === 'done' &&
    Number(existing.size) === Number(stats.size) &&
    Number(existing.mtime) === Number(stats.mtimeMs)
  );
}

/**
 * @param {string} filePath
 * @param {string} root
 * @param {import('./database.js').PersonalDocIndexDatabase} database
 */
export async function reindexOneFile(filePath, root, database) {
  const sourcePath = toSourcePath(root, filePath);
  const fileName = path.basename(filePath);
  const docType = personalDocTypeForName(fileName);
  if (!docType) {
    database.deleteRecordsBySource(sourcePath);
    database.save();
    return { sourcePath, recordCount: 0, skipped: true };
  }

  const stats = await fs.stat(filePath);
  if (stats.size > PERSONAL_DOC_MAX_FILE_BYTES) {
    database.deleteRecordsBySource(sourcePath);
    database.upsertFile({
      sourcePath,
      size: stats.size,
      mtime: stats.mtimeMs,
      status: 'error',
      message: '파일이 너무 커서 인덱싱하지 않았습니다.',
      recordCount: 0,
    });
    database.save();
    return { sourcePath, recordCount: 0, skipped: true };
  }

  database.deleteRecordsBySource(sourcePath);
  const recordCount = await indexPersonalDocFile(docType, filePath, root, (batch) => {
    database.insertMany(batch);
  });
  database.upsertFile({
    sourcePath,
    size: stats.size,
    mtime: stats.mtimeMs,
    status: 'done',
    recordCount,
  });
  database.save();
  return { sourcePath, recordCount, skipped: false };
}

/**
 * @param {{
 *   root: string,
 *   database: import('./database.js').PersonalDocIndexDatabase,
 *   mode?: 'resume' | 'reset',
 *   onProgress?: (payload: Record<string, unknown>) => void,
 *   shouldCancel?: () => boolean,
 * }} options
 */
export async function buildPersonalDocIndex({
  root,
  database,
  mode = 'resume',
  onProgress,
  shouldCancel,
}) {
  const { files, folderCount } = await collectPersonalDocFiles(root);
  const totalFiles = files.length;
  console.log(`[doc-index] ${root} · ${totalFiles} files · ${folderCount} folders (${mode})`);
  const startedAt = new Date().toISOString();
  database.setJob({ rootPath: root, status: 'running', startedAt });
  database.setFolderCount(folderCount);
  database.save();

  const warnings = [];
  let indexedFiles = 0;
  let skippedFiles = 0;
  let indexedRecords = 0;
  let cancelled = false;

  for (let index = 0; index < files.length; index += 1) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const filePath = files[index];
    const sourcePath = toSourcePath(root, filePath);
    const current = index + 1;
    const percent = totalFiles ? Math.round((current / totalFiles) * 100) : 100;
    const stats = await fs.stat(filePath);
    const existing = database.getFile(sourcePath);

    if (mode === 'resume' && shouldSkipIndexedFile(existing, stats)) {
      skippedFiles += 1;
      onProgress?.({
        fileName: path.basename(filePath),
        current,
        total: totalFiles,
        percent,
        skipped: true,
      });
      continue;
    }

    onProgress?.({
      fileName: path.basename(filePath),
      current,
      total: totalFiles,
      percent,
    });

    try {
      if (stats.size > PERSONAL_DOC_MAX_FILE_BYTES) {
        throw new Error('파일이 너무 커서 인덱싱하지 않았습니다.');
      }
      const docType = personalDocTypeForName(path.basename(filePath));
      if (!docType) continue;
      database.deleteRecordsBySource(sourcePath);
      const recordCount = await indexPersonalDocFile(docType, filePath, root, (batch) => {
        database.insertMany(batch);
      });
      database.upsertFile({
        sourcePath,
        size: stats.size,
        mtime: stats.mtimeMs,
        status: 'done',
        recordCount,
      });
      indexedFiles += 1;
      indexedRecords += recordCount;
      database.save();
    } catch (error) {
      database.upsertFile({
        sourcePath,
        size: stats.size,
        mtime: stats.mtimeMs,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        recordCount: 0,
      });
      database.save();
      warnings.push(`${path.basename(filePath)}: ${error instanceof Error ? error.message : error}`);
    }
  }

  database.setJob({
    rootPath: root,
    status: cancelled ? 'cancelled' : 'done',
    startedAt,
  });
  database.save();

  onProgress?.({
    fileName: '',
    current: cancelled ? indexedFiles + skippedFiles : totalFiles,
    total: totalFiles,
    percent: cancelled
      ? Math.round(((indexedFiles + skippedFiles) / Math.max(totalFiles, 1)) * 100)
      : 100,
    done: true,
    cancelled,
  });

  return {
    root,
    mode,
    cancelled,
    totalFiles,
    indexedFiles,
    skippedFiles,
    indexedRecords,
    warnings,
  };
}
