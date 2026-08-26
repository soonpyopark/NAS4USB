/**
 * Ensure rhwp-studio embed API exposes extra RPC methods.
 * Re-run after updating/replacing `public/rhwp-studio/assets/index-*.js`.
 *
 * - pasteHtml: TipTap → HWPX paste
 * - getPageInfo: HWPX print/PDF page size (px @ 96dpi)
 */
import fs from 'node:fs';
import path from 'node:path';

const assetsDir = 'public/rhwp-studio/assets';
const files = fs.readdirSync(assetsDir).filter((name) => /^index-.*\.js$/.test(name));

if (!files.length) {
  console.error('No rhwp-studio index bundle found');
  process.exit(1);
}

const pasteHtmlInjection =
  'case`pasteHtml`:await yg,a(X.pasteHtml(i?.sectionIdx??0,i?.paraIdx??0,i?.charOffset??0,String(i?.html??"")));break;';
const getPageInfoInjection =
  'case`getPageInfo`:await xg,a(X.getPageInfo(i.page??0));break;';

let patched = 0;
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  let source = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  if (!source.includes('case`pasteHtml`')) {
    const marker = 'Array.from(X.exportHwpx())';
    const idx = source.indexOf(marker);
    const breakIdx = idx >= 0 ? source.indexOf('break;case`exportHwpVerify`', idx) : -1;
    if (breakIdx >= 0) {
      const insertAt = breakIdx + 'break;'.length;
      source = source.slice(0, insertAt) + pasteHtmlInjection + source.slice(insertAt);
      changed = true;
      console.log(`patched pasteHtml: ${file}`);
    } else {
      console.warn(`skip pasteHtml (no exportHwpVerify neighbor): ${file}`);
    }
  }

  if (!source.includes('case`getPageInfo`')) {
    const marker = 'case`getPageSvg`:await xg,a(X.renderPageSvg(i.page??0));break;';
    if (source.includes(marker)) {
      source = source.replace(marker, `${marker}${getPageInfoInjection}`);
      changed = true;
      console.log(`patched getPageInfo: ${file}`);
    } else {
      console.warn(`skip getPageInfo (no getPageSvg case): ${file}`);
    }
  }

  if (!changed) {
    console.log(`skip (already patched): ${file}`);
    continue;
  }

  fs.writeFileSync(fullPath, source);
  patched += 1;
}

if (!patched) {
  console.log('Nothing new to patch');
}
