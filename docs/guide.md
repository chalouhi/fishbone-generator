# Using the Fishbone Generator

This guide is for someone using the tool for the first time. Read the [front page](../README.md) for what it does, and the [file-format guide](file-format.md) for how to write the file. This page covers the three ways to use the tool and how the drawing behaves.

## 1 · The demo page

<https://chalouhi.github.io/fishbone-generator/>

- **Give it a file** by dropping it anywhere on the page, by choosing it, or by pasting its text under "Or paste the file's text". The drawing appears straight away, with no reload. A pasted file is drawn as you type.
- **Try a sample**: the five buttons load the files from [`samples/`](../samples/).
- **Download picture** gives the SVG described in section 4; **Download PDF** gives the A4 document. Both buttons are switched off while a file with mistakes is on screen.
- **Phases**: a phase that is Live is folded to one line with a tick (click it to open it); the first phase that is not Live is open; later ones are shown faded and marked "not started".
- **Width**: make the window narrower or wider and the drawing is redrawn to fit, without giving the file again.
- **Privacy**: your file never leaves the browser. The page loads its own files and nothing else, and its security policy forbids it from sending anything anywhere after it has loaded.

## 2 · The command

For scripts and agents. Needs Node 18 or later; there is nothing to install and no network is used. From a copy of the repository:

```bash
node bin/fishbone.js <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>]
```

| Option | Meaning |
|---|---|
| `<file>` | The fishbone file, JSON or XML. |
| `--svg <path>` | Write the picture there. |
| `--pdf <path>` | Write the PDF there. |
| `--width <n>` | Width of the picture in points, 320 or more. Default 1000. The PDF is always A4. |
| `--help` | Show the usage. |

At least one of `--svg` and `--pdf` is needed.

| Exit code | Meaning |
|---|---|
| `0` | Done; the files asked for are written. |
| `1` | The file has mistakes. Nothing is written. The mistakes are printed one per line on standard output (a heading line, "No fishbone drawn. n problems in this file:", goes to standard error). |
| `2` | The command was used wrongly (no file, no output named, an unknown option, a width under 320, a file that cannot be read). Nothing is written. |

Example, in a script that must stop on a bad file:

```bash
node bin/fishbone.js plan.json --svg plan.svg --pdf plan.pdf || exit 1
```

**Fonts in the PDF:** Calibri when the machine has it installed; otherwise Carlito, a free font with the same letter widths, which is kept in `fonts/`.

## 3 · The script for your own page

Include one file and draw into any element of your page:

```html
<div id="plan"></div>
<script src="https://chalouhi.github.io/fishbone-generator/src/fishbone.js"></script>
<script>
  const result = Fishbone.draw(document.getElementById('plan'), fileText);
  if (result.ok) { /* drawn */ } else { console.log(result.errors); }
</script>
```

(You can also copy `src/fishbone.js` next to your page and include it from there.)

**`Fishbone.draw(place, text)`**

- `place` is an element on your page; `text` is the file's content as text, JSON or XML.
- It draws the fishbone, the progress line, the names table and the legend inside `place`, at `place`'s width.
- It returns `{ ok: true, doc }` when the file is good, or `{ ok: false, errors }` when it is not; `errors` is the list of mistakes, the same sentences the command prints. With mistakes, the list is shown in `place` instead of a drawing.
- **It changes nothing outside `place`.** Everything is drawn inside a shadow root attached to `place`, with its own styles, so your page's styles do not reach the drawing and the drawing's styles do not reach your page.
- When `place` changes width, the drawing is redrawn to the new width by itself.
- Calling it again on the same `place` replaces what was there.
- Boxes with a link open it in a new tab.

**Other functions** on the same `Fishbone` object, for pages or Node scripts that want the parts:

