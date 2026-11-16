/*!
 * Fishbone Generator 1.0.0 — one file in, one fishbone out.
 * MIT licence. https://github.com/chalouhi/fishbone-generator
 *
 * This single file is the whole tool for a browser: the reader (JSON and XML),
 * the drawing, the picture (SVG) and the page view. Include it in a page and
 * call Fishbone.draw(place, fileText). In Node: require('./src/fishbone.js').
 * It makes no network request of any kind.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fishbone = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const MAX_BYTES = 1024 * 1024, MAX_ITEMS = 2000;

  // The drawing's fixed measures. They are the original fishbone's and are not
  // open to a file (file-format guide, section 4).
  const PITCH = 64, BOX_W = 52, BOX_H = 28, PILL_W = 50, PILL_H = 20, STEP = 26, SLANT = 0.12, MAX_DEPTH = 3;
  // Below this width the layout tightens (requirement 13).
  const NARROW_BELOW = 768, N_PITCH = 56, N_X0 = 40, N_ARROW = 20;

  const BUILTIN = [
    { name: 'To do', fill: '#E6F1FB', edge: '#185FA5', ink: '#0C447C', counts_as_live: false },
    { name: 'Building', fill: '#FAEEDA', edge: '#BA7517', ink: '#6B4208', counts_as_live: false },
    { name: 'Live', fill: '#F1EFE8', edge: '#5F5E5A', ink: '#444441', counts_as_live: true },
  ];
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const WEB = /^https?:\/\//i;
  const LINE = '#5b6070';
  const FONT = 'Calibri,"Segoe UI",system-ui,sans-serif';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const slug = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const keyOf = s => String(s).trim().toLowerCase();
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ------------------------------------------------------------------ *
   * XML: a small, strict reader. No DOCTYPE, no entities beyond the five
   * standard ones and character references, so nothing in a file can expand
   * or reach outside it.
   * ------------------------------------------------------------------ */
  function XmlError(msg) { this.message = msg; }
  function parseXML(src) {
    let i = 0;
    const n = src.length, root = { name: '#root', attrs: {}, children: [] }, stack = [root];
    const fail = msg => { throw new XmlError(`${msg} (line ${src.slice(0, i).split('\n').length})`); };
    const NAME = /[A-Za-z_][\w.:-]*/y, ATTR = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y, WS = /\s*/y;
    const decode = v => v.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);|&/g, (m, e) => {
      if (!e) fail('a lone "&" must be written &amp;');
      if (e[0] === '#') {
        const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (!(cp > 0 && cp <= 0x10FFFF)) fail(`the character reference &${e}; is not valid`);
        return String.fromCodePoint(cp);
      }
      const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
      if (named == null) fail(`the entity &${e}; is not allowed`);
      return named;
    });
    while (i < n) {
      const lt = src.indexOf('<', i);
      const chunk = src.slice(i, lt < 0 ? n : lt);
      if (chunk && stack.length > 1) { const top = stack[stack.length - 1]; top.text = (top.text || '') + decode(chunk); }
      if (lt < 0) break;
      i = lt;
      if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i); if (e < 0) fail('"<?" is not closed'); i = e + 2; continue; }
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); if (e < 0) fail('a comment is not closed'); i = e + 3; continue; }
      if (src.startsWith('<![CDATA[', i)) { const e = src.indexOf(']]>', i); if (e < 0) fail('a CDATA section is not closed'); i = e + 3; continue; }
      if (src.startsWith('<!', i)) fail('a DOCTYPE or declaration is not allowed');
      if (src[i + 1] === '/') {
        i += 2; NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail('a closing tag has no name');
        i += m[0].length; WS.lastIndex = i; WS.exec(src); i = WS.lastIndex;
        if (src[i] !== '>') fail(`</${m[0]}> is not closed with ">"`);
        i++;
        const top = stack.pop();
        if (stack.length === 0 || top.name !== m[0]) fail(`</${m[0]}> does not match <${top.name}>`);
        continue;
      }
      i++; NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail('"<" must start a tag; write &lt; for the character');
      i += m[0].length;
      const el = { name: m[0], attrs: {}, children: [] };
      for (;;) {
        WS.lastIndex = i; WS.exec(src); const hadSpace = WS.lastIndex > i; i = WS.lastIndex;
        if (i >= n) fail(`<${el.name}> is not closed`);
        if (src.startsWith('/>', i)) { i += 2; stack[stack.length - 1].children.push(el); break; }
        if (src[i] === '>') { i++; stack[stack.length - 1].children.push(el); stack.push(el); break; }
        if (!hadSpace) fail(`<${el.name}>: attributes must be separated by spaces`);
        ATTR.lastIndex = i; const a = ATTR.exec(src);
        if (!a) fail(`<${el.name}>: an attribute is not written name="value"`);
        if (Object.prototype.hasOwnProperty.call(el.attrs, a[1])) fail(`<${el.name}>: the attribute ${a[1]} is given twice`);
        el.attrs[a[1]] = decode(a[2] != null ? a[2] : a[3]);
        i += a[0].length;
      }
    }
    if (stack.length !== 1) { i = n; fail(`<${stack[stack.length - 1].name}> is not closed`); }
    if (root.children.length !== 1) { i = 0; fail('the file must hold exactly one top element, <fishbone>'); }
    return root.children[0];
  }

  // The XML form mapped to the same object the JSON form gives (guide, section 6).
  function xmlToFile(el) {
    if (el.name !== 'fishbone') throw new XmlError(`the top element must be <fishbone>, not <${el.name}>`);
    const a = el.attrs, file = {};
    const has = k => Object.prototype.hasOwnProperty.call(a, k);
    if (has('version')) file.fishbone = /^\s*\d+\s*$/.test(a.version) ? Number(a.version) : a.version;
    if (has('title')) file.title = a.title;
    if (has('golive')) file.golive = a.golive;
    if (has('link-pattern')) file.link_pattern = a['link-pattern'];
    else if (has('link_pattern')) file.link_pattern = a.link_pattern;
    const yesNo = v => (v === 'yes' ? true : v === 'no' ? false : v);
    function item(e, childTag) {
      const t = e.attrs, o = {};
      for (const k of ['id', 'name', 'stage', 'link']) if (Object.prototype.hasOwnProperty.call(t, k)) o[k] = t[k];
      const bg = Object.prototype.hasOwnProperty.call(t, 'before-golive') ? t['before-golive'] : t.before_golive;
      if (bg != null) o.before_golive = yesNo(bg);
      const kids = e.children.filter(c => c.name === childTag);
      if (kids.length) o.children = kids.map(c => item(c, childTag));
      return o;
    }
    for (const c of el.children) {
      if (c.name === 'step') (file.steps = file.steps || []).push(item(c, 'child'));
      else if (c.name === 'phase') {
        const p = {};
        for (const k of ['name', 'golive', 'status']) if (Object.prototype.hasOwnProperty.call(c.attrs, k)) p[k] = c.attrs[k];
        p.steps = c.children.filter(s => s.name === 'step').map(s => item(s, 'child'));
        (file.phases = file.phases || []).push(p);
      } else if (c.name === 'side') {
        file.side = (file.side || []).concat(c.children.filter(s => s.name === 'item').map(s => item(s, 'child')));
      } else if (c.name === 'style') {
        file.style = { stages: c.children.filter(s => s.name === 'stage').map(s => {
          const o = {};
          for (const k of ['name', 'fill', 'edge', 'ink']) if (Object.prototype.hasOwnProperty.call(s.attrs, k)) o[k] = s.attrs[k];
          const cl = Object.prototype.hasOwnProperty.call(s.attrs, 'counts-as-live') ? s.attrs['counts-as-live'] : s.attrs.counts_as_live;
          if (cl != null) o.counts_as_live = yesNo(cl);
          return o;
        }) };
      }
    }
    return file;
  }

  /* ------------------------------------------------------------------ *
   * Reading and checking the file
   * ------------------------------------------------------------------ */
  function stagesOf(file) { // ordered: key -> {name, fill, edge, ink, counts_as_live, cls}
    const out = new Map(BUILTIN.map(s => [keyOf(s.name), Object.assign({ cls: 'cat-' + slug(s.name) }, s)]));
    const list = isObj(file) && isObj(file.style) && Array.isArray(file.style.stages) ? file.style.stages : [];
    const used = new Set([...out.values()].map(s => s.cls));
    for (const s of list) {
      if (!isObj(s)) continue;
      const k = keyOf(s.name == null ? '' : s.name), prev = out.get(k);
      const next = Object.assign({ counts_as_live: false }, prev || {});
      for (const f of ['name', 'fill', 'edge', 'ink', 'counts_as_live']) if (s[f] !== undefined) next[f] = s[f];
      if (!prev) {
        let cls = 'cat-' + (slug(next.name == null ? '' : next.name).replace(/^-+|-+$/g, '') || 'stage'), j = 2;
        while (used.has(cls)) cls = cls.replace(/-\d+$/, '') + '-' + j++;
        used.add(cls); next.cls = cls;
      }
      out.set(k, next);
    }
    return out;
  }

  function countItems(file) {
    let total = 0;
    const stack = [];
    const pushList = l => { if (Array.isArray(l)) for (const x of l) stack.push(x); };
    if (isObj(file)) {
      pushList(file.steps); pushList(file.side);
      if (Array.isArray(file.phases)) for (const p of file.phases) if (isObj(p)) pushList(p.steps);
    }
    while (stack.length) { const x = stack.pop(); total++; if (isObj(x)) pushList(x.children); }
    return total;
  }

  function validate(file) {
    const errs = [];
    if (!isObj(file)) return ['The file must hold one fishbone: an object with "fishbone", "title" and "steps" or "phases".'];
    const seen = new Set(), st = stagesOf(file);
    const names = [...st.values()].map(s => s.name).join(', ');
    if (file.fishbone !== 1) errs.push('The file must say which format version it uses: "fishbone": 1.');
    if (file.title == null || file.title === '') errs.push('The title is missing.');
    const hasPh = file.phases !== undefined, hasSt = file.steps !== undefined;
    if (hasPh === hasSt) errs.push('The file must have either "steps" or "phases", not both and not neither.');
    if (hasSt && !Array.isArray(file.steps)) errs.push('"steps" must be a list.');
    if (hasPh && !Array.isArray(file.phases)) errs.push('"phases" must be a list.');
    if (hasSt && !file.golive) errs.push('The go-live name ("golive") is missing.');
    if (file.style !== undefined && !(isObj(file.style) && (file.style.stages === undefined || Array.isArray(file.style.stages))))
      errs.push('The style section must hold a list of stages: "style": {"stages": [ ... ]}.');
    else if (isObj(file.style) && Array.isArray(file.style.stages))
      file.style.stages.forEach((s, i) => { if (!isObj(s)) errs.push(`Stage ${i + 1} in the style section must be a stage with a name and colours.`); });
    for (const s of st.values()) {
      if (s.name == null || s.name === '') errs.push('A stage in the style section has no name.');
      for (const f of ['fill', 'edge', 'ink']) if (!HEX.test(s[f] || '')) errs.push(`Stage "${s.name}": the colour "${f}" must be six-digit hex, for example #E6F1FB.`);
      if (typeof s.counts_as_live !== 'boolean') errs.push(`Stage "${s.name}": "counts_as_live" must be true or false.`);
    }
    if (file.link_pattern != null && !(typeof file.link_pattern === 'string' && WEB.test(file.link_pattern) && file.link_pattern.includes('{id}')))
      errs.push('The link pattern must start with https:// or http:// and contain {id}.');
    function item(n, where, isChild) {
      if (!isObj(n)) { errs.push(`${where}: must be an item with an id and a name.`); return; }
      const who = `${where}${n.id != null && n.id !== '' ? ` (id "${n.id}")` : ''}`;
      if (n.id == null || n.id === '') errs.push(`${where}: the id is missing.`);
      else {
        const id = String(n.id);
        if (typeof n.id !== 'string' && typeof n.id !== 'number') errs.push(`${who}: the id must be text.`);
        if ([...id].length > 5) errs.push(`${who}: the id is ${[...id].length} characters; the limit is 5.`);
        if (seen.has(id)) errs.push(`${who}: this id is used more than once. Every id must be different.`);
        seen.add(id);
      }
      if (n.name == null || n.name === '') errs.push(`${who}: the name is missing.`);
      if (n.stage != null && !st.has(keyOf(n.stage))) errs.push(`${who}: the stage "${n.stage}" is not defined. Defined: ${names}.`);
      if (n.link != null && !(typeof n.link === 'string' && WEB.test(n.link))) errs.push(`${who}: the link must start with https:// or http://.`);
      if (n.before_golive != null && typeof n.before_golive !== 'boolean') errs.push(`${who}: "before_golive" must be true or false.`);
      if (n.before_golive != null && !isChild) errs.push(`${who}: "before_golive" belongs on children only.`);
      if (n.children !== undefined && !Array.isArray(n.children)) errs.push(`${who}: "children" must be a list.`);
      else (n.children || []).forEach((k, i) => item(k, `${where}, child ${i + 1}`, true));
    }
    if (Array.isArray(file.steps)) file.steps.forEach((s, i) => item(s, `Step ${i + 1}`, false));
    if (Array.isArray(file.phases)) file.phases.forEach((p, pi) => {
      if (!isObj(p)) { errs.push(`Phase ${pi + 1}: must be a phase with a name.`); return; }
      if (p.name == null || p.name === '') errs.push(`Phase ${pi + 1}: the name is missing.`);
      if (p.status != null && !['live', 'active'].includes(p.status)) errs.push(`Phase ${pi + 1}: "status" must be live or active.`);
      if (p.steps !== undefined && !Array.isArray(p.steps)) errs.push(`Phase ${pi + 1}: "steps" must be a list.`);
      else (p.steps || []).forEach((s, i) => item(s, `Phase ${pi + 1}, step ${i + 1}`, false));
    });
    if (file.side !== undefined && !Array.isArray(file.side)) errs.push('"side" must be a list.');
    else (file.side || []).forEach((s, i) => item(s, `Side item ${i + 1}`, false));
    return errs;
  }

  function convert(file) {
    const cats = stagesOf(file);
    const linkFor = n => n.link || (file.link_pattern ? file.link_pattern.split('{id}').join(encodeURIComponent(String(n.id))) : null);
    function node(n, depth, seq) {
      const s = cats.get(keyOf(n.stage == null ? 'To do' : n.stage));
      return {
        id: String(n.id), title: String(n.name), status: s.name, closed: !!s.counts_as_live, cls: s.cls,
        link: linkFor(n), depth, main_seq: depth === 0 ? seq : null,
        gate: depth === 0 ? null : (n.before_golive === true ? 'before' : 'after'),
        gate_guessed: depth > 0 && n.before_golive == null,
        children: (n.children || []).map(c => node(c, depth + 1, null)),
      };
    }
    const hasPhases = Array.isArray(file.phases);
    const raw = hasPhases ? file.phases : [{ name: file.golive, golive: file.golive, status: 'active', steps: file.steps }];
    const phases = raw.map((p, i) => {
      const main = (p.steps || []).map((s, j) => node(s, 0, j + 1));
      return { name: String(p.name), golive: String(p.golive || p.name), status: p.status || 'active', position: i + 1,
        main, counts: { main_total: main.length, main_done: main.filter(n => n.closed).length } };
    });
    const side = (file.side || []).map(s => node(s, 0, null));
    return { title: String(file.title), hasPhases, phases, side, cats };
  }

  /** Reads a file's text (JSON or XML). Returns {ok:true, doc} or {ok:false, errors}. */
  function read(text) {
    if (typeof text !== 'string') text = text == null ? '' : String(text);
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_BYTES) return { ok: false, errors: [`This file is ${(bytes / MAX_BYTES).toFixed(1)} MB; the limit is 1 MB.`] };
    text = text.replace(/^﻿/, '');
    let file;
    if (/^\s*</.test(text)) {
      try { file = xmlToFile(parseXML(text)); }
      catch (e) { if (e instanceof XmlError) return { ok: false, errors: [`This is not a readable XML file: ${e.message}.`] }; throw e; }
    } else {
      if (!text.trim()) return { ok: false, errors: ['The file is empty.'] };
      try { file = JSON.parse(text); }
      catch (e) { return { ok: false, errors: [`This is not a readable JSON or XML file: ${e.message}.`] }; }
    }
    const items = countItems(file);
    if (items > MAX_ITEMS) return { ok: false, errors: [`This file holds ${items.toLocaleString('en-US')} items; the limit is 2,000.`] };
    const errors = validate(file);
    if (errors.length) return { ok: false, errors };
    return { ok: true, doc: convert(file) };
  }

  /* ------------------------------------------------------------------ *
   * The drawing. From 768 points up this is the original fishbone, line for
   * line (requirement 12); below 768 the tightened layout of requirement 13.
   * ------------------------------------------------------------------ */
  function count(nodes) { return nodes.reduce((a, n) => a + 1 + count(n.children), 0); }
  // One bone = the pills hanging off one spine box on one side, in filing
  // order, each subtree flattened under its top-level child. Deeper than
  // MAX_DEPTH folds into one "+n more" pill.
  function flatten(children, gate) {
    const out = []; let hidden = 0;
    (function walk(nodes, top) {
      nodes.forEach(n => {
        const side = top ? n.gate : gate;
        if (top && side !== gate) return;
        if (n.depth > MAX_DEPTH) { hidden += 1 + count(n.children); return; }
        out.push(n);
        walk(n.children, false);
      });
    })(children, true);
    if (hidden) out.push({ more: hidden });
    return out;
  }
  function flattenAll(node) {
    const out = [node]; let hidden = 0;
    (function walk(nodes) { nodes.forEach(n => { if (n.depth > MAX_DEPTH) { hidden += 1 + count(n.children); return; } out.push(n); walk(n.children); }); })(node.children);
    if (hidden) out.push({ more: hidden });
    return out;
  }
  function box(cx, cy, w, h, n) {
    if (n.more) return `<g class="closed"><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="4" stroke-width="0.75"/><text x="${cx}" y="${cy + 4}" text-anchor="middle">+${n.more} more</text></g>`;
    const label = '›'.repeat(Math.max(0, n.depth - 1)) + n.id;
    const g = `<g class="${n.cls}"><title>${esc(n.id)} ${esc(n.title)} — ${esc(n.status)}</title>` +
      `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="4" stroke-width="0.75"/>` +
      `<text x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(label)}</text></g>`;
    return n.link ? `<a href="${esc(n.link)}">${g}</a>` : g;
  }
  function rowWidth(tail, n) { return tail + Math.max(n, 1) * PITCH + 190; }
  function rowCapacity(tail, avail) { return Math.max(1, Math.floor((avail - tail - 190) / PITCH)); }
  function chunkEven(list, cap) {
    if (!list.length) return [];
    const rows = Math.ceil(list.length / cap), per = Math.ceil(list.length / rows), out = [];
    for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
    return out;
  }
  function mainRows(main, tail, avail) {
    if (!avail || !main.length || rowWidth(tail, main.length) <= avail) return [main];
    const cap = rowCapacity(tail, avail);
    const done = main.filter(n => n.closed), open = main.filter(n => !n.closed);
    const segs = (done.length && open.length) ? [done, open] : [main];
    return segs.flatMap(seg => chunkEven(seg, cap));
  }
  function hang(parts, cx, list, dir, cls, fromY) {
    if (!list.length) return;
    const reach = 34 + STEP * (list.length - 1);
    parts.push(`<line class="bone ${cls}" x1="${cx}" y1="${fromY}" x2="${cx - SLANT * reach}" y2="${fromY + dir * reach}"/>`);
    list.forEach((n, k) => { const d = 34 + STEP * k; parts.push(box(cx - SLANT * d, fromY + dir * d, PILL_W, PILL_H, n)); });
  }

  // The original layout, unchanged.
  function wideParts(data, avail) {
    const sideBones = data.side.map(flattenAll);
    const tail = sideBones.length * (PILL_W + 8) + 36;
    const rows = mainRows(data.main, tail, avail);
    const width = rowWidth(tail, Math.max(...rows.map(r => r.length)));
    let y = 8; const parts = [];
    rows.forEach((row, r) => {
      const bones = row.map(n => ({ n, up: flatten(n.children, 'before'), down: flatten(n.children, 'after') }));
      const upMax = Math.max(0, ...bones.map(b => b.up.length));
      let downMax = Math.max(0, ...bones.map(b => b.down.length));
      if (r === 0) downMax = Math.max(downMax, ...sideBones.map(b => b.length));
      const spineY = y + (upMax ? 34 + STEP * (upMax - 1) + PILL_H / 2 + 8 : 8) + BOX_H / 2;
      const x0 = tail + BOX_W / 2 + 8, last = r === rows.length - 1;
      const endX = x0 + Math.max(row.length - 1, 0) * PITCH + BOX_W / 2 + 34;
      parts.push(`<line class="spine" x1="8" y1="${spineY}" x2="${endX}" y2="${spineY}"/>`);
      parts.push(`<path class="spine" d="M${endX - 7} ${spineY - 5}L${endX} ${spineY}L${endX - 7} ${spineY + 5}"/>`);
      if (last) parts.push(`<g class="golive"><rect x="${endX + 4}" y="${spineY - 18}" width="96" height="36" rx="4"/><text x="${endX + 52}" y="${spineY + 4}" text-anchor="middle">${esc(data.golive)}</text></g>`);
      else parts.push(`<text class="note" x="${endX + 8}" y="${spineY + 4}">${row.every(n => n.closed) ? 'Live · ' : ''}continues below</text>`);
      bones.forEach((b, k) => {
        const cx = x0 + k * PITCH;
        hang(parts, cx, b.up, -1, 'before', spineY - BOX_H / 2);
        hang(parts, cx, b.down, 1, 'after', spineY + BOX_H / 2);
      });
      if (r === 0) sideBones.forEach((list, k) => hang(parts, 32 + PILL_W / 2 + k * (PILL_W + 8), list, 1, 'after', spineY));
      bones.forEach((b, k) => parts.push(box(x0 + k * PITCH, spineY, BOX_W, BOX_H, b.n)));
      y = spineY + BOX_H / 2 + (downMax ? 34 + STEP * (downMax - 1) + PILL_H / 2 : 0) + 28;
    });
    return { width, height: y, inner: parts.join('') };
  }

  // Narrow screens: rows hold more boxes (closer pitch, no room kept for the
  // head beside the line), each side of the Live break is cut into rows whose
  // lengths differ by one at most, "continues below" goes under its row, and
  // the go-live head sits on its own line under the last row.
  function narrowCapacity(avail) { return Math.max(1, Math.floor((avail - (N_X0 + BOX_W / 2 + N_ARROW + 6)) / N_PITCH) + 1); }
  function splitEven(list, cap) {
    if (!list.length) return [];
    const rows = Math.ceil(list.length / cap), base = Math.floor(list.length / rows), extra = list.length % rows, out = [];
    let i = 0;
    for (let r = 0; r < rows; r++) { const k = base + (r < extra ? 1 : 0); out.push(list.slice(i, i + k)); i += k; }
    return out;
  }
  // First choice: the Live break, each side in even rows (requirement 11).
  // If that leaves a row other than the last under 4 boxes (requirement 13),
  // the whole line in even rows; if still so, rows filled to capacity with the
  // rest on the last row, which always holds.
  function narrowRows(main, avail) {
    const cap = narrowCapacity(avail), min = Math.min(4, cap);
    if (main.length <= cap) return [main];
    const fits = rows => rows.slice(0, -1).every(r => r.length >= min);
    const done = main.filter(n => n.closed), open = main.filter(n => !n.closed);
    if (done.length && open.length) {
      const split = [done, open].flatMap(seg => splitEven(seg, cap));
      if (fits(split)) return split;
    }
    const even = splitEven(main, cap);
    if (fits(even)) return even;
    const out = [];
    for (let i = 0; i < main.length; i += cap) out.push(main.slice(i, i + cap));
    return out;
  }
  function narrowParts(data, avail) {
    const rows = data.main.length ? narrowRows(data.main, avail) : [[]];
    let y = 8, width = 0; const parts = [];
    rows.forEach((row, r) => {
      const bones = row.map(n => ({ n, up: flatten(n.children, 'before'), down: flatten(n.children, 'after') }));
      const upMax = Math.max(0, ...bones.map(b => b.up.length));
      const downMax = Math.max(0, ...bones.map(b => b.down.length));
      const spineY = y + (upMax ? 34 + STEP * (upMax - 1) + PILL_H / 2 + 8 : 8) + BOX_H / 2;
      const last = r === rows.length - 1;
      const endX = N_X0 + Math.max(row.length - 1, 0) * N_PITCH + BOX_W / 2 + N_ARROW;
      const bottom = spineY + BOX_H / 2 + (downMax ? 34 + STEP * (downMax - 1) + PILL_H / 2 : 0);
      parts.push(`<line class="spine" x1="8" y1="${spineY}" x2="${endX}" y2="${spineY}"/>`);
      if (!last) {
        parts.push(`<path class="spine" d="M${endX - 7} ${spineY - 5}L${endX} ${spineY}L${endX - 7} ${spineY + 5}"/>`);
        parts.push(`<text class="note" x="8" y="${bottom + 18}">${row.length && row.every(n => n.closed) ? 'Live · ' : ''}continues below</text>`);
        width = Math.max(width, endX + 6);
        y = bottom + 34;
      } else {
        const headTop = bottom + 12, hx = Math.max(56, Math.min(endX, avail - 56));
        parts.push(`<line class="spine" x1="${endX}" y1="${spineY}" x2="${endX}" y2="${headTop}"/>`);
        parts.push(`<path class="spine" d="M${endX - 5} ${headTop - 7}L${endX} ${headTop}L${endX + 5} ${headTop - 7}"/>`);
        parts.push(`<g class="golive"><rect x="${hx - 48}" y="${headTop}" width="96" height="36" rx="4"/><text x="${hx}" y="${headTop + 22}" text-anchor="middle">${esc(data.golive)}</text></g>`);
        width = Math.max(width, endX + 6, hx + 56);
        y = headTop + 36 + 12;
      }
      bones.forEach((b, k) => {
        const cx = N_X0 + k * N_PITCH;
        hang(parts, cx, b.up, -1, 'before', spineY - BOX_H / 2);
        hang(parts, cx, b.down, 1, 'after', spineY + BOX_H / 2);
      });
      bones.forEach((b, k) => parts.push(box(N_X0 + k * N_PITCH, spineY, BOX_W, BOX_H, b.n)));
    });
    return { width: Math.min(width, avail), height: y, inner: parts.join('') };
  }

  /** One phase's fishbone. `avail` = the width it may use (0 = one row). */
  function fishboneParts(data, avail) {
    return (avail && avail < NARROW_BELOW) ? narrowParts(data, avail) : wideParts(data, avail);
  }
  function svgOpen(w, h, label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">`;
  }
  /** One phase as its own picture, style inside: the form of the expected pictures. */
  function phaseSVG(doc, i, avail) {
    const p = doc.phases[i];
    const d = fishboneParts({ main: p.main, side: [], golive: p.golive }, avail);
    return svgOpen(d.width, d.height, 'Fishbone for ' + doc.title) + `<style>${css(doc.cats)}</style>` + d.inner + '</svg>';
  }
  // The side items, once, hanging from a short line with no head.
  function sideParts(side) {
    const lists = side.map(flattenAll);
    if (!lists.length) return null;
    const width = lists.length * (PILL_W + 12) + 40, deep = Math.max(...lists.map(l => l.length));
    const height = 12 + 34 + STEP * (deep - 1) + PILL_H / 2 + 12;
    const parts = [`<line class="spine" x1="8" y1="12" x2="${width - 8}" y2="12"/>`];
    lists.forEach((list, k) => {
      const cx = 20 + PILL_W / 2 + k * (PILL_W + 12), reach = 34 + STEP * (list.length - 1);
      parts.push(`<line class="bone after" x1="${cx}" y1="12" x2="${cx - SLANT * reach}" y2="${12 + reach}"/>`);
      list.forEach((n, j) => { const d = 34 + STEP * j; parts.push(box(cx - SLANT * d, 12 + d, PILL_W, PILL_H, n)); });
    });
    return { width, height, inner: parts.join('') };
  }
  // Side items wrap into rows when they do not fit the width.
  function sideRows(side, avail) {
    const per = Math.max(1, Math.floor((avail - 40) / (PILL_W + 12)));
    const out = [];
    for (let i = 0; i < side.length; i += per) out.push(side.slice(i, i + per));
    return out;
  }
  function sideSVG(doc, avail) {
    const rows = sideRows(doc.side, avail || 1e9).map(sideParts).filter(Boolean);
    if (!rows.length) return '';
    let y = 0; const width = Math.max(...rows.map(r => r.width)), inner = [];
    rows.forEach(r => { inner.push(`<g transform="translate(0,${y})">${r.inner}</g>`); y += r.height; });
    return svgOpen(width, y, 'Side items') + `<style>${css(doc.cats)}</style>` + (rows.length === 1 ? rows[0].inner : inner.join('')) + '</svg>';
  }

  function css(cats, sc) {
    sc = sc || '';
    const live = cats.get('live'), todo = cats.get('to do');
    let s = `svg text{font-family:${FONT};font-size:12px}.spine,.bone{stroke:${LINE};stroke-width:1.5;fill:none}.bone.after{stroke-dasharray:4 3}.note{fill:${LINE}}`;
    for (const c of cats.values()) s += `${sc}.${c.cls} rect{fill:${c.fill};stroke:${c.edge}}${sc}.${c.cls} text{fill:${c.ink}}`;
    s += `${sc}.closed rect{fill:${live.fill};stroke:${live.edge}}${sc}.closed text{fill:${live.ink}}`;
    s += `${sc}.golive rect{fill:${todo.fill};stroke:${todo.edge};stroke-width:1.5}${sc}.golive text{fill:${todo.ink};font-weight:700}`;
    return s;
  }

  /* ------------------------------------------------------------------ *
   * What goes around the drawing: progress line, headings, legend, table
   * ------------------------------------------------------------------ */
  function allChildren(nodes) { const out = []; (function walk(ns) { ns.forEach(n => { if (n.depth > 0) out.push(n); walk(n.children); }); })(nodes); return out; }
  function progress(doc) {
    const all = doc.phases.flatMap(p => p.main);
    const crit = allChildren(all).filter(n => n.gate === 'before' && !n.closed).length;
    const parts = [
      { b: `${all.filter(n => n.closed).length} of ${all.length}`, t: ' on MAIN Live · ' },
      { b: `${crit}`, t: ` critical ${crit === 1 ? 'child' : 'children'} open` },
    ];
    if (doc.hasPhases && doc.phases.length > 1) parts.push({ t0: ' · ', b: `${doc.phases.filter(p => p.status === 'live').length} of ${doc.phases.length}`, t: ' phases Live' });
    return parts;
  }
  function progressText(doc) { return progress(doc).map(p => (p.t0 || '') + p.b + p.t).join(''); }
  function phaseHeading(doc, p) {
    if (!doc.hasPhases) return null;
    return `Phase ${p.position}: ${p.name}${p.golive && p.golive !== p.name ? ' → ' + p.golive : ''}`;
  }
  function gateWord(n) {
    if (n.depth === 0) return n.main_seq != null ? 'MAIN' : 'no';
    if (n.gate === 'before') return 'yes';
    return n.gate_guessed ? 'no (not set)' : 'no';
  }
  /** Every item as a table row, children under their parent (requirement 17). */
  function tableRows(nodes) {
    const out = [];
    (function walk(ns) { ns.forEach(n => { out.push({ depth: n.depth, label: (n.depth ? '— ' : '') + '›'.repeat(Math.max(0, n.depth - 1)) + n.id, id: n.id, name: n.title, stage: n.status, gate: gateWord(n), link: n.link, main: n.depth === 0 && n.main_seq != null }); walk(n.children); }); })(nodes);
    return out;
  }
  const LEGEND_LINES = [
    'Above the spine, solid line: needed before go-live.',
    'Below the spine, dashed line: can wait until after go-live.',
    '› one level down · ›› two levels down · deeper levels fold into “+n more”.',
  ];

  // Approximate text width for layout inside a picture (Calibri-like metrics).
  function textWidth(s, size, bold) {
    let w = 0;
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      w += /[ilI.,:;'|!]/.test(ch) ? 0.25 : /[mwMW]/.test(ch) ? 0.8 : /[A-Z0-9]/.test(ch) ? 0.58 : c > 0x2000 ? 0.7 : 0.48;
    }
    return w * size * (bold ? 1.06 : 1);
  }
  function wrapText(s, size, max, bold) {
    const words = String(s).split(/\s+/), lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && textWidth(t, size, bold) > max) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /**
   * The picture (requirement 18): one SVG with a white background, its own
   * colours and fonts, the progress line, every phase in full one under the
   * other, the side items and the legend. Default width 1,000.
   */
  function pictureSVG(doc, width) {
    const W = Math.max(320, Math.round(width || 1000)), M = 15, inner = W - 2 * M;
    const out = []; let y = 0;
    for (const line of wrapText(doc.title, 18, inner, true)) { y += 24; out.push(`<text class="fb-title" x="${M}" y="${y}">${esc(line)}</text>`); }
    y += 22;
    const prog = progress(doc).map(p => `${esc(p.t0 || '')}<tspan font-weight="700" fill="#1a1a1a">${esc(p.b)}</tspan>${esc(p.t)}`).join('');
    out.push(`<text class="fb-progress" x="${M}" y="${y}">${prog}</text>`);
    y += 14;
    doc.phases.forEach(p => {
      const head = phaseHeading(doc, p);
      if (head) for (const line of wrapText(head, 15, inner, true)) { y += 24; out.push(`<text class="fb-head" x="${M}" y="${y}">${esc(line)}</text>`); }
      y += 8;
      const d = fishboneParts({ main: p.main, side: [], golive: p.golive }, inner);
      out.push(`<svg x="${M}" y="${y}" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" overflow="hidden">${d.inner}</svg>`);
      y += d.height;
    });
    if (doc.side.length) {
      for (const line of wrapText('Side items — in this fishbone, not on any main line', 15, inner, true)) { y += 24; out.push(`<text class="fb-head" x="${M}" y="${y}">${esc(line)}</text>`); }
      y += 8;
      sideRows(doc.side, inner).forEach(row => {
        const d = sideParts(row);
        out.push(`<svg x="${M}" y="${y}" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" overflow="hidden">${d.inner}</svg>`);
        y += d.height;
      });
    }
    // Legend: every stage in its colours, then solid, dashed, › and ››.
    y += 22; out.push(`<text class="fb-legend" x="${M}" y="${y}" font-weight="700">Legend</text>`);
    y += 8;
    let x = M;
    for (const c of doc.cats.values()) {
      const w = Math.ceil(textWidth(c.name, 12) + 14);
      if (x + w > W - M) { x = M; y += 26; }
      out.push(`<g><rect x="${x}" y="${y}" width="${w}" height="20" rx="4" fill="${c.fill}" stroke="${c.edge}" stroke-width="0.75"/><text x="${x + w / 2}" y="${y + 14}" text-anchor="middle" fill="${c.ink}">${esc(c.name)}</text></g>`);
      x += w + 8;
    }
    y += 20;
    const sample = [[`<line class="bone" x1="${M}" y1="0" x2="${M + 26}" y2="0"/>`, LEGEND_LINES[0]], [`<line class="bone after" x1="${M}" y1="0" x2="${M + 26}" y2="0"/>`, LEGEND_LINES[1]], ['', LEGEND_LINES[2]]];
    for (const [mark, text] of sample) {
      const lines = wrapText(text, 12, inner - 34);
      lines.forEach((line, k) => {
        y += 18;
        if (k === 0 && mark) out.push(mark.replace(/y1="0" (.*)y2="0"/, `y1="${y - 4}" $1y2="${y - 4}"`));
        out.push(`<text class="fb-legend" x="${M + (mark ? 34 : 0)}" y="${y}">${esc(line)}</text>`);
      });
    }
    y += 16;
    const style = css(doc.cats) + `.fb-title{font-size:18px;font-weight:700;fill:#1a1a1a}.fb-head{font-size:15px;font-weight:700;fill:#1a1a1a}.fb-progress,.fb-legend{font-size:13px;fill:${LINE}}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" role="img" aria-label="${esc('Fishbone for ' + doc.title)}" style="background:#ffffff"><style>${style}</style><rect width="100%" height="100%" fill="#ffffff"/>${out.join('')}</svg>`;
  }

  /* ------------------------------------------------------------------ *
   * The page view: used by the demo page and by Fishbone.draw (req. 30)
   * ------------------------------------------------------------------ */
  const VIEW_CSS = `
:host{display:block}
.fb{--ink:#1a1a1a;--muted:#5b6070;--line:#dfe2ea;--panel:#f7f8fb;--head:#dde3ee;--link:#185FA5;
  color:var(--ink);background:#fff;font-family:${FONT};font-size:14px;line-height:1.35;text-align:left}
.fb *{box-sizing:border-box}
.fb .fb-title{font-size:19px;font-weight:700;margin:0 0 4px}
.fb .progress{padding:4px 0 12px;font-size:13px;color:var(--muted)} .fb .progress b{color:var(--ink)}
.fb .bone-wrap{padding-bottom:6px;overflow:hidden}
.fb table{border-collapse:collapse;width:100%;font-size:13.5px;margin:4px 0 0}
.fb th{background:var(--head);color:var(--ink);text-align:left;font-weight:700;padding:7px 10px;border:1px solid var(--line)}
.fb td{padding:6px 10px;border:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
.fb td.num{white-space:nowrap} .fb td.num a{color:var(--link);font-weight:700;text-decoration:none} .fb td.num span{font-weight:700;color:var(--link)}
.fb tr.main td{font-weight:700}
.fb .phase{border:1px solid var(--line);border-radius:10px;margin:0 0 18px;background:#fff}
.fb .phase summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;font-size:15px;font-weight:700}
.fb .phase summary::-webkit-details-marker{display:none}
.fb .phase summary .meta{font-weight:400;color:var(--muted);font-size:13px}
.fb .phase.done summary{background:var(--panel)} .fb .phase .tick{color:#2f7d4f;font-size:16px}
.fb .phase.future{opacity:.55} .fb .phase.future:hover{opacity:.85}
.fb .phase .body{padding:8px 14px 14px;border-top:1px solid var(--line)}
.fb .single .body{padding:0}
.fb .side h3{font-size:14px;margin:18px 0 8px;color:var(--muted)}
.fb .legend{font-size:12.5px;color:var(--muted);margin:14px 0 4px}
.fb .chip{display:inline-block;border:1px solid;border-radius:4px;padding:0 6px;margin:0 2px;font-size:12px}
.fb .err{border:1px solid #E24B4A;background:#FCEBEB;color:#501313;border-radius:10px;padding:12px 16px}
.fb .err ol{margin:8px 0 0;padding-left:22px} .fb .err li{margin:3px 0}
@media (max-width:600px){.fb .phase .body{padding:8px 4px 10px}.fb th,.fb td{padding:5px 6px}}`;

  function tableHTML(nodes) {
    const rows = tableRows(nodes).map(r => {
      const idc = r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.id)}</a>` : `<span>${esc(r.id)}</span>`;
      return `<tr class="${r.main ? 'main' : ''}"><td class="num" style="padding-left:${10 + r.depth * 22}px">${r.depth ? '— ' : ''}${'›'.repeat(Math.max(0, r.depth - 1))}${idc}</td><td>${esc(r.name)}</td><td>${esc(r.stage)}</td><td>${r.gate}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>Item</th><th>Name</th><th>Stage</th><th>Before go-live?</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function legendHTML(doc) {
    const chips = [...doc.cats.values()].map(c => `<span class="chip" style="background:${c.fill};border-color:${c.edge};color:${c.ink}">${esc(c.name)}</span>`).join(' ');
    return `<div class="legend">Stages: ${chips}<br>${LEGEND_LINES.map(esc).join('<br>')}<br>Rest the pointer on a box for its name; a box with a link opens it.</div>`;
  }
  function viewHTML(doc) {
    const firstActive = Math.max(0, doc.phases.findIndex(p => p.status !== 'live'));
    let h = `<div class="fb-title">${esc(doc.title)}</div><div class="progress">${progress(doc).map(p => `${esc(p.t0 || '')}<b>${esc(p.b)}</b>${esc(p.t)}`).join('')}</div>`;
    doc.phases.forEach((p, i) => {
      if (!doc.hasPhases) { h += `<section class="single"><div class="body"><div class="bone-wrap" data-phase="${i}"></div>${tableHTML(p.main)}</div></section>`; return; }
      const cls = p.status === 'live' ? 'done' : (i === firstActive ? 'current' : 'future');
      h += `<section class="phase ${cls}"><details${cls === 'done' ? '' : ' open'}><summary>${cls === 'done' ? '<span class="tick">✓</span>' : ''}<span>${esc(phaseHeading(doc, p))}</span>` +
        `<span class="meta">${p.counts.main_done} of ${p.counts.main_total} on MAIN Live${cls === 'future' ? ' · not started' : ''}</span></summary>` +
        `<div class="body"><div class="bone-wrap" data-phase="${i}"></div>${tableHTML(p.main)}</div></details></section>`;
    });
    if (doc.side.length) h += `<section class="side"><h3>Side items — in this fishbone, not on any main line</h3><div class="bone-wrap" data-side="1"></div>${tableHTML(doc.side)}</section>`;
    return h + legendHTML(doc);
  }
  function errorsHTML(errors) {
    return `<div class="err"><b>No fishbone drawn. ${plural(errors.length, 'problem', 'problems')} in this file</b><ol>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ol></div>`;
  }
  // Fill each drawing slot at its own width. Boxes with a link open in a new tab.
  function paint(rootEl, doc) {
    const style = `<style>${css(doc.cats)}</style>`;
    rootEl.querySelectorAll('.bone-wrap[data-phase]').forEach(el => {
      const w = el.clientWidth; if (!w) return;
      const p = doc.phases[+el.getAttribute('data-phase')];
      const d = fishboneParts({ main: p.main, side: [], golive: p.golive }, Math.max(1, w));
      el.innerHTML = svgOpen(d.width, d.height, 'Fishbone for ' + doc.title) + style + d.inner + '</svg>';
    });
    rootEl.querySelectorAll('.bone-wrap[data-side]').forEach(el => {
      const w = el.clientWidth; if (!w) return;
      el.innerHTML = sideSVG(doc, w);
    });
    rootEl.querySelectorAll('svg a').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
  }

  const mounted = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  /**
   * Draws a fishbone from a file's text into `place`, at that place's width
   * (requirement 30). Everything goes inside a shadow root on `place`, so the
   * page around it is not touched. Returns {ok:true, doc} or {ok:false, errors};
   * on errors the list is shown in the place instead of a drawing.
   */
  function draw(place, text) {
    let state = mounted && mounted.get(place);
    if (!state) {
      const shadow = place.shadowRoot || (place.attachShadow ? place.attachShadow({ mode: 'open' }) : place);
      const host = document.createElement('div'); host.className = 'fb';
      const style = document.createElement('style'); style.textContent = VIEW_CSS;
      shadow.appendChild(style); shadow.appendChild(host);
      state = { host, doc: null, width: 0 };
      if (typeof ResizeObserver !== 'undefined') {
        state.ro = new ResizeObserver(() => {
          const w = host.clientWidth;
          if (state.doc && w !== state.width) { state.width = w; paint(host, state.doc); }
        });
        state.ro.observe(host);
      }
      host.addEventListener('toggle', () => { if (state.doc) paint(host, state.doc); }, true);
      if (mounted) mounted.set(place, state);
    }
    const r = read(text);
    if (!r.ok) { state.doc = null; state.host.innerHTML = errorsHTML(r.errors); return r; }
    state.doc = r.doc; state.width = state.host.clientWidth;
    state.host.innerHTML = viewHTML(r.doc);
    paint(state.host, r.doc);
    return r;
  }

  return {
    VERSION, MAX_BYTES, MAX_ITEMS, NARROW_BELOW, BUILTIN,
    read, validate, convert, parseXML, xmlToFile, stagesOf, countItems,
    fishboneParts, phaseSVG, sideSVG, sideParts, sideRows, pictureSVG, css,
    progress, progressText, phaseHeading, tableRows, gateWord, LEGEND_LINES, textWidth, wrapText,
    viewHTML, errorsHTML, draw, esc,
  };
});
