// Turns reference/reference-data.json (three real fishbones, card numbers only)
// into fishbone files, the way the reference pictures were made: steps are
// named "Step <n>", children "Item <n>", a closed card is Live, an open one To do.
'use strict';
const fs = require('fs');
const path = require('path');

function item(a, depth) {
  const [id, closed, gate, notSet, children] = a;
  const o = { id: String(id), name: (depth ? 'Item ' : 'Step ') + id, stage: closed ? 'Live' : 'To do' };
  if (depth && !notSet) o.before_golive = gate === 'b';
  if (children.length) o.children = children.map(c => item(c, depth + 1));
  return o;
}
function referenceFiles() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reference', 'reference-data.json'), 'utf8'));
  const out = {};
  for (const k of ['A', 'B', 'C']) {
    out[k] = {
      fishbone: 1,
      title: 'Reference ' + k,
      phases: data[k].ph.map(p => ({ name: 'Phase ' + p[1], golive: 'Go-live ' + p[1], status: p[2] ? 'live' : 'active', steps: p[3].map(s => item(s, 0)) })),
      side: data[k].side.map(s => item(s, 0)),
    };
  }
  return out;
}
module.exports = { referenceFiles };