| Function | Gives |
|---|---|
| `Fishbone.read(text)` | `{ ok: true, doc }` or `{ ok: false, errors }`, without drawing. |
| `Fishbone.pictureSVG(doc, width)` | The picture as SVG text (width default 1000). |
| `Fishbone.phaseSVG(doc, i, width)` | Phase `i` (from 0) on its own, as SVG text. |
| `Fishbone.progressText(doc)` | The progress line as plain text. |

In Node: `const Fishbone = require('./src/fishbone.js')`. The PDF is made by `src/pdf.js` (`FishbonePDF.build(doc, {PDFLib, fontkit, regular, bold})`, which returns the bytes); it needs the two libraries in `vendor/` and the font files. See `bin/fishbone.js` for a complete example.

## 4 · What you get

**The picture (SVG)** — one file that shows correctly by itself in a browser: white background, its own colours, links working. It holds the title, the progress line, every phase in full one under the other with its heading, the side items, and the legend. It names Calibri as its font; a machine without Calibri shows its own nearest font. 1,000 points wide unless another width is asked for.

**The PDF** — A4 portrait, white. Everything the picture holds, then the names table: every item with its name, stage and whether it is needed before go-live, children indented under their parent, with a light grey header row. Text can be selected and copied, links work, and no drawing or table row is cut across two pages. Drawings are scaled to the page width.

**The page view** (demo page and `Fishbone.draw`) — the same drawing, with a names table under each phase.

## 5 · How the drawing behaves

**The parts**

- The **main line** (the spine) runs left to right in file order and ends in an arrow and the **go-live head**, which carries the go-live name.
- A **child needed before go-live** hangs above its step on a solid line; a child that **can wait**, or has neither set, hangs below on a dashed line.
- Children are drawn **three levels deep**: the second level is marked `›`, the third `››`. Anything deeper folds into one box reading **"+n more"**, where n is the number of items folded. Folded items are still listed in the names table.
- Each box takes its **stage's colours**. The go-live head always takes the colours of To do.
- Resting the pointer on a box shows its id, name and stage. A box with a link (its own, or from the file's `link_pattern`) opens it when clicked.
- **Progress line**, above the drawing: steps Live out of the total; children needed before go-live that are not Live yet ("critical children open"); and, when there are phases, phases Live out of the total.
- **Phases** are drawn as one fishbone each, stacked in file order, each under a heading "Phase n: name → go-live name". **Side items** are drawn once, at the end, hanging from a short line with no head.

**Fitting the width**

The drawing is never wider than the width it is given, for any width from 320 points up.

- **768 points and wider.** If the main line fits on one row, it is one row. If not, it wraps: the first break is between the Live steps and the rest, and each side is then cut into rows of even length, in file order. A row that is not the last ends with "continues below", or "Live · continues below" when every step on it is Live. The head is on the last row.
- **Narrower than 768 points** (phones). The layout tightens so more boxes fit on a row, "continues below" goes under its row, and the go-live head sits on its own line under the last row. The Live break and even rows are kept when they leave every row but the last with at least 4 boxes; when they would not, the whole line is cut into even rows, and failing that each row is filled and the rest goes on the last row. At 375 points every row but the last holds at least 4 boxes.

**Limits**

- A file larger than **1 MB**, or holding more than **2,000 items**, is refused with one message saying which limit was passed.
- A file with **any mistake draws nothing**: every mistake is listed at once, each saying where it is. The list of mistakes the tool looks for is in the [file-format guide](file-format.md), section 5.
- Text from the file is always shown as text. Nothing in a file can run as a script or change the page around the drawing.
- Sizes, spacing, fonts and layout cannot be changed by a file; only the colours and the stages can (file-format guide, section 4).

## 6 · Checking a copy of the tool

```bash
node --test tests/*.test.js
```

Runs with no network: every sample against its expected picture in `expected/`, the 12 reference pictures in `reference/`, the seven messages for `samples/5-broken.json`, the picture, the PDF and the command. The browser tests of the demo page (`tests/browser/page.test.js`) need Playwright with Chromium; `tests/browser/run-offline.sh` runs them in Playwright's container with no network.
