# SB 79 Animated Memo — Claude Code Build Spec

As of October 9, 2026 · Matthew Huguet

## Concept

The piece reads like a law-firm memo, but every argument it makes plays out on a figure beside it. The reader scrolls through Question Presented, Short Answer, and Discussion, and the figures pin in place and change as each paragraph lands.

It follows the statute's own logic, as a lawyer would brief it: does SB 79 reach this site, what does it allow, what must the project give in return, how does it stack with other laws, how is it approved, and how can a city change it.

How it differs from the zoning envelope tool:

| | Zoning envelope tool | SB 79 memo |
| --- | --- | --- |
| Question | What does local zoning forbid on any parcel? | How does one state law work, shown on one real site? |
| Motion | Subtractive: the block is carved down | Additive: the local ceiling lifts to the state floor |
| Form | App: pick, watch, explore | Document: read top to bottom, figures follow |
| Scope | Any SF parcel | One canonical site, plus a calculator at the end |
| Voice | Neutral tool UI | Memo: headings, numbered paragraphs, footnoted cites |

The central visual idea is the contrast between two envelopes. A pale ghost shows what local zoning allows today. A solid envelope rises out of it to what SB 79 requires the city to allow. The gap between them is the law.

## The example site: North Berkeley BART

North Berkeley BART is the right stage because SB 79 applies there exactly as written. Berkeley took no deferrals or exclusions, so the state defaults govern in full, and the surrounding blocks are low-rise, so the jump is dramatic.

- **Tier 1 stop.** BART is heavy rail, which makes every Berkeley BART station Tier 1. Berkeley has three: Ashby, Downtown Berkeley, and North Berkeley.
- **Big city, so the half-mile band counts.** Berkeley's 2020 population was 122,580, well over the 35,000 threshold that activates the quarter-to-half-mile standards.
- **Low local baseline.** Berkeley's planning staff reported in April 2026 that most districts around North Berkeley BART allow 35 feet, so the ghost envelope is short and the rise to 65 to 95 feet reads instantly.
- **No local opt-outs.** Per California YIMBY's one-month review (August 2026), Berkeley adopted no deferrals or exclusions.
- **A known case study.** The residential block between Eola and Sacramento Streets beside the station has been used to illustrate SB 79's effect, which gives the memo a recognizable anchor.

Use three real parcels, one per distance band, so the memo can compare them as exhibits:

| Exhibit | Band | Default standards | Role in the memo |
| --- | --- | --- | --- |
| A | Within 200 ft of a pedestrian access point | 95 ft, 160 du/ac, 4.5 FAR | Shows the labor trigger above 85 ft |
| B (canonical) | Within 1/4 mile | 75 ft, 120 du/ac, 3.5 FAR | The site the memo is written about |
| C | 1/4 to 1/2 mile | 65 ft, 100 du/ac, 3.0 FAR | Shows the step-down with distance |

Claude Code picks the actual parcels in Phase 1 from Alameda County parcel data and MTC's TOD zone map, and Matthew confirms them. Each must be zoned residential, mixed-use, or commercial, and Exhibit B should be an ordinary lot on a residential block.

Why not San Francisco: SF adopted an alternative plan in May 2026, and the city says no SF parcel is subject to SB 79's default provisions. That makes SF a good closing contrast in the memo, not the main example.

## The law as source of truth

SB 79 is codified at Government Code §§ 65912.155–65912.162, signed October 10, 2025, effective in cities July 1, 2026. These tables become one JSON file in the repo, and every number the memo or calculator shows must come from it.

One framing point the whole piece must get right: the standards are floors on the city's limits, not caps on the project. A city may not impose a height limit, density limit, or residential FAR limit below these numbers (§ 65912.157(a)(3)–(6)). The figure language should say "the city must allow at least," never "the project may build up to."

**Development standards** (§ 65912.157). Distance is measured in a straight line from the nearest edge of the parcel to a pedestrian access point of the stop (§ 65912.157(b)). The 1/4–1/2 mile row applies only in cities of at least 35,000 people.

