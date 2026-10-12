# zoning-envelope

A pnpm monorepo for zoning-envelope tools. The build spec for the SB 79 memo is
`../SB79_SPEC.md`; read it in full before starting any phase.

## Layout

```
zoning-envelope/
  apps/web/              # reserved: the zoning envelope tool (not in this repo yet)
  apps/sb79-memo/        # SB 79 animated memo (Astro + MDX + React islands)
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

## apps/sb79-memo — SB 79 animated memo

**Goal.** A law-firm memo about one real North Berkeley BART site. Every
paragraph plays a figure state beside it as the reader scrolls: a pale ghost
envelope (local zoning) and a solid envelope rising to what SB 79 requires the
city to allow. A what-if calculator after the conclusion runs on the same law
data. The standards are floors on the city's limits, not caps on the project:
write "the city must allow at least", never "the project may build up to".

**Stack.**

| Layer | Choice | Status |
| --- | --- | --- |
| Site | Astro 7 + `@astrojs/mdx` + `@astrojs/react` (React 19 islands) | Phase 0 |
| Law | `packages/law/sb79.json` + zod schema + `evaluateSite` | Phase 1 |
| 2D figures | D3 + SVG | Phase 3 |
| 3D figure | react-three-fiber + drei, geometry from `packages/engine` | Phase 3 |
| Scroll | Scrollama-style observer + GSAP ScrollTrigger | Phase 4 |
| Tests | Vitest | Phase 0 on |

**Folder map.**

```
apps/sb79-memo/
  astro.config.mjs        # MDX + React integrations
  src/content/memo.mdx    # the memo text, one <Step id> per paragraph
  src/script.ts           # paragraph id -> figure + state (the memo script table)
  src/memo.config.ts      # letterhead config (FROM stays configurable) and exhibit APNs
  src/memo-data.ts        # every number the memo shows, from @zoning-envelope/law and data/
  src/format.ts           # number, date, and address formatting (no legal values)
  src/components/         # Step, Letterhead, Law (statute cites), Source, OpenIssue
  src/figures/            # React islands: MapFigure, EnvelopeFigure, Checklist, Timeline
  src/layouts/            # MemoLayout.astro
  src/pages/index.astro   # text column left, pinned figure right (top 45% on phones)
  src/styles/memo.css     # memo look: off-white page, book serif, small caps
  data/                   # frozen snapshots, *.meta.json, manifest.json (asOf), sources/ text
  scripts/                # snapshot.ts, snapshot-rockridge.ts (refresh data), propose-exhibits.ts
  EXHIBITS.md             # generated exhibit candidates (Matthew chooses)
  test/                   # Vitest: memo/script contract, later calculator and data checks
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

Also from the spec's guardrails: keep the standing line under the letterhead
("For general information only. Not legal advice. Facts and law as of
[date]."), show each open issue as a boxed "Open issue" note where it bites,
and flag anything that reads as advice on a specific project.

**Data conventions.** `data/` is frozen: refresh only with
`pnpm --filter @zoning-envelope/sb79-memo snapshot` (needs network and
`pdftotext`), then `propose-exhibits`. Every layer has a `.meta.json` with
its source, query, and dates; `data/manifest.json` `asOf` is the letterhead
date. Owner names are never stored. Curated files
(`urban-transit-counties.json`, `berkeley-zoning-standards.json`) quote
`data/sources/*.txt`, and `test/data.test.ts` checks the quotes.

**Decisions so far (Matthew).** Law stored with both versions keyed by date;
urban transit counties per HCD's seven, with Orange as an open issue;
population badge uses MTC's ACS figure. North Berkeley stays the memo's site;
5727 College Ave, Oakland (the Rockridge Trader Joe's) is a contrast exhibit in
III.D (`density-bonus-contrast`): SB 79 requires the city to allow at least
75 ft there, Oakland already allows 95 ft, and the pending application seeks
about 306 ft under the Density Bonus Law. The memo takes no position on that
application. Its data is in `data/rockridge/`.

**Writing memo.mdx.** Every number is an MDX expression over `memo-data`
(digits and number words both); `test/memo.test.ts` fails on hand-typed ones.
Cites go in GFM footnotes (`[^key]`) whose definitions render `<Law of={leaf} />`
or `<Source source={...} />`; never type a cite by hand. Open issues use
`<OpenIssue title>` inside the paragraph's `<Step>`.

**Phase status.** Phases 0 and 1 done. Exhibits are set in `src/memo.config.ts`:
A 1504 Francisco St (second-ranked, chosen over the top-ranked triplex),
B 1510 Virginia St and C 1450 Acton Crescent (top-ranked). Phase 2: the memo prose is drafted and awaits Matthew's
edit and approval; Phase 3 (static figures) is next after that.
