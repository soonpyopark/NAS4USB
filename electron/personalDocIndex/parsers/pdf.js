import fs from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

/**
 * @param {string} filePath
 */
export async function parsePdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.pages || [])
      .map((page) => ({
        location_label: `${page.num}쪽`,
        location_json: JSON.stringify({ page: page.num }),
        content: String(page.text || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((record) => record.content);
  } finally {
    await parser.destroy();
  }
}