| Band | Tier 1 (heavy rail, very high frequency commuter rail) | Tier 2 (light rail, high frequency commuter rail, BRT) |
| --- | --- | --- |
| Within 200 ft of an access point | 95 ft · 160 du/ac · 4.5 FAR | 85 ft · 140 du/ac · 4.0 FAR |
| Within 1/4 mile | 75 ft · 120 du/ac · 3.5 FAR | 65 ft · 100 du/ac · 3.0 FAR |
| 1/4 to 1/2 mile | 65 ft · 100 du/ac · 3.0 FAR | 55 ft · 80 du/ac · 2.5 FAR |

FAR here is residential FAR only, counted in net habitable square feet (§ 65912.156(i), (l)).

**Conditions the project must meet** (§ 65912.157 unless noted):

| Condition | Requirement | Cite |
| --- | --- | --- |
| Use | A housing development project; no transient lodging | § 65912.156(g) |
| Size | At least 5 units | (a)(1) |
| Minimum density | Greater of 30 du/ac or local minimum | (a)(1) |
| Unit size | Average at most 1,750 net habitable sq ft | (a)(2) |
| Site zoning | Zoned residential, mixed-use, or commercial | (a) |
| Affordability (11+ units) | 7% extremely low, 10% very low, or 13% lower income; a stricter local inclusionary rule wins | (i)(1)–(2) |
| Anti-displacement | No site with 3+ rent-controlled units occupied by tenants in the past 7 years; SB 330 replacement rules apply | (f)–(h) |
| Labor | Prevailing wage and skilled workforce above 85 ft | (k) |
| Safety | Airport, military, and fire standards | (j) |

**Stacking with the State Density Bonus Law** (§ 65915). SB 79 density becomes the base for the bonus. The city need not grant extra height beyond SB 79, except for 100% affordable projects. Projects that hit these densities can earn up to three more concessions, depending on affordability depth:

| Band | Density needed for extra concessions |
| --- | --- |
| Tier 1, within 1/4 mile | 90 du/ac |
| Tier 1, 1/4–1/2 mile; Tier 2, within 1/4 mile | 75 du/ac |
| Tier 2, 1/4–1/2 mile | 60 du/ac |

**Approval.** SB 79 creates no ministerial path of its own and does not amend CEQA. Qualifying projects may opt into SB 35/SB 423 streamlining. A compliant project is deemed consistent with local plans under the Housing Accountability Act (§ 65912.157(l)). From January 1, 2027, denial of a compliant project in a high-resource area is presumed unlawful, with penalties of $10,000 per unit (§ 65912.157(m)).

**City options**, each requiring HCD review (§§ 65912.160–.161): exempt sites with no walking path under one mile or large industrial job hubs; exclude certain sites until one year after the 7th-cycle housing element; or adopt an alternative plan that keeps total capacity, cutting no site or TOD zone by more than 50%.

## How the law decides

Section III.A of the memo walks this chain in order. Implement `evaluateSite` as exactly this sequence so the calculator's reasons match the memo's. Failing any test sends the parcel to "Local rules govern; SB 79's floors do not apply."

1. **In an urban transit county?** County has more than 15 passenger rail stations. No → local rules.
2. **Within 1/2 mile of a TOD stop?** Straight line from the parcel's nearest edge to a pedestrian access point. No → local rules.
3. **If 1/4 to 1/2 mile out: city of 35,000+?** Inside 1/4 mile, this test is skipped. No → local rules.
4. **Zoned residential, mixed-use, or commercial?** Open space and industrial sites do not qualify. No → local rules.
5. **City exemption, exclusion, or alternative plan covering the site?** HCD-reviewed local changes replace the defaults. Yes → local rules (or the alternative plan).
6. **Project meets SB 79's conditions?** 5+ units, minimum density, unit size, affordability, anti-displacement, labor, safety. No → local rules.
7. **All passed → the city must allow at least the SB 79 floors.** Tier and distance band pick the row of the standards table.

## Memo script

The memo is the spine; each paragraph owns exactly one figure state, and scrolling into the paragraph plays that state. Write the prose first, in memo voice, then wire figures to it. This table is the contract between text and animation.

Letterhead: MEMORANDUM · TO: The reader · FROM: (configurable) · DATE · RE: What SB 79 allows at [Exhibit B address], North Berkeley.

