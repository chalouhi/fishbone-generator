'use strict';
// The repository itself (requirements 21, 29, 31–34).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, read } = require('./helpers.js');
const { samplesJS, fontsJS } = require('../tools/build-demo-data.js');

function files(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'out'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out); else out.push(p);
  }
  return out;
}
const rel = p => path.relative(ROOT, p);
const textFiles = () => files().filter(p => !/\.(ttf|png|pdf)$/.test(p));

// The names to keep out are checked by fingerprint only (a one-way hash of
// each word or pair of words), so this test does not itself name them.
const PRIVATE = new Set(["61c0d56ed1936ed5eace","f2959e750ca76824efd2","283fc8847640f0edb69a","ca99543b1a6af4734237","2278b8f75e3a8b1bd637","87c6e6170887c95a3345","1f0510bb4e88125c8334","f7340d1fa85d91731f9d","20660e0b811a38864865","f9afd3062f65cd58febd","4a01fdf1abbbc08bc607","8c4dce104fd8443cebeb","c05d2318e829909e3b27","fa5c98a23b33a5ddcb66","4078aac1dc24a77c8290","aaa6bdbecd9870b7724d","15f787e001cdded74cc5","865a4eb6f959a0aaa99e","977ea80f845cf4cab14a","d619c4d65d3ddc834163","8e3d5940d8dea03b73a1","549f591357d3e66f2e59","f0061264be25db59aadd","c540a399aab8b005969b","ad3e50193521c2db1e6a"]);
const fp = s => require('crypto').createHash('sha256').update('fishbone-34:' + s).digest('hex').slice(0, 20);
const OWNER = /([A-Za-z0-9-]+)\.github\.io\/fishbone-generator/.exec(read("README.md"))[1];

test('nothing in the repository names private boards, servers or addresses (requirement 34)', () => {
  // The repository's own public addresses and its licence line are allowed.
  const allowed = [`github.com/${OWNER}/fishbone-generator`, `${OWNER}.github.io/fishbone-generator`, `${OWNER}@users.noreply.github.com`, `Copyright (c) 2026 ${OWNER}`];
  const addresses = [/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /\b192\.168\.\d{1,3}\.\d{1,3}\b/, /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b/];
  const hits = [];
  for (const p of textFiles()) {
    let t = fs.readFileSync(p, 'utf8');
    for (const a of allowed) t = t.split(a).join(' ');
    const words = t.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
    const seen = new Set(words.map(fp));
    for (let i = 1; i < words.length; i++) seen.add(fp(words[i - 1] + ' ' + words[i]));
    for (const ip of t.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []) seen.add(fp(ip));
    for (const h of seen) if (PRIVATE.has(h)) hits.push(`${rel(p)}: a private name (fingerprint ${h})`);
    for (const re of addresses) { const m = re.exec(t); if (m) hits.push(`${rel(p)}: "${m[0]}"`); }
  }
  assert.deepEqual(hits, []);
});

test('the reference data carries card numbers only, with no names (requirement 34)', () => {
  const data = JSON.parse(read('reference', 'reference-data.json'));
  const walk = n => { assert.equal(typeof n[0], 'number'); n[4].forEach(walk); };
  for (const k of ['A', 'B', 'C']) { data[k].ph.forEach(p => p[3].forEach(walk)); data[k].side.forEach(walk); }
  assert.deepEqual(Object.keys(data).sort(), ['A', 'B', 'C', 'note']);
});

test('the tool makes no network request: no request code, the page forbids any (requirements 21, 29)', () => {
  const code = ['src/fishbone.js', 'src/pdf.js', 'bin/fishbone.js', 'demo/app.js'];
  for (const f of code) {
    const t = read(f);
    assert.doesNotMatch(t, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|require\(['"](?:node:)?(?:https?|net|dns|tls|dgram|http2)['"]\)/, f);
  }
  const html = read('index.html');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) assert.doesNotMatch(m[1], /^(?:https?:)?\/\//, m[1]);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^https:\/\/github\.com\//.test(m[1])) assert.ok(fs.existsSync(path.join(ROOT, m[1])), m[1]);
});

test('the demo page data is up to date with samples/ and fonts/', () => {
  assert.equal(read('demo', 'samples.js'), samplesJS());
  assert.equal(read('demo', 'fonts.js'), fontsJS());
});

test('the repository holds what requirement 31 lists, under the MIT licence', () => {
  assert.match(read('LICENSE'), /^MIT License/);
  for (const f of ['docs/file-format.md', 'docs/guide.md', 'reference/reference-data.json', 'README.md', 'src/fishbone.js', 'bin/fishbone.js', 'index.html']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.equal(fs.readdirSync(path.join(ROOT, 'samples')).length, 5);
  assert.equal(fs.readdirSync(path.join(ROOT, 'expected')).length, 7);
  const refs = fs.readdirSync(path.join(ROOT, 'reference'));
  assert.equal(refs.filter(f => /\.w(860|1210|1850)\.svg$/.test(f)).length, 12);
  // the guide in the repository is the file-format spec, sections 1 to 9
  const guide = read('docs', 'file-format.md');
  for (let i = 1; i <= 9; i++) assert.match(guide, new RegExp(`^## ${i} · `, 'm'));
});

test('the front page fits a newcomer: what it does, one picture, three ways to use it (requirement 32)', () => {
  const md = read('README.md');
  const firstScreen = md.split('\n').slice(0, 45).join('\n');
  assert.match(firstScreen, /!\[[^\]]*\]\([^)]+\.svg\)/);
  for (const s of [/demo page/i, /command/i, /script/i]) assert.match(firstScreen, s);
});
