#!/usr/bin/env node
/*
 * Fishbone Generator — the command (requirements 27–29). MIT licence.
 *
 *   fishbone <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>]
 *
 * Reads a fishbone file (JSON or XML) and writes the picture, the PDF, or both.
 * A wrong file: nothing is written, the problems are printed, exit code 1.
 * Needs no network.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../src/fishbone.js');

const ROOT = path.join(__dirname, '..');
const USAGE = `Usage: fishbone <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>]

  <file>          a fishbone file, JSON or XML (see docs/file-format.md)
  --svg <path>    write the picture (SVG) there
  --pdf <path>    write the PDF (A4) there
  --width <n>     width of the picture in points, 320 or more (default 1000)

At least one of --svg and --pdf is needed. Exit code 0 on success, 1 when the
file has problems (nothing is written), 2 when the command is used wrongly.`;

function args(argv) {
  const o = { width: 1000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--svg' || a === '--pdf' || a === '--width') {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (o.file) throw new Error('only one file can be given');
    else o.file = a;
  }
  if (o.help) return o;
  if (!o.file) throw new Error('no file given');
  if (!o.svg && !o.pdf) throw new Error('say where to write: --svg <path>, --pdf <path>, or both');
  o.width = Number(o.width);
  if (!Number.isFinite(o.width) || o.width < 320) throw new Error('--width must be a number, 320 or more');
  return o;
}

// Calibri when the machine has it, else Carlito (same widths), shipped in fonts/.
function fonts() {
  const dirs = [
    'C:\\Windows\\Fonts', '/Library/Fonts', path.join(process.env.HOME || '', 'Library/Fonts'),
    '/usr/share/fonts', '/usr/local/share/fonts', path.join(process.env.HOME || '', '.fonts'),
    '/Applications/Microsoft Word.app/Contents/Resources/DFonts',
  ];
  const find = names => {
    for (const d of dirs) {
      let stack = [d], seen = 0;
      while (stack.length && seen < 4000) {
        const cur = stack.pop(); seen++;
        let list; try { list = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
        for (const e of list) {
          if (e.isDirectory()) stack.push(path.join(cur, e.name));
          else if (names.includes(e.name.toLowerCase())) return path.join(cur, e.name);
        }
      }
    }
    return null;
  };
  const r = find(['calibri.ttf']), b = find(['calibrib.ttf']);
  if (r && b) return { regular: fs.readFileSync(r), bold: fs.readFileSync(b), name: 'Calibri' };
  return {
    regular: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Regular.ttf')),
    bold: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Bold.ttf')),
    name: 'Carlito',
  };
}

async function main(argv) {
  let o;
  try { o = args(argv); } catch (e) { process.stderr.write(`fishbone: ${e.message}\n\n${USAGE}\n`); return 2; }
  if (o.help) { process.stdout.write(USAGE + '\n'); return 0; }
  let text;
  try { text = fs.readFileSync(o.file); } catch (e) { process.stderr.write(`fishbone: cannot read ${o.file}: ${e.code || e.message}\n`); return 2; }
  const r = F.read(text.toString('utf8'));
  if (!r.ok) {
    process.stderr.write(`No fishbone drawn. ${r.errors.length} ${r.errors.length === 1 ? 'problem' : 'problems'} in this file:\n`);
    process.stdout.write(r.errors.join('\n') + '\n');
    return 1;
  }
  // Everything is made first; files are written only when all of it succeeded.
  const out = [];
  if (o.svg) out.push([o.svg, Buffer.from(F.pictureSVG(r.doc, o.width), 'utf8')]);
  if (o.pdf) {
    const PDFLib = require('../vendor/pdf-lib.min.js');
    const fontkit = require('../vendor/fontkit.umd.min.js');
    const f = fonts();
    const bytes = await require('../src/pdf.js').build(r.doc, { PDFLib, fontkit, regular: f.regular, bold: f.bold });
    out.push([o.pdf, Buffer.from(bytes)]);
  }
  for (const [p, data] of out) {
    const tmp = p + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, p);
  }
  for (const [p] of out) process.stderr.write(`wrote ${p}\n`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { process.stderr.write(`fishbone: ${e.stack || e}\n`); process.exitCode = 3; });
}
module.exports = { main };