| Memo section | Point the paragraph makes | Figure state | Cite |
| --- | --- | --- | --- |
| I. Question Presented | What may be built here after July 1, 2026? | Aerial of the block; site outlined; pale ghost envelope at the local 35 ft | — |
| II. Short Answer | The city must allow at least 75 ft, 120 du/ac, 3.5 FAR, if the project meets SB 79's conditions | Preview: envelope rises to 75 ft, then resets | § 65912.157 |
| III.A.1 Urban transit county | Alameda has more than 15 rail stations | California counties; the eight qualifying counties fill in; Alameda pulses | § 65912.156(q) |
| III.A.2 Stop and tier | BART is heavy rail, so the stop is Tier 1 | Station, tracks, "Tier 1" tag | § 65912.156(d), (n) |
| III.A.3 Distance | Straight line from the parcel's nearest edge to an access point | Access points appear; rings draw at 200 ft, 1/4 mi, 1/2 mi; a measuring line snaps from parcel edge to nearest point | § 65912.157(b) |
| III.A.4 City size | Berkeley exceeds 35,000, so the outer band counts | Outer ring solidifies; population badge | § 65912.157 |
| III.A.5 Zoning class | Residential, mixed-use, and commercial sites qualify | Parcels tint eligible; open space and industrial gray out | § 65912.157(a) |
| III.A.6 Local opt-outs | Berkeley took none | "No exclusions" stamp on the city | §§ 65912.160–.161 |
| III.B.1 Height | Local limit 35 ft; state floor 75 ft | Ghost stays; solid envelope rises to 75 ft with a dimension line | (a)(3)–(6) |
| III.B.2 Density | 120 du/ac times lot area gives the unit floor | Unit dots fill the envelope; counter shows the number | same |
| III.B.3 Residential FAR | 3.5 times lot area in net habitable sq ft | Floor plates stack until the FAR total is reached | § 65912.156(l) |
| III.B.4 Local rules that remain | Local standards apply only if they do not prevent the SB 79 numbers | A setback starts to cut, stops, and turns gray: "cannot preclude" | (a), (l) |
| III.C Conditions | Five-plus units, unit size, affordability, anti-displacement | Checklist cards tick; affordable units tint | (a), (i), (h) |
| III.C counterfactual | One failed condition loses everything | Toggle "rent-controlled tenants in the last 7 years": envelope collapses back to the ghost | (h) |
| III.D Density bonus | SB 79 density is the base; no extra height is owed | Unit count grows inside a locked height line | § 65915 |
| III.E Approval | HAA protection; optional SB 35/423; 2027 presumption | Small timeline with branches and the January 1, 2027 marker | (l), (m) |
| III.F How cities change it | Exempt, exclude, or replace with an alternative plan | Bay Area map: Berkeley defaults, Oakland exclusions, SF alternative plan | §§ 65912.160–.161 |
| III.G The other bands | Distance steps the standards down | Exhibits A, B, C side by side at 95, 75, 65 ft; an 85 ft line marks the labor trigger | (k) |
| IV. Conclusion | The entitlement in one sentence | Final envelope with totals; calculator opens below | — |

Footnotes carry pinpoint cites and link to the statute text. Each "Cite" cell above is the footnote for that paragraph.

## Figures and animation

Four figures carry the whole memo, and every animation is tied to scroll position, so scrolling back up plays it in reverse. Nothing fires once and is gone; the reader controls the pace the way they would flip back through a brief.

**The four figures:**

1. **Map figure (2D).** Block-scale map: parcels, the station, access points, distance rings, eligibility tint. Also handles the zoomed-out California and Bay Area maps. Drawn in SVG with D3 so styling matches the memo exactly.
2. **Envelope figure (3D).** The site and its neighbors in a quiet three-quarter view: the ghost (local zoning), the SB 79 envelope, floor plates, unit dots, the 85 ft labor line, and the three-exhibit comparison.
3. **Checklist figure.** The project conditions as cards that tick, fail, or turn gray, plus the affordability split.
4. **Timeline figure.** The approval path with its SB 35/423 branch and the January 1, 2027 marker.

**Motion grammar** (each verb means one legal idea, every time):

