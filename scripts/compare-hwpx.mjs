import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const nasPath = process.argv[2] ?? 'c:/Users/user/Desktop/Scan/NoName-nas4usb.hwpx';
const refPath = process.argv[3] ?? 'c:/Users/user/Downloads/NoName.hwpx';

async function loadZip(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  /** @type {Record<string, string>} */
  const files = {};
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    files[name] = await zip.file(name).async('string');
  }
  return files;
}

function localName(el) {
  return (el.localName || el.nodeName.split(':').pop() || '').toLowerCase();
}

function summarizeSection(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const tblIds = [];
  for (const el of doc.getElementsByTagName('*')) {
    if (localName(el) === 'tbl') tblIds.push(el.getAttribute('id'));
  }

  const charRefs = new Set();
  const paraRefs = new Set();
  const styleRefs = new Set();
  for (const el of doc.getElementsByTagName('*')) {
    for (const attr of ['charPrIDRef', 'paraPrIDRef', 'styleIDRef']) {
      const v = el.getAttribute(attr);
      if (v != null) {
        if (attr === 'charPrIDRef') charRefs.add(v);
        if (attr === 'paraPrIDRef') paraRefs.add(v);
        if (attr === 'styleIDRef') styleRefs.add(v);
      }
    }
  }

  console.log(`\n=== ${label} section0 ===`);
  console.log('tbl ids:', tblIds);
  console.log('charPrIDRef:', [...charRefs].sort());
  console.log('paraPrIDRef:', [...paraRefs].sort());
  console.log('styleIDRef:', [...styleRefs].sort());

  /** @type {string[]} */
  const paragraphs = [];
  for (const el of doc.getElementsByTagName('*')) {
    if (localName(el) !== 'p') continue;
    const parent = el.parentNode;
    if (!parent || localName(parent) !== 'sec') continue;
    const text = [...el.getElementsByTagName('*')]
      .filter((n) => localName(n) === 't')
      .map((n) => n.textContent ?? '')
      .join('');
    paragraphs.push(text.slice(0, 80));
  }
  console.log('top-level paragraphs:', paragraphs.length);
  paragraphs.forEach((p, i) => console.log(`  p${i}:`, JSON.stringify(p)));
}

function summarizeHeader(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  /** @type {string[]} */
  const fonts = [];
  /** @type {string[]} */
  const charPr = [];
  /** @type {string[]} */
  const paraPr = [];
  for (const el of doc.getElementsByTagName('*')) {
    const name = localName(el);
    if (name === 'font') {
      fonts.push(`${el.getAttribute('id')}:${el.getAttribute('face')}`);
    }
    if (name === 'charpr') {
      charPr.push(
        `${el.getAttribute('id')}|height=${el.getAttribute('height')}|bold=${el.getAttribute('bold')}|fontRef=${el.getAttribute('fontRef')}`,
      );
    }
    if (name === 'parapr') {
      paraPr.push(`${el.getAttribute('id')}|align=${el.getAttribute('align')}|lineSpacing=${el.getAttribute('lineSpacing')}`);
    }
  }
  console.log(`\n=== ${label} header ===`);
  console.log('fonts:', fonts.slice(0, 15).join('; '));
  console.log('charPr count:', charPr.length, charPr.slice(0, 8).join('\n  '));
  console.log('paraPr count:', paraPr.length, paraPr.slice(0, 8).join('\n  '));
}

function dumpTables(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  let idx = 0;
  for (const el of doc.getElementsByTagName('*')) {
    if (localName(el) !== 'tbl') continue;
    idx += 1;
    console.log(`\n--- ${label} table ${idx} id=${el.getAttribute('id')} rowCnt=${el.getAttribute('rowCnt')} colCnt=${el.getAttribute('colCnt')} ---`);
    let trIdx = 0;
    for (const child of el.children) {
      if (localName(child) !== 'tr') continue;
      trIdx += 1;
      const cells = [];
      for (const tc of child.children) {
        if (localName(tc) !== 'tc') continue;
        const span = tc.getElementsByTagName('*');
        let colspan = '1';
        let rowspan = '1';
        for (let i = 0; i < span.length; i++) {
          const n = localName(span[i]);
          if (n === 'cellspan') {
            colspan = span[i].getAttribute('colSpan') ?? '1';
            rowspan = span[i].getAttribute('rowSpan') ?? '1';
          }
        }
        const text = [...tc.getElementsByTagName('*')]
          .filter((n) => localName(n) === 't')
          .map((n) => n.textContent ?? '')
          .join('')
          .slice(0, 40);
        const nestedTbl = [...tc.getElementsByTagName('*')].some((n) => localName(n) === 'tbl');
        cells.push(`span=${colspan}x${rowspan}${nestedTbl ? '+tbl' : ''}:${JSON.stringify(text)}`);
      }
      console.log(` tr${trIdx}:`, cells.join(' | '));
    }
  }
}

const nas = await loadZip(nasPath);
const ref = await loadZip(refPath);

summarizeSection(nas['Contents/section0.xml'], 'nas4usb');
summarizeSection(ref['Contents/section0.xml'], 'reference');
summarizeHeader(nas['Contents/header.xml'], 'nas4usb');
summarizeHeader(ref['Contents/header.xml'], 'reference');
dumpTables(nas['Contents/section0.xml'], 'nas4usb');
dumpTables(ref['Contents/section0.xml'], 'reference');

console.log('\n=== content.hpf diff ===');
console.log('nas4usb:', nas['Contents/content.hpf'].slice(0, 500));
console.log('reference:', ref['Contents/content.hpf'].slice(0, 500));

console.log('\n=== PrvText ===');
console.log('nas4usb:', JSON.stringify(nas['Preview/PrvText.txt']));
console.log('reference:', JSON.stringify(ref['Preview/PrvText.txt'].slice(0, 300)));
