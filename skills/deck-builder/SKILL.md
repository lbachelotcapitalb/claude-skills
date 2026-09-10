---
name: deck-builder
description: "Build or restructure polished, on-brand decks — as a self-contained HTML deck (1920×1080 fixed stage, PDF export) or as a PowerPoint .pptx. Use when creating, redesigning, de-cluttering, or fixing the layout of a deck/pitch/plaquette/presentation/slides — especially slides that feel empty, repetitive, or inconsistent, or when the maintainer asks for a vignette, a stat card, a slide element seen in a reference. Use it too when he asks for photos or visuals for a deck (« trouve-moi des photos », « il manque des visuels »). The maintainer names the output medium (« en HTML », « en pptx »); this skill never guesses it. Carries the layout doctrine shared by both media (fill the space, cross-card alignment, colour encodes category, type floor, one fact one home, assertion titles), a 34-model HTML design-system library, a measured geometry gate (overlap / overflow / dead space / balance / legibility), and a bridge to visual-lab, which also SOURCES free licensed photography filtered by palette. Complements the base `pptx` skill."
---

# deck-builder

One skill, two output media. The **doctrine below is medium-agnostic** — it governs
what a good slide is, and it applies whether the slide ends up in a browser or in
PowerPoint. The medium-specific kit lives in a backend reference, loaded only once the
medium is known.

## Routing — the maintainer names the medium, never guess it

| the maintainer says | Backend | Read |
|---|---|---|
| « en HTML », « slides web », « une page », « un deck à partager par lien » | HTML | `references/backend-html.md` |
| « en pptx », « PowerPoint », « il faut que le client puisse éditer » | pptx | `references/backend-pptx.md` |
| nothing explicit | **ask, one question** | — |

Never infer the medium from the subject. A pitch deck is not more "HTML" than "pptx" —
the answer depends on who receives it and what they do with it, and that is the maintainer's call.
Two decks on the same subject in the two media is a legitimate ask, not a contradiction.

For the "quick deck, mostly images, nobody will read it twice" case, the **Gamma**
connector is already wired and is the right tool — HTML is for bespoke work. The two
coexist; say which one you are taking and why in one line.

## Chronologie de production (the maintainer, verbatim) — applies to BOTH backends

> 1. audit du besoin
> 2. réflexion / sourcing d'idées dans la base
> 3. rédaction du plan de production
> 4. soumission d'une première maquette pour proposition
> 5. validation ou itération avec l'humain (the maintainer)
> 6. production

This is the skeleton of every job. Concretely:

1. **Audit du besoin** — who is the audience, what decision must they make, what do they
   already know, how long do they have, is this read alone or narrated? A deck built
   before this is answered is a deck rebuilt.
2. **Réflexion / sourcing** — go find the substance in the real base before writing a
   word: your own systems of record (the analytics store, the inventory/map of
   the estate, the accounting base), the repos, prior decks. **A number on a slide comes from a system, never
   from your head.** Also shop `~/visual-lab` at this point — see below.
3. **Plan de production** — one line per slide: assertion title + the single idea + the
   exhibit type. Run the ghost-deck test (rule 3) and build the one-fact-one-home map
   (rule 2). This is what the maintainer validates, and it is cheap to change here.
4. **Première maquette** — **ONE representative slide**, fully finished, not the deck.
   Pick the slide that carries the most design risk (the densest content slide, not the
   cover — a cover always looks good and proves nothing). Show, don't tell: generate the
   real thing rather than asking a question about taste.
5. **Validation ou itération** — the maintainer says go, gives a consigne to iterate on, or hands
   back his own version verbatim. Do not start step 6 before one of the three.
6. **Production** — build the whole deck, then **the gate**: no deck is handed back
   before the geometric audit passes (see "Vérification" below). Handing back a deck with
   an unmeasured overlap is the failure mode this skill exists to kill.

7. **Argumentaire** — ship, alongside the deck, a `<deck>.ARGUMENTAIRE.md` that justifies
   **every element, one by one** (the maintainer, 6th review, 30/07/2026: « tu dois toujours pouvoir
   argumenter ce que tu produis, chaque élément que tu poses »). See the next section.

Steps 4 and 5 collapse into nothing when the maintainer has already validated a direction in a
previous session on the same deck — reuse it, don't re-ask. Step 7 never collapses.

## L'ARGUMENTAIRE — every element defended, one by one

