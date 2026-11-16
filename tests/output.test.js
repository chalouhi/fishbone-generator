'use strict';
// The picture (18), the PDF (19) and the command (27–29).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { F, ROOT, read, sample, docOf } = require('./helpers.js');
const { readPDF } = require('./pdf-read.js');

const PDFLib = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const P = require('../src/pdf.js');
const FONTS = { regular: fs.readFileSync(path.join(ROOT, 'fonts/Carlito-Regular.ttf')), bold: fs.readFileSync(path.join(ROOT, 'fonts/Carlito-Bold.ttf')) };
const pdfOf = (doc, trace) => P.build(doc, Object.assign({ PDFLib, fontkit, trace }, FONTS));
const CLI = path.join(ROOT, 'bin', 'fishbone.js');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fishbone-'));

test('the picture stands alone: white, own colours and fonts, links, everything in it (requirement 18)', () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const pic = F.pictureSVG(doc);
  assert.match(pic, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1000" /);
  assert.match(pic, /<rect width="100%" height="100%" fill="#ffffff"\/>/);
  assert.match(pic, /<style>svg text\{font-family:Calibri/);
  assert.doesNotMatch(pic, /<image|xlink:href|@import|url\(/);
  assert.match(pic, /<a href="https:\/\/example.com\/cards\/P1">/);
  for (const s of ['5 of 10', 'Phase 3: Growth → Mobile app', 'Side items', 'Legend']) assert.ok(pic.includes(s), s);
  assert.equal((pic.match(/<svg x=/g) || []).length, 4); // three phases and the side items
  assert.equal(F.parseXML(pic).name, 'svg');
  assert.match(F.pictureSVG(doc, 640), /^<svg [^>]*width="640"/);
});

test('the PDF: A4 portrait, real text, links, the names table (requirement 19, scenario 2)', async () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const out = await readPDF(await pdfOf(doc));
  for (const p of out.pages) { assert.ok(Math.abs(p.width - 595.28) < 0.01); assert.ok(Math.abs(p.height - 841.89) < 0.01); }
  const text = out.pages.map(p => p.text).join('\n');
  for (const s of ['Customer portal', 'Phase 1: Pilot → Pilot live', 'Phase 2: Launch → Open to all', 'Phase 3: Growth → Mobile app', 'Side items', '+1 more', 'Legend', 'Names', 'Number alignment', 'L1d', 'no (not set)', 'Pilot live'])
    assert.ok(text.includes(s), s);
  assert.ok(text.includes('5 of 10'));
  assert.ok(!text.replace(/Before go-live\?/g, '').includes('?'), 'every character has a glyph');
  const links = out.pages.flatMap(p => p.links);
  assert.ok(links.includes('https://example.com/cards/P1')); assert.ok(links.includes('https://example.com/cards/L3'));
  assert.ok(out.pages[0].fonts.every(f => /Carlito/.test(f)));
  // the table lists L1d after the drawings
  const at = s => text.indexOf(s);
  assert.ok(at('Names') > at('Legend') && text.lastIndexOf('L1d') > at('Names'));
});

test('the PDF never cuts a drawing or a table row across two pages', async () => {
  const steps = Array.from({ length: 60 }, (_, i) => ({ id: 'S' + i, name: 'A step with a fairly long name to wrap in the table, number ' + i, stage: i < 20 ? 'Live' : 'To do',
    children: Array.from({ length: 3 }, (_, j) => ({ id: `${i}c${j}`, name: 'Child ' + j, before_golive: j === 0 })) }));
  const doc = docOf(JSON.stringify({ fishbone: 1, title: 'Many pages', phases: [{ name: 'One', steps: steps.slice(0, 30) }, { name: 'Two', steps: steps.slice(30) }] }));
  const trace = [];
  const out = await readPDF(await pdfOf(doc, trace));
  assert.ok(out.pages.length >= 4, String(out.pages.length));
  assert.ok(trace.length > 200);
  for (const b of trace) assert.ok(b.top >= 40 - 1e-6 && b.bottom <= 841.89 - 40 + 1e-6, JSON.stringify(b));
  const text = out.pages.map(p => p.text).join('\n');
  for (let i = 0; i < 60; i++) assert.ok(text.includes('S' + i), 'S' + i);
});

test('the command writes the picture and the PDF and ends with success (requirements 27, 28; scenario 2)', async () => {
  const d = tmp();
  const r = run(path.join(ROOT, 'samples/2-comprehensive.json'), '--svg', path.join(d, 'p.svg'), '--pdf', path.join(d, 'p.pdf'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(d, 'p.svg'), 'utf8'), F.pictureSVG(docOf(sample('2-comprehensive.json')), 1000));
  assert.equal(fs.readFileSync(path.join(d, 'p.pdf')).subarray(0, 5).toString(), '%PDF-');
  const w = run(path.join(ROOT, 'samples/3-long-line.json'), '--svg', path.join(d, 'n.svg'), '--width', '640');
  assert.equal(w.status, 0);
  assert.match(fs.readFileSync(path.join(d, 'n.svg'), 'utf8'), /^<svg [^>]*width="640"/);
  const only = run(path.join(ROOT, 'tests/fixtures/1-smallest.xml'), '--pdf', path.join(d, 'x.pdf'));
  assert.equal(only.status, 0); assert.ok(!fs.existsSync(path.join(d, 'x.svg')));
});

test('with a wrong file the command writes nothing, prints the seven lines and fails (requirement 28, scenario 5)', () => {
  const d = tmp();
  const r = run(path.join(ROOT, 'samples/5-broken.json'), '--svg', path.join(d, 'b.svg'), '--pdf', path.join(d, 'b.pdf'));
  assert.equal(r.status, 1);
  assert.equal(r.stdout, read('expected', '5-broken.errors.txt').trimEnd() + '\n');
  assert.match(r.stderr, /No fishbone drawn\. 7 problems in this file/);
  assert.deepEqual(fs.readdirSync(d), []);
  assert.equal(run().status, 2);
  assert.equal(run(path.join(ROOT, 'samples/1-smallest.json')).status, 2);
  assert.equal(run(path.join(ROOT, 'samples/1-smallest.json'), '--svg', path.join(d, 'z.svg'), '--width', '100').status, 2);
  assert.deepEqual(fs.readdirSync(d), []);
});
