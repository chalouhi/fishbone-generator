'use strict';
// Reads back what a PDF says, with pdf-lib only: page sizes, the text on each
// page (through each font's ToUnicode map, so this is the text a reader can
// select and copy) and the link addresses.
const PDFLib = require('../vendor/pdf-lib.min.js');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = PDFLib;

const bytesOf = s => (s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents());
const str = b => Buffer.from(b).toString('latin1');

function cmap(stream) {
  const t = str(bytesOf(stream)), m = new Map();
  const u = h => String.fromCodePoint(...(h.match(/.{4}/g) || []).map(x => parseInt(x, 16)));
  for (const blk of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, a, b] of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) m.set(parseInt(a, 16), u(b));
  for (const blk of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, a, b, c] of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const s = parseInt(c, 16);
      for (let g = parseInt(a, 16); g <= parseInt(b, 16); g++) m.set(g, String.fromCodePoint(s + g - parseInt(a, 16)));
    }
  return m;
}

async function readPDF(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const pages = [];
  for (const page of pdf.getPages()) {
    const node = page.node, fonts = {};
    const fd = node.Resources().lookup(PDFName.of('Font'), PDFDict);
    if (fd) for (const [k, ref] of fd.entries()) {
      const f = pdf.context.lookup(ref, PDFDict), tu = f.lookup(PDFName.of('ToUnicode'));
      fonts[k.asString().slice(1)] = { map: tu ? cmap(tu) : new Map(), base: String(f.get(PDFName.of('BaseFont'))) };
    }
    const c = node.Contents();
    const streams = c instanceof PDFArray ? c.asArray().map(r => pdf.context.lookup(r)) : [c];
    const content = streams.map(s => str(bytesOf(s))).join('\n');
    let font = null; const lines = [];
    for (const m of content.matchAll(/\/(\S+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj/g)) {
      if (m[1]) { font = fonts[m[1]]; continue; }
      lines.push((m[2].match(/.{4}/g) || []).map(h => (font && font.map.get(parseInt(h, 16))) || '?').join(''));
    }
    const links = [];
    const annots = node.Annots();
    if (annots) for (const r of annots.asArray()) {
      const a = pdf.context.lookup(r, PDFDict), act = a.lookup(PDFName.of('A'), PDFDict);
      if (act) links.push(act.get(PDFName.of('URI')).decodeText());
    }
    const { width, height } = page.getSize();
    pages.push({ width, height, lines, text: lines.join('\n'), links, fonts: Object.values(fonts).map(f => f.base) });
  }
  return { pages, title: pdf.getTitle() };
}
module.exports = { readPDF };