**A deck is not handed back with only a gate report.** The gate proves nothing overlaps; it
says nothing about WHY this background, this colour, this size, this shape on this slide.
The maintainer reviews decisions, not pixels, and a decision he cannot interrogate is a decision he
cannot overrule. So the deliverable is a pair: `deck.html` + `deck.ARGUMENTAIRE.md`.

Write it **as you build**, not after — an argument reconstructed at the end is a
justification, and a justification hides the choices that were never made deliberately.
The test: if an element cannot be defended in one line, it should not be on the slide.

Structure (one file, in this order):

| section | what it holds |
|---|---|
| 0 · Socle | canvas, scale factor k, template, type scale, palette tokens — each token with its reason and its measured value |
| 1 · Règles transverses | the doctrine rules actually load-bearing in THIS deck, each with the slide that forced it |
| 2 · Rythme | the section cut and why each section carries the background it carries |
| 3 · Slide par slide | one block per slide: every element (eyebrow, pill, title, exhibit, each card, each colour) → what it is, why it's there, why THAT colour/size/shape |
| 4 · Valeurs calibrées | every number found by measurement rather than choice (a padding, a font-size), with the sweep that produced it |
| 5 · Refusé | what was considered and rejected, and why — the most useful section on re-read |

**And it is REPLAYED against the deck, in a loop, until the two agree.** (the maintainer, 6th review:
« loop check de l'argument jusqu'à modification visuelle et argumentation rattachée
cohérente ».) Ship a small checker beside the deck that re-asserts every claim against the
source — the CSS cascade (read the LAST declaration, not the first, or you argue about a dead
rule), the gate's JSON, and the slide markup — then look at the rendered pages with the
argument in hand. Loop: fix the deck OR fix the argument, re-measure, re-render, re-read.

The three kinds of gap it finds, none of which the gate can see:
1. **A figure quoted from memory.** Four were wrong on the reference deck (53 vs 59-75
   car./line, 66 vs ~90, 9,34:1 vs 11,2, a worst-contrast that only held for reading text).
2. **An argument that does not describe the render.** « symmetric with slide 4 » — one slide
   grouped its cards in a panel, the other didn't. The diptych was claimed, not built.
3. **An exhibit whose numbers don't add up to the figure beside it.** A big « 61/154 » sat
   next to a list totalling 93. The eye reads a list beside a figure as ITS breakdown; this
   one wasn't. Assert the sum in the checker — it is the cheapest lie to ship and the most
   expensive to be caught on.

Three rules for the content:
- **A colour is argued per slide, not once globally.** « accent = cobalt » is a token, not an
  argument. Why THIS figure is green on THIS slide, and why the neighbouring one is not, is.
- **Cite the measurement when one exists** (« 3.72:1 under card+panel », « the only padding
  where the five labels hold on 4 lines »). A calibrated value is stated as calibrated —
  never dressed up as taste.
- **Say what was refused.** Numbering that would have implied a false order, a `min-height`
  that would only have silenced an audit, a centring that would have broken the reading edge.

## Use the library before inventing (visual-lab)

`~/visual-lab` holds vignettes reverse-engineered from real reference decks: each one is a
documented intention, a set of RATIOS, and a list of **benchmarks** — measurable assertions
(chamfer ÷ width, type-size jump, contrast, no-overflow) that the vignette must satisfy. They
exist so a slide element is never re-guessed twice, and so "it looks fine" is not the only
proof available. It is shared with the HTML/web side, so it serves both backends.

```bash
cd ~/visual-lab && node bin/index.mjs            # index ALWAYS regenerated first (see below)
sed -n "/## Catalogue/,/## Détail/p" INDEX.md     # the routing table: one line per pattern
node bin/search.mjs "stat accent"                # full-text, prints the HTML fragment
node bin/check.mjs card-03-stat-accent           # the benchmarks, measured in a real browser
```

Three rules that make this work, all learned the hard way:

1. **The index is generated, never hand-edited.** `node bin/index.mjs` rewrites `INDEX.md` and
   `index.json` from `patterns/*.json`. Run it BEFORE reading the library and AFTER touching
   any pattern — `vl_pptx` reads `index.json`, so a stale index makes an emitter fail with a
   "geometry.<key> absent" error whose real cause is the missing re-index.
2. **Pixels don't travel, ratios do.** A fragment is tuned for a 1600px-wide slide; converted
   literally, its 17px body becomes 10.2pt — below the body floor. Anchor the scale on the
   body size and derive everything else from the pattern's ratios (`vl.scale()` on the pptx
   side). Never copy a px value from a fragment into a slide of a different width.