| Verb | Legal meaning | How it moves |
| --- | --- | --- |
| Draw | A measurement or test | Lines and rings trace on, 0.8 s |
| Rise | An entitlement granted | Envelope or plates lift from the ghost, eased, 1.2 s |
| Fill | A quantity counted | Unit dots or plates appear in sequence with a counter |
| Stamp | A legal conclusion | A small seal-like label settles onto the figure, 0.3 s |
| Gray out | Preempted or inapplicable | Color drains to the ghost tone |
| Collapse | Eligibility lost | Envelope drops back to the ghost; the one use of red |

**Look.** Memo, not dashboard. Warm off-white page, a book serif for body text, small caps for headings, numbered paragraphs, footnote superscripts that open a citation popover. Figures in ink tones: ghost in pale gray, the SB 79 envelope in one deep accent color, red only for collapse.

**Layout.** Desktop: text column on the left at about 60 characters per line; figure pinned on the right. Phone: figure pinned to the top 45% of the screen, text scrolling under it. Reduced motion: each state crossfades instead of moving.

**Scroll engine.** One scroll observer marks the active paragraph and its progress from 0 to 1. Each figure exposes `setState(id, progress)`; the script table in the previous section is literally the config that maps paragraph ids to figure states.

## The what-if calculator

After the conclusion, the memo hands the reader the controls: change the facts and watch the answer and the envelope update. It is the memo's "apply the rule" section, and it runs on the same law JSON, so it can never disagree with the prose.

**Inputs:** stop tier (1 or 2); distance to the nearest access point in feet, or a band; city population at least 35,000 (yes/no); lot area in sq ft; local height limit (optional, for the ghost); proposed units and average unit size; affordability option; "rent-controlled units occupied by tenants in the past 7 years" (yes/no); proposed height.

**Outputs:** the band; the height, density, and residential FAR the city must allow; the unit floor (du/ac x acres); the residential floor area (FAR x lot area); a pass/fail list of conditions with cites; whether the 85 ft labor rule is triggered; whether the density-bonus concession threshold is met; and a small live envelope.

Test cases with expected answers:

| Case | Inputs | Expected |
| --- | --- | --- |
| 1 | 5,000 sq ft, Tier 1, within 1/4 mi | 75 ft; 13.77 du (120 x 0.1148 ac); 17,500 sq ft residential floor area |
| 2 | Same lot, Tier 1, 1/4–1/2 mi, city 122,580 | 65 ft; 11.48 du; 15,000 sq ft |
| 3 | Same as 2, city of 30,000 | Band does not apply; SB 79 standards not available |
| 4 | 10,000 sq ft, Tier 2, within 200 ft | 85 ft; 32.14 du; 40,000 sq ft; labor rule not triggered (applies only over 85 ft) |
| 5 | Case 1 with rent-controlled tenants in past 7 years (3+ units) | Ineligible; envelope collapses to local zoning |
| 6 | Case 1 with 4 units | Ineligible: fewer than 5 units |

Show fractional unit floors as decimals with a note. How fractions round under SB 79 is an open question to settle before launch (see guardrails).

## Data, stack, and reuse

Build it as a second app in the zoning tool's monorepo. The memo is a fixed, dated document, so its data is frozen into the repo at build time rather than queried live; the as-of date on the letterhead is the data's date.

**Data (snapshot to GeoJSON in Phase 1):**

| Layer | Source | Use |
| --- | --- | --- |
| TOD stops, access points, tiers, zones | MTC's SB 79 regional map (find the feature service behind the web map) | Rings, measuring line, tier tags. HCD treats MTC's map as presumptively valid |
| Parcels | Alameda County assessor GIS | Exhibit sites, lot areas, neighbors |
| Zoning districts | City of Berkeley open data | Eligibility tint, local height for the ghost |
| Building footprints | Berkeley or OpenStreetMap | Neighbor context in 3D |
| County outlines | California open data | The urban transit county figure |

**Stack:**

| Layer | Choice | Why |
| --- | --- | --- |
| Site | Astro with MDX | The memo is prose-first; paragraphs are MDX, figures are React islands |
| Scroll | Scrollama-style observer + GSAP ScrollTrigger | Scroll-linked, reversible states |
| 2D figures | D3 + SVG | Full typographic control |
| 3D figure | react-three-fiber + drei | Same as the zoning tool |
| Law | `packages/law/sb79.json` + zod schema | One source for prose numbers, figures, and calculator |
| Tests | Vitest | Calculator cases and data checks |

