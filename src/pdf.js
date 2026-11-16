/*!
 * Fishbone Generator — the PDF (requirement 19). MIT licence.
 * A4 portrait, white, Calibri or the nearest font given; everything the
 * picture holds, then the names table. Text is real text; links work; no
 * drawing or table row is cut across two pages.
 *
 * Needs pdf-lib and @pdf-lib/fontkit (both in vendor/, no network).
 * Browser: include vendor/pdf-lib.min.js, vendor/fontkit.umd.min.js and
 * src/fishbone.js first, then FishbonePDF.build(doc, {PDFLib, fontkit, regular, bold}).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fishbone.js'));
  else root.FishbonePDF = factory(root.Fishbone);
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  const PAGE_W = 595.28, PAGE_H = 841.89, M = 40, CW = PAGE_W - 2 * M;
  const DRAW_AT = 768;           // drawings use the full layout, then scale to the page
  const LINE = '#5b6070', INK = '#1a1a1a';

  function hex(PDFLib, h) {
    const n = parseInt(String(h).slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  function roundRect(x, y, w, h, r) {
    const k = 0.5523 * r;
    return `M${x + r} ${y}H${x + w - r}C${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r}` +
      `V${y + h - r}C${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h}` +
      `H${x + r}C${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r}` +
      `V${y + r}C${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y}Z`;
  }

  async function build(doc, opts) {
    const PDFLib = opts.PDFLib, fontkit = opts.fontkit;
    const { PDFDocument, PDFString } = PDFLib;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle('Fishbone · ' + doc.title);
    pdf.setCreator('Fishbone Generator ' + F.VERSION);
    pdf.setProducer('Fishbone Generator ' + F.VERSION);
    const fR = await pdf.embedFont(opts.regular, { subset: true });
    const fB = await pdf.embedFont(opts.bold || opts.regular, { subset: true });
    const glyphs = new Set(fR.getCharacterSet());
    const SUB = { '→': '->', '›': '>', '—': '-', '–': '-', '·': '-', '✓': '', '“': '"', '”': '"' };
    const clean = s => Array.from(String(s)).map(ch => (glyphs.has(ch.codePointAt(0)) ? ch : (SUB[ch] != null ? SUB[ch] : '?'))).join('');
    const col = h => hex(PDFLib, h);
    const black = col('#000000');

    let page = null, y = 0;
    const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = M; };
    const ensure = h => { if (!page || y + h > PAGE_H - M) newPage(); };
    // trace (tests): the vertical extent of everything placed, per page
    const mark = (t, b) => { if (opts.trace) opts.trace.push({ page: pdf.getPageCount(), top: t, bottom: b }); };
    const text = (s, x, top, size, font, color) => mark(top - size, top + size * 0.25) || page.drawText(clean(s), { x, y: PAGE_H - top, size, font, color: color || black });
    const width = (s, size, font) => font.widthOfTextAtSize(clean(s), size);
    const link = (x1, top1, x2, top2, url) => {
      const a = pdf.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [x1, PAGE_H - top2, x2, PAGE_H - top1], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      });
      page.node.addAnnot(pdf.context.register(a));
    };
    function wrap(s, size, font, max) {
      const words = clean(s).split(/\s+/), lines = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && font.widthOfTextAtSize(t, size) > max) { lines.push(cur); cur = w; } else cur = t;
      }
      if (cur) lines.push(cur);
      // a single word longer than the column is cut by characters
      return (lines.length ? lines : ['']).flatMap(l => {
        if (font.widthOfTextAtSize(l, size) <= max) return [l];
        const out = []; let c = '';
        for (const ch of Array.from(l)) { if (c && font.widthOfTextAtSize(c + ch, size) > max) { out.push(c); c = ch; } else c += ch; }
        if (c) out.push(c);
        return out;
      });
    }

    // Draws one of the tool's own drawings (an <svg> made by fishbone.js) at
    // (ox, top) with scale s. Only the shapes the drawing uses are handled.
    function drawSVG(svgText, ox, top, s) {
      const root = F.parseXML(svgText);
      const cats = doc.cats, live = cats.get('live'), todo = cats.get('to do');
      const byCls = {};
      for (const c of cats.values()) byCls[c.cls] = { fill: c.fill, edge: c.edge, ink: c.ink };
      byCls.closed = { fill: live.fill, edge: live.edge, ink: live.ink };
      byCls.golive = { fill: todo.fill, edge: todo.edge, ink: todo.ink, sw: 1.5, bold: true };
      const opt = extra => Object.assign({ x: ox, y: PAGE_H - top, scale: s }, extra);
      (function walk(el, ctx) {
        for (const n of el.children) {
          const a = n.attrs;
          if (n.name === 'g') { walk(n, Object.assign({}, ctx, { look: byCls[a.class] || ctx.look })); continue; }
          if (n.name === 'a') { walk(n, Object.assign({}, ctx, { href: a.href })); continue; }
          if (n.name === 'line') {
            page.drawSvgPath(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`, opt({ borderColor: col(LINE), borderWidth: 1.5, borderDashArray: /\bafter\b/.test(a.class || '') ? [4, 3] : undefined }));
          } else if (n.name === 'path') {
            page.drawSvgPath(a.d, opt({ borderColor: col(LINE), borderWidth: 1.5 }));
          } else if (n.name === 'rect') {
            const L = ctx.look || byCls.closed;
            const x = +a.x, yy = +a.y, w = +a.width, h = +a.height;
            page.drawSvgPath(roundRect(x, yy, w, h, +(a.rx || 0)), opt({ color: col(L.fill), borderColor: col(L.edge), borderWidth: L.sw || +(a['stroke-width'] || 1) }));
            if (ctx.href) link(ox + x * s, top + yy * s, ox + (x + w) * s, top + (yy + h) * s, ctx.href);
          } else if (n.name === 'text') {
            const L = ctx.look;
            const label = n.text || '';
            const font = (L && L.bold) ? fB : fR, size = 12 * s;
            let x = ox + (+a.x) * s;
            if (a['text-anchor'] === 'middle') x -= width(label, size, font) / 2;
            text(label, x, top + (+a.y) * s, size, font, col(/note/.test(a.class || '') ? LINE : (L ? L.ink : INK)));
          }
        }
      })(root, { look: null, href: null });
    }

    newPage();
    // Title and progress line
    for (const line of wrap(doc.title, 18, fB, CW)) { ensure(24); y += 20; text(line, M, y, 18, fB); y += 4; }
    ensure(20); y += 14;
    let x = M;
    for (const p of F.progress(doc)) {
      for (const [s, f, c] of [[p.t0 || '', fR, LINE], [p.b, fB, INK], [p.t, fR, LINE]]) {
        if (!s) continue;
        text(s, x, y, 11, f, col(c)); x += width(s, 11, f);
      }
    }
    y += 10;

    // Every phase in full
    for (const p of doc.phases) {
      const head = F.phaseHeading(doc, p);
      const d = F.fishboneParts({ main: p.main, side: [], golive: p.golive }, DRAW_AT);
      const headLines = head ? wrap(head, 13, fB, CW) : [];
      const headH = headLines.length * 18 + 8;
      let s = Math.min(1, CW / d.width);
      const room = PAGE_H - 2 * M - headH;
      if (d.height * s > room) s = room / d.height;
      ensure(headH + d.height * s);
      for (const line of headLines) { y += 16; text(line, M, y, 13, fB); y += 2; }
      y += 8;
      drawSVG(`<svg>${d.inner}</svg>`, M, y, s);
      mark(y, y + d.height * s);
      y += d.height * s;
    }

    // Side items
    if (doc.side.length) {
      const rows = F.sideRows(doc.side, CW).map(F.sideParts);
      const first = rows[0];
      ensure(26 + first.height);
      y += 18; text('Side items — in this fishbone, not on any main line', M, y, 13, fB); y += 8;
      for (const r of rows) {
        let s = Math.min(1, (PAGE_H - 2 * M) / r.height);
        ensure(r.height * s);
        drawSVG(`<svg>${r.inner}</svg>`, M, y, s);
        mark(y, y + r.height * s);
        y += r.height * s;
      }
    }

    // Legend
    ensure(90);
    y += 20; text('Legend', M, y, 11, fB); y += 8;
    x = M;
    for (const c of doc.cats.values()) {
      const w = width(c.name, 10, fR) + 12;
      if (x + w > M + CW) { x = M; y += 22; ensure(22); }
      page.drawSvgPath(roundRect(0, 0, w, 16, 3), { x, y: PAGE_H - y, color: col(c.fill), borderColor: col(c.edge), borderWidth: 0.75 });
      text(c.name, x + 6, y + 11.5, 10, fR, col(c.ink));
      x += w + 6;
    }
    y += 16;
    F.LEGEND_LINES.forEach((line, k) => {
      for (const l of wrap(line, 10, fR, CW - 34)) {
        ensure(15); y += 15;
        if (k < 2) page.drawSvgPath(`M0 0L22 0`, { x: M, y: PAGE_H - (y - 3.5), borderColor: col(LINE), borderWidth: 1.5, borderDashArray: k === 1 ? [4, 3] : undefined });
        text(l, M + (k < 2 ? 30 : 0), y, 10, fR, col(LINE));
      }
    });
    y += 8;

    // Names table: light grey header row, black text, children indented.
    const COLS = [{ t: 'Item', w: 88 }, { t: 'Name', w: CW - 88 - 78 - 92 }, { t: 'Stage', w: 78 }, { t: 'Before go-live?', w: 92 }];
    const PAD = 4, SZ = 9.5, LH = 12;
    const header = () => {
      const h = LH + 2 * PAD;
      page.drawRectangle({ x: M, y: PAGE_H - (y + h), width: CW, height: h, color: col('#E8E8E8'), borderColor: col('#BFBFBF'), borderWidth: 0.5 });
      let cx = M;
      for (const c of COLS) { text(c.t, cx + PAD, y + PAD + 9, SZ, fB); cx += c.w; }
      y += h;
    };
    const groupRow = label => {
      const lines = wrap(label, SZ, fB, CW - 2 * PAD), h = lines.length * LH + 2 * PAD;
      if (y + h + LH + 2 * PAD > PAGE_H - M) { newPage(); header(); }
      page.drawRectangle({ x: M, y: PAGE_H - (y + h), width: CW, height: h, borderColor: col('#BFBFBF'), borderWidth: 0.5 });
      lines.forEach((l, i) => text(l, M + PAD, y + PAD + 9 + i * LH, SZ, fB));
      y += h;
    };
    const row = r => {
      const indent = r.depth * 9;
      const itemLines = wrap(r.label, SZ, r.main ? fB : fR, COLS[0].w - 2 * PAD - indent);
      const cells = [itemLines, wrap(r.name, SZ, r.main ? fB : fR, COLS[1].w - 2 * PAD), wrap(r.stage, SZ, r.main ? fB : fR, COLS[2].w - 2 * PAD), wrap(r.gate, SZ, r.main ? fB : fR, COLS[3].w - 2 * PAD)];
      const h = Math.max(...cells.map(c => c.length)) * LH + 2 * PAD;
      if (y + h > PAGE_H - M) { newPage(); header(); }
      mark(y, y + h);
      let cx = M;
      cells.forEach((lines, i) => {
        page.drawRectangle({ x: cx, y: PAGE_H - (y + h), width: COLS[i].w, height: h, borderColor: col('#BFBFBF'), borderWidth: 0.5 });
        const f = r.main ? fB : fR;
        lines.forEach((l, j) => text(l, cx + PAD + (i === 0 ? indent : 0), y + PAD + 9 + j * LH, SZ, f));
        if (i === 0 && r.link) {
          const lx = cx + PAD + indent;
          link(lx, y + PAD, lx + Math.max(...lines.map(l => width(l, SZ, f))), y + PAD + lines.length * LH, r.link);
        }
        cx += COLS[i].w;
      });
      y += h;
    };
    if (y + 60 > PAGE_H - M) newPage();
    y += 14; text('Names', M, y, 13, fB); y += 8;
    header();
    for (const p of doc.phases) {
      if (doc.hasPhases) groupRow(F.phaseHeading(doc, p));
      F.tableRows(p.main).forEach(row);
    }
    if (doc.side.length) { groupRow('Side items'); F.tableRows(doc.side).forEach(row); }

    return pdf.save();
  }

  return { build, PAGE_W, PAGE_H };
});
