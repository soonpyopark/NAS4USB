import { embedMarkupsIntoPdfBytes } from '../shared/pdf/embedPdfMarkups.js';
import { readFileBuffer, writeFileBuffer } from './fsService.js';

function isSecFileName(nameOrPath) {
  const base = String(nameOrPath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  return base.toLowerCase().endsWith('.sec') && base.length > 4;
}

/**
 * Embed highlight / underline markups into a workspace PDF on the host.
 * The browser only sends markup JSON — it must not round-trip the PDF bytes.
 *
 * @param {string} relativePath
 * @param {unknown} markups
 * @param {unknown} remove
 */
export async function embedMarkupsIntoWorkspacePdf(relativePath, markups = [], remove = []) {
  const target = String(relativePath ?? '').trim();
  if (!target) throw new Error('저장할 PDF 경로가 없습니다.');
  if (isSecFileName(target)) {
    throw new Error('암호화된 PDF는 이 방식으로 저장할 수 없습니다.');
  }

  const source = await readFileBuffer(target);
  const nextBytes = await embedMarkupsIntoPdfBytes(
    new Uint8Array(source),
    Array.isArray(markups) ? markups : [],
    Array.isArray(remove) ? remove : [],
  );
  await writeFileBuffer(target, Buffer.from(nextBytes));
  return { ok: true };
}
