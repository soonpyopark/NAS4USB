import fs from 'node:fs';
import JSZip from 'jszip';

async function extractCellXml(hwpxPath, tableIdx, cellIdx) {
  const zip = await JSZip.loadAsync(fs.readFileSync(hwpxPath));
  const xml = await zip.file('Contents/section0.xml').async('string');
  const tblRe = /<hp:tbl[\s\S]*?<\/hp:tbl>/g;
  const tbls = xml.match(tblRe) ?? [];
  const tbl = tbls[tableIdx - 1];
  if (!tbl) return null;
  const tcRe = /<hp:tc[\s\S]*?<\/hp:tc>/g;
  const tcs = tbl.match(tcRe) ?? [];
  return tcs[cellIdx - 1] ?? null;
}

function show(label, xml) {
  if (!xml) {
    console.log(label, '(missing)');
    return;
  }
  const pretty = xml
    .replace(/></g, '>\n<')
    .replace(/<hp:t>/g, '\n  TEXT: ')
    .slice(0, 12000);
  console.log(`\n===== ${label} =====\n${pretty}\n`);
}

const nas = 'c:/Users/user/Desktop/Scan/NoName-nas4usb.hwpx';
const ref = 'c:/Users/user/Downloads/NoName.hwpx';

show('nas content cell (1,3)', await extractCellXml(nas, 1, 3));
show('ref content cell (1,3)', await extractCellXml(ref, 1, 3));
show('nas right cell (1,4)', await extractCellXml(nas, 1, 4));
show('ref right cell (1,4)', await extractCellXml(ref, 1, 4));

// numbering elements
for (const [path, label] of [
  [nas, 'nas'],
  [ref, 'ref'],
]) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path));
  const xml = await zip.file('Contents/section0.xml').async('string');
  const nums = xml.match(/<hp:[^>]*numbering[^>]*>/gi) ?? [];
  const bullets = xml.match(/<hp:[^>]*bullet[^>]*>/gi) ?? [];
  console.log(label, 'numbering tags:', nums.length, 'bullet tags:', bullets.length);
  const runs = [...xml.matchAll(/<hp:run([^>]*)>/g)].slice(0, 15).map((m) => m[1]);
  console.log(label, 'sample run attrs:', runs.slice(0, 5));
}