3. **Two checkers, one set of assertions.** `bin/check.mjs` measures the HTML in a browser,
   `vl.audit()` measures what was actually placed on a .pptx slide. When one catches something
   the other misses, add the assertion on BOTH sides — that is how the body contrast on the
   orange accent (2.77:1, below the 3:1 large-text floor) was caught: the .pptx audit had the
   check, the HTML harness didn't.

**Adding to the library is part of the job.** When you design a vignette that works and could
serve again, extract it: `patterns/<id>.json` (intent, when to use, when to AVOID, vars,
`geometry.root/ratios/type_px/pad_ratio`, `benchmarks`) + `<id>.html`, then `node bin/index.mjs`
(it refuses to index an incomplete pattern), `node bin/check.mjs <id>`, and a look at
`node bin/render.mjs --pattern <id>`. A vignette that only lives inside one deck is a vignette
you will rebuild by hand next quarter.

## Source real photography — free, licensed, palette-filtered (visual-lab/bin/photos.mjs)

A deck that needs photographs does NOT need a stock-photo browsing session, and it must never
hotlink a remote URL (a deck is a file that outlives the link). `~/visual-lab/bin/photos.mjs`
sources images, **downloads** them next to the deck material, and writes a `manifest.json`
carrying photographer, source URL and licence — the only thing you need if the deck is later
published.

```bash
cd ~/visual-lab
# Pexels — contemporary editorial photography. Key lives in Bitwarden, never in a settings file.
node ~/Documents/Claude/Projects/cartographie-it/bw-get.mjs \
  --item "Pexels — API" --field PEXELS_API_KEY --as PEXELS_API_KEY \
  --exec 'node bin/photos.mjs --slug <deck> --palette ref-10-campaign-board-red --n 4 \
    --query "empty office golden hour" --query "hands on keyboard"'

# The Met — public-domain artworks (CC0). NO KEY. Texture, matter, backgrounds.
node bin/photos.mjs --provider met --slug <deck> --palette "#1B44D8" --query "ceramic glaze"

node bin/render.mjs assets/photos/<deck>/board.html 1600 1180   # look at the harvest
```

**Why the palette filter is the whole point.** What makes a set of images read as one deck is
not the quality of each photo, it is their shared CASTING. The tool scores every candidate by
ΔE76 in CIELAB against a target palette — pass it the deck's own palette (`--palette sys-NN`,
or the hex list of the design system in use) and the harvest comes back on-brand. `--tol`
loosens the seuil (42 by default), `--any` gives up sorting.

Two facts to keep in mind, both paid for:
- **A neutral target proves no casting.** Feeding the cream `#EDEAE3` of a system let a cold
  blue-grey photo through — a grey sits at moderate ΔE from every grey in the world. Low-chroma
  targets are dropped automatically; pass the ACCENTS, not the paper colour.
- **Pexels publishes `avg_color`, the Met does not.** So Pexels sorting costs 1 request per 80
  candidates, while the Met costs 1 detail request per candidate plus a thumbnail probe
  (`--scan` bounds it). Prefer Pexels when a key is available.

The `.jpg` files are gitignored in visual-lab (no binary weight in history) — the manifest is
what is versioned, and it is enough to re-download an identical harvest.

---

# The non-negotiable rules

These are hard constants, medium-agnostic. Apply them without being asked. Each backend
reference names the helper that enforces the rule in that medium.

> **The laws themselves are the house's, not this skill's.** They are listed once, medium-free,
> in [`~/visual-lab/DOCTRINE.md`](../../../visual-lab/DOCTRINE.md) — which also names, per law,
> what measures it in each medium (and where nothing does yet). What follows here is their SLIDE
> application: the thresholds, the units, the `bin/gate.sh` audits. Read DOCTRINE.md when you
> produce anything that is not a slide — a mailing, a flyer, a post — so the same laws travel
> without dragging the slide numbers with them.

| # | The rule | The defect it forbids |
|---|---|---|
| 1 | **FILL THE SPACE** | an idle void inside a card: grow the content, never stretch the box |
| 1b | **SHAPE AND COLOUR ENCODE CATEGORY** | one shape for two different natures = false grouping |
| 1c | **SURFACE, RELIEF, GROUPING** | a flat deck with no hierarchy of planes |
| 2 | **ONE FACT, ONE HOME** | the same figure repeated from slide to slide |
| 3 | **ASSERTION TITLES** | a title that names a topic instead of asserting something |
| 3-ter | **A QUOTE HAS A CHRONOLOGY** | price on the cover; offer → features → pricing → track record |
| 4 | **READABLE TYPE — a hard FLOOR** | a run below the floor, a box that doesn't contain its content |
| 4c | **JUSTIFIED TEXT is an arbitrage** | justification decided by taste instead of by measurement |
| 4b | **LEGIBLE LOGOS** | a logo wall treated as a footnote |
| 5 | **CONSISTENT TOKENS** | a hard-coded value where a token exists |
| 6 | **NO running-footer clutter** | a permanent band nobody asked for |
| 6b | **A SEPARATOR IS JUDGED BY ITS TWO GAPS** | a rule glued to one side — the gate measures it |
| 7 | **BACKGROUND RHYTHM** | a background that changes per slide instead of per section |

