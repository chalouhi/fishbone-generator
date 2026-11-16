'use strict';
// The demo page and the script for other pages, in a real browser
// (scenarios 1, 3, 4, 5; requirements 20–26 and 30). Needs Playwright with
// Chromium; skipped when it is not installed. No network is used: the page is
// served from this machine, and every request after the page has loaded fails
// the test.
//   SHOTS=<folder> also saves screenshots there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { F, ROOT, read, sample, docOf, toXML } = require('../helpers.js');
const { readPDF } = require('../pdf-read.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* skipped below */ }
const SHOTS = process.env.SHOTS;
const skip = chromium ? false : 'Playwright is not installed';

let server, browser;
test.before(async () => { if (skip) return; server = await serve(); browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// Opens the demo page and starts counting requests made after it has loaded.
async function open(width, height = 900, url = '') {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + url, { waitUntil: 'load' });
  const late = [];
  page.on('request', r => { if (!/^(data|blob):/.test(r.url())) late.push(r.url()); });
  return { page, context, late, errors };
}
// Waits until fn (run in the page) is true. Plain polling: the demo page's
// Content-Security-Policy forbids the string evaluation waitForFunction uses.
async function until(page, fn, arg, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error('timed out waiting for ' + fn);
    await new Promise(r => setTimeout(r, 20));
  }
}
async function give(page, name, text, how = 'drop') {
  await page.evaluate(() => document.getElementById('out').removeAttribute('data-state'));
  if (how === 'drop') {
    await page.evaluate(([name, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: name.endsWith('.xml') ? 'application/xml' : 'application/json' }));
      document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [name, text]);
  } else if (how === 'choose') {
    await page.setInputFiles('#file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  } else {
    await page.evaluate(() => { document.getElementById('pastebox').open = true; });
    await page.fill('#paste', text);
  }
  await until(page, () => document.getElementById('out').getAttribute('data-state'));
}
// What the drawing shows, read from the page (inside the shadow root).
const look = page => page.evaluate(() => {
  const root = document.getElementById('out').shadowRoot;
  const rgb = el => getComputedStyle(el).fill;
  const boxes = [...root.querySelectorAll('.bone-wrap svg g')].filter(g => g.querySelector('title')).map(g => {
    const r = g.querySelector('rect'), a = g.closest('a');
    return { id: g.querySelector('title').textContent.split(' ')[0], fill: rgb(r), w: +r.getAttribute('width'), y: +r.getAttribute('y'), x: +r.getAttribute('x'), href: a ? a.getAttribute('href') : null, svg: [...root.querySelectorAll('.bone-wrap svg')].indexOf(g.closest('svg')) };
  });
  const head = [...root.querySelectorAll('g.golive')].map(g => ({ text: g.textContent, fill: rgb(g.querySelector('rect')), y: +g.querySelector('rect').getAttribute('y') }));
  const svgs = [...root.querySelectorAll('.bone-wrap svg')].map(s => ({ w: +s.getAttribute('width'), html: s.outerHTML }));
  const slots = [...root.querySelectorAll('.bone-wrap')].map(s => s.clientWidth);
  const rows = [...root.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
  const notes = [...root.querySelectorAll('text.note')].map(t => t.textContent);
  const progress = (root.querySelector('.progress') || {}).textContent;
  const chips = [...root.querySelectorAll('.legend .chip')].map(c => c.textContent);
  const err = root.querySelector('.err');
  return { boxes, head, svgs, slots, rows, notes, progress, chips, err: err && { head: err.querySelector('b').textContent, items: [...err.querySelectorAll('li')].map(l => l.textContent) },
    buttons: ['dl-svg', 'dl-pdf'].map(id => document.getElementById(id).disabled), scrollW: document.documentElement.scrollWidth, status: document.getElementById('status').textContent };
});
const GREY = 'rgb(241, 239, 232)', AMBER = 'rgb(250, 238, 218)', BLUE = 'rgb(230, 241, 251)', RED = 'rgb(252, 235, 235)', GREEN = 'rgb(225, 245, 238)';
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };
// Rows of the main line as the page draws it: boxes 52 wide grouped by height.
const rowsOf = (boxes, svg = 0) => { const m = new Map(); boxes.filter(b => b.w === 52 && b.svg === svg).forEach(b => m.set(b.y, (m.get(b.y) || 0) + 1)); return [...m.keys()].sort((a, b) => a - b).map(k => m.get(k)); };

test('scenario 1: the smallest file dropped on the page, then pasted as XML', { skip }, async () => {
  const { page, late, errors, context } = await open(1280);
  await give(page, '1-smallest.json', sample('1-smallest.json'));
  const v = await look(page);
  assert.deepEqual(v.boxes.map(b => [b.id, b.fill]), [['1', GREY], ['2', AMBER], ['3', BLUE]]);
  assert.deepEqual(v.head, [{ text: 'Kitchen in use', fill: BLUE, y: v.head[0].y }]);
  assert.equal(v.progress, '1 of 3 on MAIN Live · 0 critical children open');
  assert.deepEqual(v.rows.map(r => r[2]), ['Live', 'Building', 'To do']);
  assert.deepEqual(v.buttons, [false, false]);
  await shot(page, 'scenario-1');
  await give(page, '', toXML(JSON.parse(sample('1-smallest.json'))), 'paste');
  const x = await look(page);
  assert.deepEqual(x.svgs, v.svgs);
  assert.deepEqual(x.rows, v.rows);
  await give(page, '1-smallest.xml', read('tests', 'fixtures', '1-smallest.xml'), 'choose');
  assert.deepEqual((await look(page)).svgs, v.svgs);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 2 on the page: phases fold and fade; downloads (requirements 22, 23)', { skip }, async () => {
  const { page, late, errors, context } = await open(1280);
  await give(page, '2-comprehensive.json', sample('2-comprehensive.json'));
  const st = await page.evaluate(() => [...document.getElementById('out').shadowRoot.querySelectorAll('.phase')].map(s => ({ cls: s.className, open: s.querySelector('details').open, sum: s.querySelector('summary').textContent, op: getComputedStyle(s).opacity })));
  assert.deepEqual(st.map(s => [s.cls, s.open]), [['phase done', false], ['phase current', true], ['phase future', true]]);
  assert.match(st[0].sum, /^✓Phase 1: Pilot → Pilot live/);
  assert.match(st[2].sum, /not started$/); assert.equal(st[2].op, '0.55');
  const p1Shown = () => page.evaluate(() => { const t = [...document.getElementById('out').shadowRoot.querySelectorAll('svg title')].find(t => t.textContent.startsWith('P1 ')); return !!t && t.parentNode.checkVisibility(); });
  assert.equal(await p1Shown(), false, 'the Live phase is folded');
  await page.evaluate(() => document.getElementById('out').shadowRoot.querySelector('.phase.done summary').click());
  await until(page, () => document.getElementById('out').shadowRoot.querySelector('.phase.done details').open);
  assert.equal(await p1Shown(), true, 'opens on click');
  const p1 = (await look(page)).boxes.find(b => b.id === 'P1');
  assert.equal(p1.href, 'https://example.com/cards/P1');
  assert.ok((await look(page)).rows.some(r => r[0].includes('L1d')));
  await shot(page, 'scenario-2-page');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-svg')]);
  assert.equal(dl.suggestedFilename(), 'customer-portal.svg');
  assert.equal(fs.readFileSync(await dl.path(), 'utf8'), F.pictureSVG(docOf(sample('2-comprehensive.json')), 1000));
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-pdf')]);
  assert.equal(dl.suggestedFilename(), 'customer-portal.pdf');
  const pdf = await readPDF(fs.readFileSync(await dl.path()));
  const text = pdf.pages.map(p => p.text).join('\n');
  for (const s of ['Phase 1: Pilot → Pilot live', 'Phase 3: Growth → Mobile app', 'L1d', 'Number alignment']) assert.ok(text.includes(s), s);
  assert.ok(pdf.pages.every(p => Math.abs(p.width - 595.28) < 0.01 && Math.abs(p.height - 841.89) < 0.01));
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 3: a long line wraps at 1,000 points, and still reads at 375 without asking again', { skip }, async () => {
  const { page, late, errors, context } = await open(1000);
  await give(page, '3-long-line.json', sample('3-long-line.json'));
  let v = await look(page);
  assert.equal(v.slots[0], 970);
  assert.deepEqual(rowsOf(v.boxes), [9, 8, 11]);
  assert.deepEqual(v.notes, ['Live · continues below', 'Live · continues below']);
  assert.equal(v.head[0].text, 'Moved in');
  const main = v.boxes.filter(b => b.w === 52);
  main.forEach(b => assert.equal(b.fill, +b.id <= 17 ? GREY : +b.id <= 19 ? AMBER : BLUE, b.id));
  v.boxes.forEach(b => assert.equal(b.href, 'https://example.com/cards/' + b.id));
  await shot(page, 'scenario-3-1000');
  const status = v.status;
  await page.setViewportSize({ width: 375, height: 800 });
  await until(page, () => +document.getElementById('out').shadowRoot.querySelector('.bone-wrap svg').getAttribute('width') <= 375);
  v = await look(page);
  assert.ok(v.scrollW <= 375, 'no sideways scroll: ' + v.scrollW);
  const rows = rowsOf(v.boxes);
  assert.equal(rows.reduce((a, b) => a + b, 0), 28);
  rows.slice(0, -1).forEach(n => assert.ok(n >= 4, String(rows)));
  const lastRowY = Math.max(...v.boxes.filter(b => b.w === 52).map(b => b.y));
  assert.ok(v.head[0].y > lastRowY + 28, 'head on its own line');
  assert.equal(v.status, status, 'drawn again from what it had, not read again');
  await shot(page, 'scenario-3-375');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 4: an extra stage and custom colours', { skip }, async () => {
  const { page, late, errors, context } = await open(1280);
  await give(page, '4-custom-colours.json', sample('4-custom-colours.json'));
  const v = await look(page);
  const fill = id => v.boxes.find(b => b.id === id).fill;
  for (const id of ['3', '3a']) assert.equal(fill(id), RED, id);
  assert.equal(fill('4'), AMBER);
  for (const id of ['3b', '5', '5a']) assert.equal(fill(id), GREEN, id);
  for (const id of ['1', '2', '2a']) assert.equal(fill(id), GREY, id);
  assert.equal(v.head[0].text, 'Launch day'); assert.equal(v.head[0].fill, GREEN);
  assert.deepEqual(v.chips, ['To do', 'Building', 'Live', 'Blocked']);
  assert.equal(v.progress, '2 of 5 on MAIN Live · 2 critical children open');
  await shot(page, 'scenario-4');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 5: a wrong file replaces the drawing with the seven problems', { skip }, async () => {
  const { page, late, errors, context } = await open(1280);
  await give(page, '1-smallest.json', sample('1-smallest.json'));
  assert.equal((await look(page)).svgs.length, 1);
  await give(page, '5-broken.json', sample('5-broken.json'));
  const v = await look(page);
  assert.equal(v.svgs.length, 0);
  assert.equal(v.err.head, 'No fishbone drawn. 7 problems in this file');
  assert.deepEqual(v.err.items, read('expected', '5-broken.errors.txt').trimEnd().split('\n'));
  assert.equal(v.err.items[0], 'The go-live name ("golive") is missing.');
  assert.ok(v.err.items.includes('Step 3 (id "THREE-LONG"): the stage "Urgent" is not defined. Defined: To do, Building, Live.'));
  assert.deepEqual(v.buttons, [true, true]);
  await shot(page, 'scenario-5');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('the page offers the five samples and links to the guide; 200 items within 1 second (requirements 25, 26)', { skip }, async () => {
  const { page, late, errors, context } = await open(1280);
  const labels = await page.$$eval('[data-sample]', bs => bs.map(b => b.getAttribute('data-sample')));
  assert.deepEqual(labels, ['1-smallest.json', '2-comprehensive.json', '3-long-line.json', '4-custom-colours.json', '5-broken.json']);
  assert.match(await page.getAttribute('#guide', 'href'), /docs\/file-format\.md$/);
  await page.click('[data-sample="4-custom-colours.json"]');
  await until(page, () => document.getElementById('out').getAttribute('data-state') === 'drawn');
  const steps = Array.from({ length: 40 }, (_, i) => ({ id: 'S' + i, name: 'Step ' + i, stage: i < 15 ? 'Live' : 'To do', children: Array.from({ length: 4 }, (_, j) => ({ id: `${i}c${j}`, name: 'Child', before_golive: j % 2 === 0 })) }));
  const text = JSON.stringify({ fishbone: 1, title: 'Two hundred', golive: 'Done', steps });
  const ms = await page.evaluate(text => new Promise(resolve => {
    const out = document.getElementById('out'); out.removeAttribute('data-state');
    const t0 = performance.now();
    const dt = new DataTransfer(); dt.items.add(new File([text], 'big.json'));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    (function wait() { if (out.getAttribute('data-state')) requestAnimationFrame(() => resolve(performance.now() - t0)); else setTimeout(wait, 1); })();
  }), text);
  assert.ok(ms < 1000, ms + ' ms');
  assert.equal((await look(page)).rows.length, 200);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('the script for other pages draws inside its place only (requirement 30)', { skip }, async () => {
  const { page, late, errors, context } = await open(1100, 900, 'tests/fixtures/embed.html');
  const before = await page.evaluate(() => ({ html: document.documentElement.outerHTML, sheets: document.styleSheets.length, p: getComputedStyle(document.querySelector('p.mine')).cssText || [...getComputedStyle(document.querySelector('p.mine'))].map(k => k + getComputedStyle(document.querySelector('p.mine')).getPropertyValue(k)).join(';'), t: getComputedStyle(document.querySelector('table')).borderTopColor }));
  const r = await page.evaluate(text => { const r = Fishbone.draw(document.getElementById('place'), text); return { ok: r.ok, errors: r.errors }; }, sample('2-comprehensive.json'));
  assert.equal(r.ok, true);
  const after = await page.evaluate(() => {
    const root = document.getElementById('place').shadowRoot;
    return { html: document.documentElement.outerHTML, sheets: document.styleSheets.length, p: getComputedStyle(document.querySelector('p.mine')).cssText || [...getComputedStyle(document.querySelector('p.mine'))].map(k => k + getComputedStyle(document.querySelector('p.mine')).getPropertyValue(k)).join(';'), t: getComputedStyle(document.querySelector('table')).borderTopColor,
      widths: [...root.querySelectorAll('svg')].map(s => +s.getAttribute('width')), place: document.getElementById('place').clientWidth };
  });
  assert.equal(after.html, before.html, 'nothing outside the place changed');
  assert.equal(after.sheets, before.sheets);
  assert.equal(after.p, before.p); assert.equal(after.t, before.t);
  assert.ok(after.widths.length >= 2 && after.widths.every(w => w <= after.place), String(after.widths));
  const bad = await page.evaluate(text => { const r = Fishbone.draw(document.getElementById('place'), text); return { ok: r.ok, errors: r.errors }; }, sample('5-broken.json'));
  assert.equal(bad.ok, false); assert.equal(bad.errors.length, 7);
  await shot(page, 'embed');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});
