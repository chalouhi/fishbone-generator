# Fishbone file format

Version 1 · 2026-11-16

This page is for anyone who wants a fishbone drawn: a person, a board, a script or an agent. Produce one file as described here, hand it to the Fishbone Generator, and get the drawing back. It is also the contract the generator is tested against.

## 1 · What a fishbone shows

A fishbone is a plan drawn as one line of work that ends in a goal.

| Word | Meaning |
|---|---|
| **Go-live** | The goal the line leads to. Drawn as the head of the fish. |
| **Step** | One piece of work on the main line, in order. Drawn as a box on the spine. |
| **Child** | Work that was found while doing a step. Hangs off that step. A child can have children. |
| **Before go-live** | A child that must be finished before the goal. Drawn above the spine on a solid line. |
| **After go-live** | A child that can wait. Drawn below the spine on a dashed line. |
| **Phase** | A plan can have several goals in a row. Each phase has its own steps and its own go-live, and is drawn as its own fishbone, stacked in order. |
| **Side item** | Work that belongs to the plan but is on no main line. Drawn once, at the bottom. |
| **Stage** | Where an item stands. It decides the box's colour. Three are built in: To do (blue), Building (amber) and Live (grey). A file can add more. |
| **Live** | The one word for finished. An item is finished when its stage is Live, and a phase is finished when its status is live. No other word means finished. |

## 2 · The file

One JSON file, UTF-8. The same content written as XML is also accepted (section 6).

### Top level

| Field | Required | Meaning |
|---|---|---|
| `fishbone` | yes | The format version. Always `1`. |
| `title` | yes | The name of the plan. |
| `steps` | one of the two | The main line, in order, when the plan has a single goal. |
| `golive` | with `steps` | The name of the goal. |
| `phases` | one of the two | The ordered list of phases, when the plan has several goals. |
| `side` | no | Side items. |
| `link_pattern` | no | One web address used for every item, with `{id}` where the item's id goes, for example `https://example.com/cards/{id}`. Must start with `https://` or `http://` and contain `{id}`. |
| `style` | no | Colours and extra stages (section 4). |

A file has `steps` or `phases`, never both.

### A phase

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | The phase name, for example "Pilot". |
| `golive` | no | The name of this phase's goal. If left out, the phase name is used. |
| `status` | no | `live` or `active`. Default `active`. The first phase that is not live is the current one; later ones are shown faded as "not started". |
| `steps` | no | This phase's main line, in order. May be empty. |

### A step, a child or a side item

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | The short label written in the box. 1 to 5 characters. Must be different for every item in the file. |
| `name` | yes | The full name. Shown in the table and when the pointer rests on the box. |
| `stage` | no | The item's stage, by name (section 3). Left out: To do. |
| `before_golive` | no, children only | `true`: needed before go-live. `false`: can wait. Left out: treated as "can wait", and the table says "no (not set)". |
| `link` | no | A web address the box opens when clicked. Must start with `https://` or `http://`. Overrides the file's `link_pattern` for this item. With neither, the box is not clickable. |
| `children` | no | The items found while doing this one, in the order they were found. |

## 3 · Stages

A box takes the colour of its item's stage. The stage name is also what the table shows.

| Stage | Colour | Counts as Live |
|---|---|---|
| **To do** | blue | no |
| **Building** | amber | no |
| **Live** | grey | yes |

- The stage is matched by name, capitals ignored. A name that is not defined is a mistake in the file; nothing is guessed from other words.
- "Counts as Live" is what the progress line counts ("5 of 10 on MAIN Live") and where a long line breaks into rows.

## 4 · Style (optional)

A file with no `style` section uses the three built-in stages and their colours.

```json
"style": {
  "stages": [
    { "name": "Blocked", "fill": "#FCEBEB", "edge": "#A32D2D", "ink": "#791F1F", "counts_as_live": false }
  ]
}
```

| Field | Meaning |
|---|---|
| `name` | The stage name items use in their `stage` field, and the word shown in the legend and the table. |
| `fill`, `edge`, `ink` | Box colour, border colour and text colour, as six-digit hex. |
| `counts_as_live` | `true` or `false`. Default `false`. |

- Any number of stages can be added.
- Naming a built-in stage here recolours it. The go-live head always takes the colours of To do.
- Sizes, spacing, fonts and layout cannot be changed by a file. This keeps every fishbone recognisable and keeps the rule that a drawing is never wider than its page.