Each rule in full — numeric thresholds, units, before/after examples, and the `bin/gate.sh`
audit that measures it — lives in
**[references/regles-mise-en-page.md](references/regles-mise-en-page.md)**. Open it before
laying out the first slide: a rule applied without its threshold cannot be verified.

---

# Vérification — the gate, both backends

**Nothing is handed back on "ça a l'air bien".** Geometry is measurable, so it gets measured.
The same four audits exist on both sides, under the same names:

| audit | what it proves |
|---|---|
| `audit_overlaps` | no two visible elements overlap by more than a threshold area |
| `audit_overflow` | no child box escapes its parent; no scrollable overflow |
| `audit_vbalance` | the void above a centred block ≈ the void below it (rule 1) |
| `audit_text_sizes` | no run below the type floor; contrast ≥ WCAG (rule 4) |

The HTML backend adds two that only a real browser can give: **dead space** (largest maximal
empty rectangle, the measured form of FILL THE SPACE) and **occupancy / centre-of-ink
symmetry**. Run them with `bin/gate.sh <deck.html>` — exit 1 on any hard defect, full JSON
report, and `bin/selftest.sh` proves the gate itself still fails when it should. Details in
`references/backend-html.md`.

The loop is **measure → fix → re-measure until zero hard defect**, with an iteration ceiling
and a log of the deltas, so a fix that breaks another slide is visible instead of looping.
A gate output is a deliverable (`/verify` doctrine): the proof the maintainer reads.

Aesthetic judgement ("ça rend mal") still needs a human look at a faithful render — the gate
buys the right to ask for that look, it does not replace it.

---

# Files in this skill

Every reference below hangs directly off this file — read whichever the task needs, none
of them through another.

| file | what it holds |
|---|---|
| [references/regles-mise-en-page.md](references/regles-mise-en-page.md) | the layout rules in full: thresholds, units, before/after, the audit per rule |
| [references/backend-pptx.md](references/backend-pptx.md) | the python-pptx kit (runtime, helpers, gotchas) |
| [references/backend-html.md](references/backend-html.md) | the fixed-stage socle, the 34 models, the gate, the exports |
| [references/structure.md](references/structure.md) | editorial rules (assertion titles, one-idea, de-dup) |
| [references/design_tokens.md](references/design_tokens.md) | palettes, style recipes, type/space scales |
| [references/backgrounds.md](references/backgrounds.md) | background recipes (plexus_edge, low-poly, centre-veil…) |

```
pptx_kit.py svg_icons.py render_check.py   ← pptx backend code

assets/stage.css assets/stage.js   ← HTML: the ONE fixed-stage implementation
assets/deck.html                   ← HTML: the skeleton to copy
assets/templates/index.json        ← HTML: the 34 models, compact index — start here
assets/templates/<slug>/           ← HTML: preview.md (short) + design.md (full)
assets/fixture-deck.html           ← HTML: the gate's regression bench (known verdict)

bin/gate.sh  bin/gate.mjs          ← the geometry gate (ego-browser), exit 1 on hard defect
bin/selftest.sh                    ← proves the gate still fails when it should
bin/export-pdf.sh  bin/export-pdf.mjs   ← vector PDF, one slide per page
bin/import-templates.py  bin/anchor-scale.py   ← rebuild assets/templates/ from the source repo

~/visual-lab/                ← the pattern library, shared with the web side
```

## Attribution / licenses
- Design-token tables: MiniMax-AI/skills (MIT).
- Dynamic-fit & text-measurement ideas: GongRzhe/Office-PowerPoint-MCP-Server (MIT).
- HTML fixed-stage model + the 34 design-system models: `zarazhangrui/frontend-slides` (MIT),
  imported and repaired — see `references/backend-html.md` for what was changed and why.
- Structure principles: widely-known presentation practice (assertion titles / pyramid
  principle / one-idea-per-slide), written here in original form.