**Reuse.** The zoning tool's engine already extrudes parcels, stacks floor plates, and measures volume; the memo imports it rather than rebuilding it. Writing SB 79 as a law package also sets up a later feature in the zoning tool: an "SB 79 overlay" step that lifts the carved envelope where state law applies.

```
zoning-envelope/
  apps/web/              # existing zoning tool
  apps/sb79-memo/        # Astro site
    src/content/memo.mdx # the memo text, one <Step id> per paragraph
    src/figures/         # MapFigure, EnvelopeFigure, Checklist, Timeline
    src/script.ts        # paragraph id -> figure state (the memo script table)
    data/                # frozen GeoJSON snapshots + as-of dates
  packages/engine/       # shared geometry
  packages/law/sb79.json # standards, conditions, citations
```

## Build phases and prompts

Six phases (0 to 5), one Claude Code session each. Matthew pastes each phase prompt in order; do not start a phase until the previous one's "Done when" is true.

**Phase 0 — Kickoff.** Done when the app scaffold exists and CLAUDE.md covers both apps.

```text
Read SB79_SPEC.md fully. Scaffold apps/sb79-memo as an Astro site with MDX and React islands, inside the existing monorepo, per "Data, stack, and reuse." Update CLAUDE.md with a section for this app: goal, stack, folder map, and these rules: (1) every legal number shown anywhere comes from packages/law/sb79.json; (2) every paragraph in memo.mdx maps to exactly one figure state in src/script.ts; (3) all animation is scroll-linked and reversible. Then plan Phase 1 in plan mode and wait for approval.
```

**Phase 1 — Law and data.** Done when calculator tests 1–6 pass and three exhibit parcels are proposed with evidence.

```text
Phase 1. Create packages/law/sb79.json and a zod schema encoding every table in "The law as source of truth," each value with its Government Code cite. Write a pure function evaluateSite(inputs) that follows "How the law decides" step by step, and Vitest tests for calculator cases 1-6 in SB79_SPEC.md. Then find the feature service behind MTC's SB 79 map and snapshot North Berkeley BART's stops, access points, and zones; snapshot Alameda County parcels, Berkeley zoning, and footprints within 3,000 ft of the station into apps/sb79-memo/data with as-of dates. Propose Exhibit A, B, and C parcels (one per band, zoned residential, mixed-use, or commercial, not BART-owned) with address, lot area, local zoning, local height limit, and measured distance to the nearest access point. Do not choose final parcels; I will.
```

**Phase 2 — Memo text.** Done when Matthew has edited and approved the prose.

```text
Phase 2. Draft src/content/memo.mdx following the "Memo script" table row by row: letterhead, Question Presented, Short Answer, Discussion III.A-G, Conclusion. Memo voice: declarative, short numbered paragraphs, no hedging beyond what the law requires. Wrap each paragraph in <Step id="..."> using the script ids, and put each cite in a footnote with a link to the statute. Pull every number from sb79.json and the exhibit data, never typed by hand. Leave FROM as a config value. Add a boxed "Open issue" note wherever an item from "Guardrails and open issues" bites.
```

**Phase 3 — Static figures.** Done when every figure state renders correctly from a dev panel, without animation.

```text
Phase 3. Build MapFigure (D3/SVG), EnvelopeFigure (react-three-fiber, using packages/engine), Checklist, and Timeline per "Figures and animation." Each exposes setState(id, progress). Add a dev-only panel that lists every state id from src/script.ts and jumps to it at progress 1. Match the memo look: off-white page, book serif, small caps headings, ghost gray, one accent color, red only for collapse.
```

**Phase 4 — Scroll animation.** Done when the full memo plays forward and backward smoothly on a laptop and a phone.

```text
Phase 4. Wire the scroll engine: an observer tracks the active <Step> and its 0-1 progress; GSAP ScrollTrigger drives each figure's setState. Implement the motion grammar table exactly (draw, rise, fill, stamp, gray out, collapse) with its timings. Desktop: pinned figure right. Phone: figure pinned to the top 45%. Reduced motion: crossfades only.
```

**Phase 5 — Calculator and finish.** Done when the calculator matches the tests and the memo prints cleanly.