Built-in colours (fill / edge / ink): To do `#E6F1FB` / `#185FA5` / `#0C447C`; Building `#FAEEDA` / `#BA7517` / `#6B4208`; Live `#F1EFE8` / `#5F5E5A` / `#444441`.

## 5 · What the generator does with the file

- **Main line.** Steps in file order, left to right, ending in the go-live head.
- **Never wider than the page.** When the line does not fit, it wraps. The first break is between the Live steps and the rest; each side then wraps into even rows. On a phone-width page the layout tightens so several boxes still fit on a row.
- **Depth.** Children are drawn three levels deep. Anything deeper is folded into one "+n more" box, and is still listed in full in the table.
- **Table.** Under each drawing: every item with its name, stage and whether it is needed before go-live, children indented under their parent.
- **Progress line.** Steps Live out of total, children needed before go-live that are not yet Live, and phases Live when there are phases.
- **Several phases in a picture or PDF.** Every phase is drawn in full, one under the other.
- **A wrong file draws nothing.** The generator lists every problem at once, in plain words, each saying where it is. Example: `Step 3 (id "THREE-LONG"): the id is 10 characters; the limit is 5.`

### Problems the generator reports

Missing or wrong `fishbone` version · missing `title` · both or neither of `steps` and `phases` · missing `golive` with `steps` · an item with no `id` or no `name` · an `id` longer than 5 characters · an `id` used twice · a `stage` that is not defined · a `link` that is not a web address · a `link_pattern` that is not a web address or has no `{id}` · `before_golive` that is not true or false, or set on a step · a phase with no `name` or a `status` other than live or active · a colour that is not six-digit hex.

## 6 · The same file as XML

Same names, as attributes. `before-golive` takes `yes` or `no`.

```xml
<fishbone version="1" title="Kitchen refit" golive="Kitchen in use">
  <step id="1" name="Agree the layout" stage="Live"/>
  <step id="2" name="Order the units" stage="Building">
    <child id="2a" name="Choose the worktop" stage="To do" before-golive="yes"
           link="https://example.com/cards/2a"/>
  </step>
  <step id="3" name="Fit and connect" stage="To do"/>
</fishbone>
```

With phases, each `<phase name="…" golive="…" status="…">` holds its `<step>` elements. Side items go inside one `<side>` element as `<item>`. Extra stages go inside `<style>` as `<stage name="Blocked" fill="#FCEBEB" edge="#A32D2D" ink="#791F1F" counts-as-live="no"/>`.

## 7 · Smallest valid file

```json
{
  "fishbone": 1,
  "title": "Kitchen refit",
  "golive": "Kitchen in use",
  "steps": [
    { "id": "1", "name": "Agree the layout", "stage": "Live" },
    { "id": "2", "name": "Order the units", "stage": "Building" },
    { "id": "3", "name": "Fit and connect", "stage": "To do" }
  ]
}
```

## 8 · Producing the file from a board

Any system that keeps work as cards can produce this file. The mapping:

| The board has | The file gets |
|---|---|
| An initiative or project | `title` |
| Its phases, in order, each with a goal | `phases` (or `steps` + `golive` when there is only one) |
| Cards on the main line, in their order | `steps` |
| Cards spawned from another card | `children` of that card |
| "Needed before go-live" on a card | `before_golive` |
| Cards in the initiative on no main line and under no card | `side` |
| The card number | `id` |
| The card title | `name` |
| The card's stage | `stage`, mapped to the fishbone's stages |
| The address of a card on the board | `link_pattern`, once for the whole file |

For example, a board whose cards move through Draft, Approved, Building, Audit and Shipped can map Draft and Approved → To do; Building and Audit → Building; Shipped → Live.

A board should offer the file at one fixed web address per initiative, so a fishbone drawn from that address is always current.

## 9 · The five sample files

Kept with the generator and used as its tests. Each has the picture it must produce.

| File | What it proves |
|---|---|
| `1-smallest.json` | The least a file can contain; one step in each stage. |
| `2-comprehensive.json` | Three phases, children four levels deep, a child with before/after not set, links, side items. |
| `3-long-line.json` | 28 steps that must wrap, breaking first between Live and the rest; a link pattern makes every box clickable. |
| `4-custom-colours.json` | An extra stage (Blocked) and a recoloured built-in one. |
| `5-broken.json` | Seven mistakes; nothing is drawn and all seven are listed. |
