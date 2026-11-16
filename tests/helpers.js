'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../src/fishbone.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const sample = name => read('samples', name);
const docOf = text => { const r = F.read(text); if (!r.ok) throw new Error(r.errors.join('\n')); return r.doc; };

// The same content written as XML (file-format guide, section 6).
function toXML(file) {
  const q = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const yn = v => (v === true ? 'yes' : v === false ? 'no' : v);
  const attrs = (o, keys) => keys.filter(([k]) => o[k] !== undefined).map(([k, x]) => ` ${x || k}="${q(k === 'before_golive' || k === 'counts_as_live' ? yn(o[k]) : o[k])}"`).join('');
  const ITEM = [['id'], ['name'], ['stage'], ['before_golive', 'before-golive'], ['link']];
  const item = (o, tag, ind) => {
    const kids = o.children || [];
    const open = `${ind}<${tag}${attrs(o, ITEM)}`;
    return kids.length ? `${open}>\n${kids.map(c => item(c, 'child', ind + '  ')).join('')}${ind}</${tag}>\n` : `${open}/>\n`;
  };
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<fishbone${attrs(file, [['fishbone', 'version'], ['title'], ['golive'], ['link_pattern', 'link-pattern']])}>\n`;
  if (file.style) s += `  <style>\n${file.style.stages.map(st => `    <stage${attrs(st, [['name'], ['fill'], ['edge'], ['ink'], ['counts_as_live', 'counts-as-live']])}/>\n`).join('')}  </style>\n`;
  (file.steps || []).forEach(st => { s += item(st, 'step', '  '); });
  (file.phases || []).forEach(p => { s += `  <phase${attrs(p, [['name'], ['golive'], ['status']])}>\n${(p.steps || []).map(st => item(st, 'step', '    ')).join('')}  </phase>\n`; });
  if (file.side) s += `  <side>\n${file.side.map(st => item(st, 'item', '    ')).join('')}  </side>\n`;
  return s + '</fishbone>\n';
}

// Rows of a drawing: the spine lines that start at x=8, top to bottom, with
// the step boxes (28 high) on each.
function rowsOf(svg) {
  const spines = [...svg.matchAll(/<line class="spine" x1="8" y1="([\d.]+)"/g)].map(m => +m[1]);
  const boxes = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="52" height="28"/g)].map(m => ({ x: +m[1], cy: +m[2] + 14 }));
  return spines.map(y => boxes.filter(b => b.cy === y).length);
}
function svgWidth(svg) { return +/^<svg[^>]* width="([\d.]+)"/.exec(svg)[1]; }

module.exports = { F, ROOT, read, sample, docOf, toXML, rowsOf, svgWidth };