```text
Phase 5. Build the what-if calculator after the Conclusion, using evaluateSite and a small live EnvelopeFigure. Then add a print stylesheet so the memo prints as a clean paper memo, each figure rendered at its final state beside its paragraph, footnotes at the bottom of each page. Add share links that open the memo scrolled to any section.
```

## Guardrails and open issues

A memo earns trust by naming what is unsettled. The piece should show each open issue in a boxed "Open issue" note at the paragraph where it bites, the way a careful associate would.

**Open issues to resolve or flag before launch:**

- **"Pedestrian access point" is undefined.** MTC added elevator access points at four East Bay BART stations, and the choice of access point can move a parcel between bands. Make this a visible beat in III.A.3: show the band shift when the measuring point moves.
- **Rounding the unit floor.** Decide how fractional du/ac results round under SB 79, with authority, before the calculator shows whole numbers.
- **Berkeley's inclusionary rule.** Berkeley staff say the city's inclusionary requirements exceed SB 79's and therefore govern. Pull the actual percentages from the Berkeley Municipal Code for III.C.
- **High-resource status.** The January 1, 2027 denial presumption applies only in high-resource areas. Confirm the Exhibit B site's status on the state opportunity map.
- **BART-owned land.** AB 2923 gives BART its own zoning authority on its station parcels until January 1, 2029, and SB 79 is silent on how the two interact. Keep exhibits off BART-owned parcels.
- **"Precludes" is a judgment call.** Which local standards survive because they do not prevent the SB 79 numbers is contestable; III.B.4 should present the setback example as an illustration, not a ruling.
- **Later amendments.** Check for 2026 amendments to §§ 65912.155–.162 and new HCD guidance before publishing, and date the memo accordingly.

**Guardrails:**

- Every number on screen traces to `sb79.json` or the dated data snapshot; no hand-typed figures in prose or code.
- A standing line under the letterhead: "For general information only. Not legal advice. Facts and law as of [date]."
- The memo may go out under Matthew's name as a California attorney; flag anything that reads as advice on a specific project.
- Phase 2 prose is a draft; Matthew edits it before anything ships.

## Sources

- [ABAG, Senate Bill 79 (2025) Summary, updated July 1, 2026](https://abag.ca.gov/sites/default/files/documents/2026-04/SB79-Summary-040826.pdf)
- [Perkins Coie, California Legislature passes SB 79](https://perkinscoie.com/insights/update/california-legislature-passes-senate-bill-79-paving-way-more-housing-near-urban)
- [Sheppard Mullin, SB 79: major changes to TOD in California](https://www.sheppard.com/insights/blogs/sb-79-major-changes-to-transit-oriented-development-in-california)
- [City of Berkeley Planning Commission, SB 79 and AB 893 presentation, April 15, 2026](https://berkeleyca.gov/sites/default/files/legislative-body-meeting-attachments/2026-04-15_PC_Item%2010A_SB79_AB893%20Presentation.pdf)
- [California YIMBY, SB 79 one month in, August 3, 2026](https://cayimby.org/blog/sb-79-one-month-in-taking-stock-of-california-yimbys-signature-bill/)
- [MTC, Senate Bill 79 regional map](https://mtc.ca.gov/node/4042149)
- [MTC staff summary of the draft SB 79 map (elevator access points)](https://planbayarea.org/sites/default/files/meetings/attachments/6593/9ai_26_0432_Summary_Sheet_SB_79_Maps.pdf)
- [SF Planning, SB 79 implementation bulletin](https://sfplanning.org/node/3734)
- [HCD review letter, San Francisco SB 79 ordinance and alternative plan](https://www.hcd.ca.gov/sites/default/files/docs/planning-and-community/HAU/san-francisco-sb79-in-070126.pdf)
- [Oakland Planning Commission staff report on SB 79, February 4, 2026](https://www.oaklandca.gov/files/assets/city/v/1/boards-amp-commissions/documents/pc/2.4.2026-item-1-staff-report-case-file-za26001_sb-79-amendments-pc-2.4.26.pdf)
- [Berkeley Political Review, Eola–Sacramento block case study](https://bpr.studentorg.berkeley.edu/2025/10/01/can-sb-79-cure-the-housing-crisis/)
