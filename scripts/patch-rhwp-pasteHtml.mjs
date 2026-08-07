/**
 * Ensure rhwp-studio embed API exposes `pasteHtml` (used by TipTap → HWPX export).
 * Re-run after updating/replacing `public/rhwp-studio/assets/index-*.js`.
 */
import fs from 'node:fs';
import path from 'node:path';

const assetsDir = 'public/rhwp-studio/assets';
const files = fs.readdirSync(assetsDir).filter((name) => /^index-.*\.js$/.test(name));

if (!files.length) {
  console.error('No rhwp-studio index bundle found');
  process.exit(1);
}

const injection =
  'case`pasteHtml`:await yg,a(X.pasteHtml(i?.sectionIdx??0,i?.paraIdx??0,i?.charOffset??0,String(i?.html??"")));break;';

let patched = 0;
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  let source = fs.readFileSync(fullPath, 'utf8');
  if (source.includes('case`pasteHtml`')) {
    console.log(`skip (already patched): ${file}`);
    continue;
  }

  const marker = 'Array.from(X.exportHwpx())';
  const idx = source.indexOf(marker);
  if (idx < 0) {
    console.warn(`skip (no exportHwpx): ${file}`);
    continue;
  }

  const breakIdx = source.indexOf('break;case`exportHwpVerify`', idx);
  if (breakIdx < 0) {
    console.warn(`skip (no exportHwpVerify neighbor): ${file}`);
    continue;
  }

  const insertAt = breakIdx + 'break;'.length;
  source = source.slice(0, insertAt) + injection + source.slice(insertAt);
  fs.writeFileSync(fullPath, source);
  console.log(`patched: ${file}`);
  patched += 1;
}

if (!patched) {
  console.log('Nothing new to patch');
}
