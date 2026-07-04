import fs from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

globalThis.DOMParser = DOMParser;

const { convertHwpxZipToHtml } = await import('../src/lib/hwpx/hwpxToHtml.js');

const src = 'c:/Users/user/Desktop/동사 활용.hwpx';
const buf = fs.readFileSync(src);
const zip = await JSZip.loadAsync(buf);
const section = await zip.file('Contents/section0.xml').async('string');

const rowSpans = [...section.matchAll(/rowSpan="(\d+)"/g)].map((m) => Number(m[1]));
console.log('rowSpan max', Math.max(...rowSpans));
console.log('rowSpan>1', rowSpans.filter((v) => v > 1).length);
console.log('rowSpan=0', rowSpans.filter((v) => v === 0).length);

const trBlocks = section.split('<hp:tr>').slice(1);
console.log('hp:tr count', trBlocks.length);

for (let i = 0; i < Math.min(15, trBlocks.length); i++) {
  const block = trBlocks[i].split('</hp:tr>')[0];
  const tcs = block.split('<hp:tc').slice(1);
  const info = tcs.map((tc) => {
    const colM = tc.match(/colAddr="(\d+)"/);
    const rowM = tc.match(/rowAddr="(\d+)"/);
    const csM = tc.match(/colSpan="(\d+)"/);
    const rsM = tc.match(/rowSpan="(\d+)"/);
    const textM = tc.match(/<hp:t>([^<]*)<\/hp:t>/);
    const text = (textM?.[1] || '').slice(0, 20);
    return `[c${colM?.[1] ?? '?'}r${rowM?.[1] ?? '?'} cs${csM?.[1] ?? '?'}rs${rsM?.[1] ?? '?'} "${text}"]`;
  });
  console.log('row', i, 'cells', tcs.length, info.join(' '));
}

const header = await zip.file('Contents/header.xml').async('string');
for (const id of ['0', '5', '7', '8', '10', '11', '12']) {
  const re = new RegExp(`<hh:charPr id="${id}"[^>]*>`, 'i');
  const m = header.match(re);
  if (m) console.log('charPr', id, m[0]);
}
for (const id of ['0', '20', '21']) {
  const re = new RegExp(`<hh:paraPr id="${id}"[^>]*>`, 'i');
  const m = header.match(re);
  if (m) console.log('paraPr', id, m[0]);
}

for (const id of ['20', '21']) {
  const start = header.indexOf(`<hh:paraPr id="${id}"`);
  if (start >= 0) console.log('paraPr block', id, header.slice(start, start + 500));
}

const fonts = [...header.matchAll(/<hh:font id="(\d+)" face="([^"]+)"/g)];
console.log('fonts sample', fonts.slice(0, 8).map((m) => `${m[1]}:${m[2]}`).join(', '));

const html = await convertHwpxZipToHtml(zip);
console.log('html length', html.length);
console.log('tables', (html.match(/<table/gi) || []).length);
console.log('tds', (html.match(/<td/gi) || []).length);
console.log('red spans', (html.match(/#FF0000/gi) || []).length);
console.log('center align', (html.match(/text-align:center/gi) || []).length);
console.log('has title', html.includes('동사의 활용'));
console.log('has table header', html.includes('구분'));
fs.writeFileSync('temp-output.html', `<!doctype html><html><head><meta charset=utf-8><style>table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:4px}</style></head><body>${html}</body></html>`);
console.log('wrote temp-output.html');
