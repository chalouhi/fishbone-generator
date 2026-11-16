'use strict';
// The drawing: every sample against its expected picture, the 12 reference
// pictures, and the drawing requirements (5–17).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { F, ROOT, read, sample, docOf, toXML, rowsOf, svgWidth } = require('./helpers.js');
const { referenceFiles } = require('./reference-file.js');

const SAMPLES = ['1-smallest', '2-comprehensive', '3-long-line', '4-custom-colours'];

test('each sample draws exactly its expected picture (970 points)', async t => {
  const expected = fs.readdirSync(path.join(ROOT, 'expected')).filter(f => f.endsWith('.svg'));
  assert.equal(expected.length, 6);
  for (const f of expected) {
    await t.test(f, () => {
      const [, name, n] = /^(.*)\.phase(\d+)\.svg$/.exec(f);
      const doc = docOf(sample(name + '.json'));
      assert.equal(F.phaseSVG(doc, +n - 1, 970), read('expected', f));
    });
  }
});

test('the picture of each sample holds its expected pictures unchanged', () => {
  for (const name of SAMPLES) {
    const doc = docOf(sample(name + '.json'));
    const pic = F.pictureSVG(doc, 1000);
    doc.phases.forEach((p, i) => {
      const exp = read('expected', `${name}.phase${i + 1}.svg`);
      const inner = exp.replace(/^<svg[^>]*>/, '').replace(/^<style>[^<]*<\/style>/, '').replace(/<\/svg>$/, '');
      const w = svgWidth(exp), h = +/height="([\d.]+)"/.exec(exp)[1];
      assert.ok(pic.includes(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="hidden">${inner}</svg>`), `${name} phase ${i + 1}`);
    });
  }
});

test('5-broken.json: nothing drawn, exactly the seven expected messages', () => {
  const r = F.read(sample('5-broken.json'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, read('expected', '5-broken.errors.txt').trimEnd().split('\n'));
  assert.equal(r.errors.length, 7);
});

test('the 12 reference pictures, at 860, 1210 and 1850 points (requirement 12)', async t => {
  const files = referenceFiles();
  let n = 0;
  for (const k of ['A', 'B', 'C']) {
    const doc = docOf(JSON.stringify(files[k]));
    for (const w of [860, 1210, 1850]) {
      for (let i = 0; i < doc.phases.length; i++) {
        n++;
        const f = `${k}.phase${i + 1}.w${w}.svg`;
        await t.test(f, () => assert.equal(F.phaseSVG(doc, i, w), read('reference', f)));
      }
    }
  }
  assert.equal(n, 12);
});

test('reference side items draw as the original did', () => {
  const files = referenceFiles();
  for (const k of ['A', 'B', 'C']) {
    const doc = docOf(JSON.stringify(files[k]));
    const strip = s => s.replace(/^<svg[^>]*>/, '').replace(/^<style>[^<]*<\/style>/, '');
    assert.equal(strip(F.sideSVG(doc)), strip(read('reference', `${k}.side.svg`)), k);
  }
});

test('below 768 points the old phone layout is replaced and fits (requirement 13)', () => {
  const files = referenceFiles();
  for (const k of ['A', 'B', 'C']) {
    const doc = docOf(JSON.stringify(files[k]));
    const old = read('reference', `${k}.phase1.w345.svg`);
    const now = F.phaseSVG(doc, 0, 345);
    assert.ok(Math.max(...rowsOf(now)) > Math.max(...rowsOf(old)), `${k}: more boxes per row than the old phone layout`);
    assert.ok(svgWidth(now) <= 345);
  }
});

test('JSON and XML of the same content give the same drawing (requirement 1)', () => {
  for (const name of SAMPLES) {
    const json = sample(name + '.json'), xml = toXML(JSON.parse(json));
    const a = docOf(json), b = docOf(xml);
    assert.equal(F.pictureSVG(b, 1000), F.pictureSVG(a, 1000), name);
    assert.equal(F.viewHTML(b), F.viewHTML(a), name);
  }
  const hand = read('tests', 'fixtures', '1-smallest.xml');
  assert.equal(F.pictureSVG(docOf(hand), 1000), F.pictureSVG(docOf(sample('1-smallest.json')), 1000));
  // the broken file gives the same seven messages in XML
  assert.deepEqual(F.read(toXML(JSON.parse(sample('5-broken.json')))).errors, F.read(sample('5-broken.json')).errors);
});

test('broken XML is refused with one plain message', () => {
  for (const bad of ['<fishbone version="1" title="x"', '<fishbone version="1"><step id="1"></fishbone>', '<!DOCTYPE x [<!ENTITY a "b">]><fishbone/>', '<plan/>']) {
    const r = F.read(bad);
    assert.equal(r.ok, false); assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /XML/);
  }
});

test('limits: more than 1 MB or more than 2,000 items is refused with one message (requirement 3)', () => {
  const big = JSON.stringify({ fishbone: 1, title: 'x'.repeat(1024 * 1024), golive: 'g', steps: [] });
  let r = F.read(big);
  assert.equal(r.ok, false); assert.equal(r.errors.length, 1); assert.match(r.errors[0], /limit is 1 MB/);
  const many = n => JSON.stringify({ fishbone: 1, title: 't', golive: 'g', steps: [{ id: '1', name: 'one', children: Array.from({ length: n - 1 }, (_, i) => ({ id: 'c' + i, name: 'c' })) }] });
  r = F.read(many(2001));
  assert.equal(r.ok, false); assert.equal(r.errors.length, 1); assert.match(r.errors[0], /2,001 items; the limit is 2,000/);
  assert.equal(F.read(many(2000)).ok, true);
});

test('text from a file is only ever text (requirement 4)', () => {
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
  const file = { fishbone: 1, title: evil, golive: evil, link_pattern: 'https://example.com/{id}?q="><script>',
    style: { stages: [{ name: '</style><script>x</script>', fill: '#FFFFFF', edge: '#000000', ink: '#000000' }] },
    steps: [{ id: '<b>', name: evil, stage: '</style><script>x</script>', children: [{ id: '&amp', name: evil, before_golive: true }] }] };
  const doc = docOf(JSON.stringify(file));
  for (const out of [F.pictureSVG(doc, 1000), F.viewHTML(doc), F.phaseSVG(doc, 0, 500), F.css(doc.cats)]) {
    // with every attribute value emptied, no tag a file could have injected is left
    const tags = out.replace(/"[^"]*"/g, '""');
    assert.ok(!/<script|<img|<\/style><script|<[^>]*\son\w+=/i.test(tags), out.slice(0, 200));
  }
  F.parseXML(F.pictureSVG(doc, 1000)); // well formed
  assert.equal(F.read(JSON.stringify(Object.assign({}, file, { steps: [{ id: '1', name: 'n', link: 'javascript:alert(1)' }] }))).ok, false);
});

test('never wider than the given width, for every width from 320 points (requirement 10)', () => {
  const docs = SAMPLES.map(n => docOf(sample(n + '.json')));
  const refs = referenceFiles();
  for (const k of ['A', 'B', 'C']) docs.push(docOf(JSON.stringify(refs[k])));
  for (const doc of docs) {
    for (let w = 320; w <= 2000; w++) {
      doc.phases.forEach(p => {
        const d = F.fishboneParts({ main: p.main, side: [], golive: p.golive }, w);
        assert.ok(d.width <= w, `${doc.title} at ${w}: ${d.width}`);
        for (const m of d.inner.matchAll(/<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"/g)) assert.ok(+m[1] + +m[2] <= d.width + 1e-9, `${doc.title} at ${w}: box past the edge`);
        for (const m of d.inner.matchAll(/<text class="note" x="([\d.]+)"[^>]*>([^<]*)</g)) assert.ok(+m[1] + F.textWidth(m[2], 12) <= Math.max(d.width, w), `${doc.title} at ${w}: note past the edge`);
      });
    }
    for (let w = 320; w <= 2000; w += 7) {
      const pic = F.pictureSVG(doc, w);
      assert.equal(svgWidth(pic), w);
      for (const m of pic.matchAll(/<svg x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) assert.ok(+m[1] + +m[2] <= w, `${doc.title} picture at ${w}`);
    }
  }
});

test('a long line wraps: 9, 8 and 11 at 970 points, Live first (requirement 11, scenario 3)', () => {
  const doc = docOf(sample('3-long-line.json'));
  const svg = F.phaseSVG(doc, 0, 970);
  assert.deepEqual(rowsOf(svg), [9, 8, 11]);
  const notes = [...svg.matchAll(/<text class="note"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(notes, ['Live · continues below', 'Live · continues below']);
  assert.match(svg, /<g class="golive">.*Moved in<\/text><\/g>/);
  // file order is kept
  const ids = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+" text-anchor="middle">(\d+)<\/text>/g)].map(m => +m[1]);
  assert.deepEqual(ids, Array.from({ length: 28 }, (_, i) => i + 1));
  // a mixed row that is not the last says "continues below" only
  const mixed = docOf(JSON.stringify({ fishbone: 1, title: 't', golive: 'g', steps: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: 'n', stage: 'To do' })) }));
  assert.deepEqual([...F.phaseSVG(mixed, 0, 970).matchAll(/<text class="note"[^>]*>([^<]*)</g)].map(m => m[1]), ['continues below', 'continues below']);
});

test('narrow: at 375 points every row but the last holds at least 4 boxes, head on its own line (requirement 13)', () => {
  const doc = docOf(sample('3-long-line.json'));
  for (let w = 345; w <= 375; w++) {
    const d = F.fishboneParts({ main: doc.phases[0].main, side: [], golive: 'Moved in' }, w);
    const svg = `<svg width="${d.width}">${d.inner}</svg>`;
    const rows = rowsOf(svg);
    assert.equal(rows.reduce((a, b) => a + b, 0), 28);
    rows.slice(0, -1).forEach(n => assert.ok(n >= 4, `${w}: ${rows}`));
    const lastSpine = Math.max(...[...svg.matchAll(/<line class="spine" x1="8" y1="([\d.]+)"/g)].map(m => +m[1]));
    const head = /<g class="golive"><rect x="([\d.]+)" y="([\d.]+)"/.exec(svg);
    assert.ok(+head[2] > lastSpine + 14, 'head below the last row');
    assert.ok(d.width <= w);
  }
});

// Decided 2026-11-16: below 768 points the Live break and even rows give way
// when they would leave a row other than the last under 4 boxes.
test('narrow: the 4-box rule holds for any plan; the Live break is kept when it can be', () => {
  const plan = (live, other) => docOf(JSON.stringify({ fishbone: 1, title: 't', golive: 'g',
    steps: Array.from({ length: live + other }, (_, i) => ({ id: String(i + 1), name: 'n', stage: i < live ? 'Live' : 'To do' })) }));
  const rowsAt = (doc, w) => {
    const d = F.fishboneParts({ main: doc.phases[0].main, side: [], golive: 'g' }, w);
    const svg = `<svg width="${d.width}">${d.inner}</svg>`;
    const ids = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+" text-anchor="middle">(\d+)<\/text>/g)].map(m => +m[1]);
    return { rows: rowsOf(svg), ids, width: d.width };
  };
  for (let live = 0; live <= 20; live++) for (let other = 0; other <= 20; other++) {
    if (!live && !other) continue;
    const doc = plan(live, other);
    for (let w = 320; w < 768; w += 13) {
      const { rows, ids, width } = rowsAt(doc, w);
      assert.equal(rows.reduce((a, b) => a + b, 0), live + other);
      assert.deepEqual(ids, Array.from({ length: live + other }, (_, i) => i + 1), 'file order kept');
      rows.slice(0, -1).forEach(n => assert.ok(n >= 4, `${live}+${other} at ${w}: ${rows}`));
      assert.ok(width <= w);
    }
  }
  assert.deepEqual(rowsAt(plan(2, 10), 375).rows, [6, 6]);
  assert.deepEqual(rowsAt(plan(2, 10), 345).rows, [4, 4, 4]);
  // sample 3 keeps its Live break on a phone: Live rows first, then the rest
  const three = rowsAt(docOf(sample('3-long-line.json')), 345);
  assert.deepEqual(three.rows, [5, 4, 4, 4, 4, 4, 3]);
  // wide layouts are untouched by this rule
  assert.deepEqual(rowsOf(F.phaseSVG(plan(2, 10), 0, 768)), [2, 5, 5]);
});

test('boxes: stage colours, above and below, solid and dashed, depth marks and folding (requirements 5–8)', () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const p2 = F.phaseSVG(doc, 1, 970);
  assert.equal((p2.match(/\+1 more/g) || []).length, 1);
  assert.match(p2, />L1a</); assert.match(p2, />›L1b</); assert.match(p2, />››L1c</);
  assert.doesNotMatch(p2, /L1d/);
  // before go-live above on a solid bone, can-wait and not-set below on a dashed one
  const ys = id => +new RegExp(`<title>${id} [^<]*</title><rect x="[\\d.-]+" y="([\\d.-]+)"`).exec(p2)[1];
  const spine = +/<line class="spine" x1="8" y1="([\d.]+)"/.exec(p2)[1];
  assert.ok(ys('L3a') < spine && ys('L3b') < spine);
  assert.ok(ys('L3c') > spine && ys('L3d') > spine);
  assert.match(p2, /<line class="bone before"/); assert.match(p2, /<line class="bone after"/);
  assert.match(F.css(doc.cats), /\.bone\.after\{stroke-dasharray:4 3\}/);
  // built-in colours, exactly
  const css = F.css(docOf(sample('1-smallest.json')).cats);
  for (const s of ['.cat-to-do rect{fill:#E6F1FB;stroke:#185FA5}.cat-to-do text{fill:#0C447C}', '.cat-building rect{fill:#FAEEDA;stroke:#BA7517}.cat-building text{fill:#6B4208}', '.cat-live rect{fill:#F1EFE8;stroke:#5F5E5A}.cat-live text{fill:#444441}', '.golive rect{fill:#E6F1FB;stroke:#185FA5;stroke-width:1.5}']) assert.ok(css.includes(s), s);
});

test('scenario 4: an extra stage and a recoloured one', () => {
  const doc = docOf(sample('4-custom-colours.json'));
  const svg = F.phaseSVG(doc, 0, 970), css = F.css(doc.cats);
  const cls = id => new RegExp(`<g class="([\\w-]+)"><title>${id} `).exec(svg)[1];
  const fill = c => new RegExp(`\\.${c} rect\\{fill:(#\\w+)`).exec(css)[1];
  for (const id of ['3', '3a']) assert.equal(fill(cls(id)), '#FCEBEB');
  assert.equal(fill(cls('4')), '#FAEEDA');
  for (const id of ['3b', '5', '5a']) assert.equal(fill(cls(id)), '#E1F5EE');
  for (const id of ['1', '2', '2a']) assert.equal(fill(cls(id)), '#F1EFE8');
  assert.match(css, /\.golive rect\{fill:#E1F5EE/);
  assert.deepEqual([...doc.cats.values()].map(c => c.name), ['To do', 'Building', 'Live', 'Blocked']);
  assert.equal(F.progressText(doc), '2 of 5 on MAIN Live · 2 critical children open');
  const legend = F.viewHTML(doc).split('class="legend"')[1];
  for (const s of ['To do', 'Building', 'Live', 'Blocked']) assert.ok(legend.includes(`>${s}</span>`), s);
  for (const s of ['To do', 'Building', 'Live', 'Blocked']) assert.ok(F.pictureSVG(doc, 1000).includes(`>${s}</text></g>`), s);
});

test('links open their address; the pointer shows id, name and stage (requirement 9)', () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const p1 = F.phaseSVG(doc, 0, 970);
  assert.match(p1, /<a href="https:\/\/example.com\/cards\/P1"><g class="cat-live"><title>P1 Sign-in page — Live<\/title>/);
  assert.match(p1, /<g class="cat-live"><title>P2 Account summary — Live<\/title>/);
  assert.doesNotMatch(p1, /<a href="[^"]*"><g class="cat-live"><title>P2 /);
  const three = F.phaseSVG(docOf(sample('3-long-line.json')), 0, 970);
  const links = [...three.matchAll(/<a href="([^"]+)"><g class="[\w-]+"><title>(\w+) /g)];
  assert.equal(links.length, 28 + 7);
  for (const [, href, id] of links) assert.equal(href, 'https://example.com/cards/' + id);
});

test('progress line (requirement 15)', () => {
  assert.equal(F.progressText(docOf(sample('1-smallest.json'))), '1 of 3 on MAIN Live · 0 critical children open');
  assert.equal(F.progressText(docOf(sample('2-comprehensive.json'))), '5 of 10 on MAIN Live · 2 critical children open · 1 of 3 phases Live');
  assert.equal(F.progressText(docOf(sample('3-long-line.json'))), '17 of 28 on MAIN Live · 1 critical child open');
});

test('phases stacked with their headings; side items once, under the last phase (requirement 14)', () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const pic = F.pictureSVG(doc, 1000);
  const heads = ['Phase 1: Pilot → Pilot live', 'Phase 2: Launch → Open to all', 'Phase 3: Growth → Mobile app'];
  let at = 0;
  for (const h of heads) { const i = pic.indexOf(`>${h}</text>`); assert.ok(i > at, h); at = i; }
  const side = pic.indexOf('Side items');
  assert.ok(side > at);
  for (const id of ['S1', 'S1a', 'S2']) assert.equal(pic.split(`<title>${id} `).length - 1, 1, id);
  assert.ok(pic.indexOf('<title>S1 ') > side);
  assert.match(pic.slice(side), /<line class="spine" x1="8" y1="12"/);
  assert.doesNotMatch(pic.slice(side), /class="golive"/);
});

test('legend (requirement 16) and names table (requirement 17)', () => {
  const doc = docOf(sample('2-comprehensive.json'));
  const html = F.viewHTML(doc);
  for (const s of ['solid line: needed before go-live', 'dashed line: can wait', '› one level down', '›› two levels down']) assert.ok(html.includes(s) && F.pictureSVG(doc, 1000).includes(s), s);
  const rows = doc.phases.flatMap(p => F.tableRows(p.main)).concat(F.tableRows(doc.side));
  assert.equal(rows.length, 23);
  const by = id => rows.find(r => r.id === id);
  assert.equal(by('P1').gate, 'MAIN'); assert.equal(by('P1a').gate, 'yes'); assert.equal(by('P1b').gate, 'no'); assert.equal(by('L3d').gate, 'no (not set)');
  assert.equal(by('L1d').depth, 4); assert.equal(by('L1d').stage, 'To do');
  assert.ok(rows.indexOf(by('L1d')) === rows.indexOf(by('L1c')) + 1);
  assert.match(html, /<td>Number alignment<\/td>/);
});

test('a file of 200 items is ready well within 1 second (requirement 26)', () => {
  const steps = Array.from({ length: 40 }, (_, i) => ({ id: 'S' + i, name: 'Step ' + i, stage: i < 15 ? 'Live' : 'To do',
    children: Array.from({ length: 4 }, (_, j) => ({ id: `${i}c${j}`, name: 'Child', before_golive: j % 2 === 0 })) }));
  const text = JSON.stringify({ fishbone: 1, title: 'Two hundred', golive: 'Done', steps });
  const t0 = process.hrtime.bigint();
  const r = F.read(text); assert.ok(r.ok);
  assert.equal(F.countItems(JSON.parse(text)), 200);
  F.viewHTML(r.doc); F.pictureSVG(r.doc, 1000); F.phaseSVG(r.doc, 0, 1250);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1000, ms + ' ms');
});
