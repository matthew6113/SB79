# zoning-envelope

A pnpm monorepo for zoning-envelope tools. The build spec for the SB 79 memo is
`../SB79_SPEC.md`; read it in full before starting any phase.

## Layout

```
zoning-envelope/
  apps/web/              # reserved: the zoning envelope tool (not in this repo yet)
  apps/sb79-memo/        # SB 79 animated memo (Astro + MDX + React islands)
  packages/engine/       # shared geometry: area, extrude, floor plates, volume
  packages/law/          # sb79.json + zod schema + evaluateSite (Phase 1)
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
- The engine holds no legal numbers. Floor-to-floor height is a caller-supplied
  design assumption, never a default.

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
  src/memo.config.ts      # letterhead config (FROM stays configurable)
  src/components/         # Step.astro (paragraph wrapper), Letterhead.astro
  src/figures/            # React islands: MapFigure, EnvelopeFigure, Checklist, Timeline
  src/layouts/            # MemoLayout.astro
  src/pages/index.astro   # text column left, pinned figure right (top 45% on phones)
  src/styles/memo.css     # memo look: off-white page, book serif, small caps
  data/                   # frozen GeoJSON snapshots + as-of metadata (Phase 1)
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

**Phase status.** Phase 0 (scaffold) done. Phase 1 (law and data) is next and
needs Matthew's approval of the plan first.
