# zoning-envelope

A pnpm monorepo for zoning-envelope tools. The build spec for the SB 79 memo is
`../SB79_SPEC.md`; read it in full before starting any phase.

## Layout

```
zoning-envelope/
  apps/web/              # reserved: the zoning envelope tool (not in this repo yet)
  apps/sb79-memo/        # SB 79 animated explainer (Astro + MDX + React islands)
  packages/engine/       # shared geometry: area, extrude, floor plates, volume, edge distance
  packages/law/          # sb79.json (cited), statute snapshots, lawAsOf, evaluateSite
```

## Commands (run from `zoning-envelope/`)

```
pnpm install
pnpm dev      # memo dev server, http://localhost:4321
pnpm test     # Vitest in every package
pnpm check    # tsc (packages) and astro check (memo)
pnpm build    # static build of the memo into apps/sb79-memo/dist
```

Node >= 22.12, pnpm 10. Dependency versions are pinned exactly.

**Hosting.** `.github/workflows/pages.yml` (repo root) runs the tests, builds
the memo with `BASE_PATH=/<repo>/`, and publishes it to GitHub Pages on every
push to `main` (https://matthew6113.github.io/SB79/). Locally the base is `/`.
Code that builds a URL to the site's own files joins `import.meta.env.BASE_URL`
onto it; never write a root-absolute path like `/figure-data.json`.

## Working rules (whole project)

- Never invent legal values. Every height, density, FAR, percentage, threshold,
  and date comes from `packages/law/sb79.json`, and every value there carries
  its Government Code citation.
- Verify every data source against the live service before relying on it, and
  report anything that differs from the spec.
- Every phase ends with its "Done when" test passing. Run the tests before
  saying a phase is done.
- When the spec is ambiguous or an open legal issue blocks progress, stop and
  ask Matthew rather than guessing.
- Do not start a phase until the previous phase's "Done when" is true and
  Matthew has approved the plan.

## apps/web — zoning envelope tool

Not present. This repo started empty, so the monorepo was created fresh around
the SB 79 memo. If the existing zoning tool is brought in, it goes in
`apps/web`, and its engine is merged into `packages/engine`; the memo imports
geometry only through `@zoning-envelope/engine`. The planned "SB 79 overlay"
step in the tool reads the same `@zoning-envelope/law` package.

## packages/engine — shared geometry

Pure TypeScript with no runtime dependencies. Polygons are planar `{ outer,
holes? }` rings in a local projected frame (the memo uses feet).

- `polygonArea`, `ringArea`: shoelace area, winding-independent, holes subtracted.
- `extrude(polygon, { height, base? })` returns a `Prism`; `prismVolume(prism)` measures it.
- `stackFloorPlates(polygon, { floorToFloor, maxHeight, maxFloorArea?, base? })`
  stacks stories until the next would exceed `maxHeight` or the area cap is
  reached; the top plate is `partial` when the area cap binds.
- `distancePointToPolygon(point, polygon)`: straight line to the nearest edge,
  0 inside (Gov. Code § 65912.157(b)'s measurement).
- The engine holds no legal numbers. Floor-to-floor height is a caller-supplied
  design assumption, never a default.
- Imports use `.ts` extensions so Node scripts can run the source directly.

## packages/law — SB 79 as data

- `sb79.json`: every value is a cited leaf `{ value, unit?, cite, source, quote }`.
  `cite` is one pinpoint ("Gov. Code § 65912.157(a)(3)(A)"); `quote` is
  verbatim from that pinpoint in `source/<source>`. Leaves may carry
  `from`/`to` dates; provisions that change wording carry `versions`.
- `source/`: official text from downloads.leginfo.legislature.ca.gov
  (`pnpm --filter @zoning-envelope/law fetch-statute`). Never hand-edit.
- `lawAsOf(date)` resolves the provisions in force that day (SB 722 from
  2026-07-16; AB 2576 and SB 1361 from 2027-01-01).
- `evaluateSite(inputs, { asOf })` runs the spec's seven steps. Without
  `project` facts, step 6 is pending and the outcome is
  `floors-apply-if-conditions-met`.
- `test/citations.test.ts` fails if a quote is not at its pinpoint, does not
  state its value, or if any number in `sb79.json` lacks a citation.
  Add a legal value only together with its cite and quote.
- `VERIFICATION.md` lists where the spec differs from the statute and data.

## apps/sb79-memo — SB 79 animated explainer

**Goal.** An SB 79 explainer in the format of a law-firm client alert (key
points, question headings, key takeaways, a closing disclaimer), with one real
North Berkeley BART site as its running example. Every paragraph plays a
figure state beside it as the reader scrolls: a pale ghost envelope (local
zoning) and a solid envelope rising to what SB 79 requires the city to allow.
The standards are floors on the city's limits, not caps on the project: write
"the city must allow at least", never "the project may build up to". The app
keeps its `sb79-memo` name and `memo.*` file names.

**Stack.**

| Layer | Choice | Status |
| --- | --- | --- |
| Site | Astro 7 + `@astrojs/mdx` + `@astrojs/react` (React 19 islands) | Phase 0 |
| Law | `packages/law/sb79.json` + zod schema + `evaluateSite` | Phase 1 |
| 2D figures | D3 + SVG | Phase 3 |
| 3D figure | react-three-fiber (three.js lines and meshes; drei dropped in Phase 4), geometry from `packages/engine` | Phase 3 |
| Motion | GSAP timelines: the motion grammar, `src/figures/motion.ts` | Phase 4 |
| Scroll | GSAP ScrollTrigger per `<Step>` + a playhead, `src/scroll/engine.ts` | Phase 4 |
| Print | Paged.js 0.4 (`/print/`: page box, footnotes at each page foot) | Phase 5 |
| Tests | Vitest | Phase 0 on |

**Folder map.**

```
apps/sb79-memo/
  astro.config.mjs        # MDX + React integrations
  src/content/memo.mdx    # the explainer text, one <Step id> per paragraph
  src/script.ts           # paragraph id -> figure + state (the spec's script table)
  src/memo.config.ts      # header config (the byline stays configurable) and exhibit APNs
  src/memo-data.ts        # every number the explainer shows, from @zoning-envelope/law and data/
  src/parcel-classes.ts   # each parcel near the station classified once: band, zoning, BART, rent estimate, landmark
  src/format.ts           # number, date, and address formatting (no legal values)
  src/components/         # Step, Letterhead (the header), Law (statute cites), Source, OpenIssue, StandardsTable
  src/figures/            # React islands: MapFigure, EnvelopeFigure, Timeline, FigureStage, DevPanel
  src/figures/three-parts.tsx # R3F pieces for EnvelopeFigure (Prism, Band, Projector, Warmup)
  src/figures/figure-data.ts  # build-time figure data (served as /figure-data.json)
  src/figures/views.ts    # state -> view, a pure function of progress, per figure
  src/figures/motion.ts   # the motion grammar (draw, rise, fill, stamp, grayOut, collapse)
  src/scroll/engine.ts    # scroll -> step + progress: ScrollTrigger observer and playhead
  src/scroll/share.ts     # share links: the ¶ on each <Step>, #<step id> opens it settled
  src/print/              # PrintBuilder (stills + Paged.js), still.ts (DOM/canvas copies), paged.css (raw)
  src/layouts/            # MemoLayout.astro
  src/pages/index.astro   # text column left, pinned figure right (top 45% on phones)
  src/pages/print.astro   # the print version: same text, paginated, figures as stills
  src/styles/memo.css     # the look: off-white page, book serif, small caps
  src/styles/print.css
  data/                   # frozen snapshots, *.meta.json, manifest.json (asOf), sources/ text
  data/explainer/         # the map beyond North Berkeley: SF zones, BART, Beverly Hills, plans, hazards, landmarks, rent control
  scripts/                # snapshot.ts, snapshot-rockridge.ts, snapshot-explainer.ts (refresh data), propose-exhibits.ts
  EXHIBITS.md             # generated exhibit candidates (Matthew chooses)
  test/                   # Vitest: memo/script contract, figures, data checks
```

**Rules.**

1. Every legal number shown anywhere comes from `packages/law/sb79.json`. No
   hand-typed heights, densities, FARs, percentages, thresholds, or dates in
   prose, components, or figure code. Site facts (lot area, distances, local
   height) come from the dated snapshots in `data/`.
2. Every paragraph in `memo.mdx` maps to exactly one figure state in
   `src/script.ts`. Each paragraph is one `<Step id="...">`; ids are unique and
   appear in the same order in both files. `Step.astro` fails the build on an
   unknown id, and `test/script.test.ts` checks the pairing in both directions.
3. All animation is scroll-linked and reversible. Figures expose
   `setState(id, progress)` with progress 0..1 derived from scroll position;
   nothing fires once on a timer. Scrolling up plays every state in reverse.
   Under `prefers-reduced-motion`, states crossfade instead of moving.

Also from the spec's guardrails: keep the standing line under the header
("For general information only. Not legal advice. Facts and law as of
[date]."), followed by the line saying AI was used and may make mistakes, and
end with the boxed not-legal-advice disclaimer (Matthew's calls;
`test/memo.test.ts` checks all three); show each open issue as a boxed "Open
issue" note where it bites, and flag anything that reads as advice on a
specific project.

**Figures (Phase 3; map rebuilt 2026-10-17).** The map is one continuous
zoom from California to a parcel: every layer, the counties included, is drawn
in one frame (feet, EPSG:2227, relative to Exhibit B), and a state moves the
camera between the stops in `MapData.views` with `smoothZoom` (van Wijk, as
d3.interpolateZoom). Map text is drawn at screen size through a scale
transform: browsers cap very large font sizes, and at California's scale a
12 px label is tens of thousands of frame units. `figure-data.ts` builds
everything the figures draw at build time: d3-geo path strings in that frame,
engine geometry (plates via `stackFloorPlates`, the measuring line via
`nearestPointOnPolygon`), and every label, formatted from memo-data. Figure
components only place those labels; `test/figures.test.ts` fails on a digit in
rendered JSX text. `views.ts` maps each script state and progress (0..1) to
what a figure shows; the test checks every script state is implemented.
Drawing choices that are not law (story height, setback depth, spacing) live
in `memoConfig.figures` and are never shown as numbers. `FigureStage` routes a
step to its figure: `window.sb79Figures.setStep(id, progress)` (no scroll),
`window.sb79Figures.scrollTo(id, progress)` (scrolls there), or an
`sb79:step` event. In `pnpm dev`, a panel lists every state and scrolls to it
settled (keys `[` and `]`), and `?step=<id>&p=<0..1>` opens one. 3D labels are HTML projected from
the camera (no drei `Html`: its nested roots break on unmount).

**Motion and scroll (Phase 4).** Each state is a GSAP timeline of grammar
verbs (`motion.ts`): draw 0.8 s, rise 1.2 s, and stamp 0.3 s as the spec times
them; fill 1.2 s, grayOut 0.6 s, and collapse 0.8 s are chosen here; `show`
and `move` are neutral (no legal meaning). A state begins from the previous
same-figure state's settled view (`after(...)` in `views.ts`), and
`test/figures.test.ts` checks every such boundary, plus that views seek the
same forward, backward, and at random. The engine maps each step's scroll
span (top of one `<Step>` to the top of the next, at a focus line 55% down,
72% on phones) to one clock; the motion finishes at 65% of the span and holds.
A playhead follows the clock at natural speed (never more than 1 s behind),
so timings are literal for a brisk reader and slower for a slow one.
Different figures, captions, and 3D scenes crossfade or dissolve as a step
begins. Under prefers-reduced-motion, steps show settled and crossfade from a
snapshot. Performance rules: keep materials always `transparent` (toggling it
recompiles shaders), keep the hidden `Warmup` in `EnvelopeFigure` so shader
programs are never freed mid-scroll, and keep the caption a fixed height so
the canvas never resizes.

**Print and share links (Phase 5).** The calculator Phase 5 built was
dropped on 2026-10-16 (Matthew). On phones the pinned figure fades out once
the closing disclaimer reaches it, so the disclaimer and notes get the whole
screen (`is-end`, set in `index.astro`). The main page is for the screen;
`/print/` is the paper version: it renders the four figures off screen at
`PRINT_SIZE`, copies each state settled as a still beside its paragraph,
inlines footnotes (numbered in document order; Paged.js's own marker counter
does not reset per note), keeps headings with their paragraph, and paginates with
Paged.js. Ctrl/Cmd+P on the main page goes to
`/print/?auto`; a plain browser print of the main page prints text only,
with a line pointing to the print version. Paged.js rules (`@footnote`,
`float: footnote`) live in `src/print/paged.css`, imported `?raw` so Vite's
CSS pipeline never sees them. Paged.js also applies every `@media print`
rule it is given on screen, so paper-only rules (hiding the toolbar) go in
`PAPER_ONLY` in `PrintBuilder.tsx`, added as a `media="print"` style after it
runs, never in a stylesheet; and `cssMinify: 'esbuild'` in
`astro.config.mjs` stays: lightningcss rewrites media queries to range
syntax, which Paged.js's parser rejects. Each `<Step>` has a ¶ link: clicking
it copies `…#<step id>`, and opening that URL scrolls to the paragraph with
its figure settled and its first line in view.

**Data conventions.** `data/` is frozen: refresh only with
`pnpm --filter @zoning-envelope/sb79-memo snapshot` (needs network and
`pdftotext`), then `propose-exhibits`. Every layer has a `.meta.json` with
its source, query, and dates; `data/manifest.json` `asOf` is the header
date. Owner names are never stored. Curated files
(`urban-transit-counties.json`, `berkeley-zoning-standards.json`) quote
`data/sources/*.txt`, and `test/data.test.ts` checks the quotes.
`data/explainer/` has its own manifest (`snapshot-explainer`): layers from
hosts this environment reached, and documents copied from research downloads
where it could not (their meta says so). Its curated files
(`alternative-plans.json`, `hazards.json`, `landmarks.json`,
`rent-control.json`, `law-firm-memos.json`) record queries run with a fetch
tool on 2026-10-17, because scripts here could not reach CAL FIRE, the
Alameda County ALUC, or Berkeley's GIS; re-run them when those hosts are open.

**Decisions so far (Matthew).** Law stored with both versions keyed by date;
urban transit counties per HCD's seven, with Orange as an open issue;
population badge uses MTC's ACS figure. North Berkeley stays the running example;
5727 College Ave, Oakland (the Rockridge Trader Joe's) is a contrast exhibit in
the density-bonus section (`density-bonus-contrast`): SB 79 requires the city to allow at least
75 ft there, Oakland already allows 95 ft, and the pending application seeks
about 306 ft under the Density Bonus Law. The explainer takes no position on that
application. Its data is in `data/rockridge/`. On 2026-10-16 Matthew dropped the
calculator and moved the memo to the explainer format; a city-by-city
implementation tracker is deferred. On 2026-10-17 he set the map storyboard:
open on California, zoom through the cities that replaced the defaults (gray
them; only plans HCD has ruled on are mapped) to San Francisco, then Berkeley,
the station, and each map-shaped requirement, then pick the lot for the render.
The rent-control layer is an estimate (more than two units, built by 1980),
labeled as one.

**Writing memo.mdx.** Order: an introduction (no heading), Key Points
(bullets), question headings that follow the zoom ("Where does SB 79 apply?",
"Can a city change the defaults?", "Where does SB 79 apply in Berkeley?",
"What must the city allow?", ...), Key Takeaways (bullets), then the
`foot-disclaimer` box. State the rule first, then show it on the map or the
example lot. Cite the statute; cite the Coblentz and Holland & Knight summaries
(`explainer.sources`) where they add a practitioner's reading, never for a
legal value. The standards table
(`StandardsTable.astro`, both tiers and every band, the exhibits' rows marked)
sits in the height paragraph. Every number is an MDX expression over `memo-data`
(digits and number words both); `test/memo.test.ts` fails on hand-typed ones.
Cites go in GFM footnotes (`[^key]`) whose definitions render `<Law of={leaf} />`
or `<Source source={...} />`; never type a cite by hand. Open issues use
`<OpenIssue title>` inside the paragraph's `<Step>`.

**Phase status.** Phases 0–5 done and approved; the explainer format
(merged 2026-10-17) and the map-zoom storyboard (2026-10-17) await Matthew's
review of the prose. Exhibits are set in
`src/memo.config.ts`: A 1504 Francisco St (second-ranked, chosen over the
top-ranked triplex), B 1510 Virginia St and C 1450 Acton Crescent
(top-ranked). The closing not-legal-advice disclaimer, which says AI was
used and may make mistakes, carries over from the dropped calculator
(Matthew's call in Phase 5).
