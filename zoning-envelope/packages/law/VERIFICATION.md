# SB79_SPEC.md checked against the statute and the live data

Checked 2026-10-12. Statute text is the Legislature's official bulk data
(`source/manifest.json`). `sb79.json` follows the statute wherever the two
differ; `SB79_SPEC.md` is unchanged.

## Law: spec claims vs. statute

| Spec claim | Statute | Pinpoint in sb79.json | Match |
| --- | --- | --- | --- |
| Codified at §§ 65912.155–65912.162; signed Oct. 10, 2025 | Ch. 4.1.5 added by Stats. 2025, ch. 512; approved 2025-10-10 | `acts.sb79` | Yes |
| Effective in cities July 1, 2026 | Statute effective 1/1/2026; § 65912.157 "shall not apply to a local agency until July 1, 2026" | § 65912.157(n) | Yes, with the (n) cite |
| Floors on height, density, residential FAR (§ 65912.157(a)(3)–(6)) | Height and density: "shall not impose any height limit less than" / "any maximum density … of less than". FAR: "shall not enforce any other local development standard … that would physically preclude achieving a residential floor area ratio of up to" | (a)(3)–(6)(A)–(C) | Partly: FAR is a "may not physically preclude" rule, not a ban on lower FAR caps |
| ¼ mile and ¼–½ mile rows, both tiers | As stated | (a)(3)–(6) | Yes |
| Within-200-ft row: Tier 1 95/160/4.5, Tier 2 85/140/4.0 | No separate row. An adjacency intensifier adds 20 ft, 40 du/ac, and 1.0 FAR to the quarter-mile standards "prior to the application of Section 65915". "Adjacent" means within 200 ft of any pedestrian access point. | § 65912.157(e); § 65912.156(a) | Numbers yes, cite no |
| ¼–½ mile band only in cities of 35,000+ | As stated; the statute does not say which population count or date applies | (a)(4), (a)(6) | Yes |
| Straight line from the parcel's nearest edge to an access point | As stated; "pedestrian access point" is undefined | (b) | Yes |
| Residential FAR in net habitable sq ft | As stated | § 65912.156(i), (l) | Yes |
| Tier 1 = heavy rail, very high frequency commuter rail (72+ trains a day) | As stated | § 65912.156(n), (r) | Yes |
| Tier 2 = light rail, high-frequency commuter rail (48+), BRT | "bus service meeting the standards of paragraph (1) of subdivision (a) of Section 21060.2 of the Public Resources Code"; "BRT" is not the statutory term | § 65912.156(o), (e) | Partly |
| Urban transit county: more than 15 passenger rail stations | As stated; no list of counties | § 65912.156(q) | Yes |
| At least 5 units; density the greater of 30 du/ac or local minimum | As stated | (a)(1) | Yes |
| Average unit size at most 1,750 net habitable sq ft | As stated | (a)(2) | Yes |
| Affordability for 11+ units: 7% ELI, 10% VLI, or 13% lower; stricter local rule wins | As stated; "shall not apply to any development of 10 units or less"; 55-year rental and 45-year ownership terms | (i)(1)(A)–(C), (i)(2) | Yes |
| Anti-displacement: no site with 3+ rent-controlled units occupied by tenants in the past 7 years | (h)(1) bars "a site containing more than two units" where the project would demolish rent- or price-controlled housing occupied by tenants within seven years. The count is units on the site, not rent-controlled units. The spec omits (h)(2) (prior demolition of more than two units, some rent-controlled, within seven years) and (h)(3) (mobilehome, RV, and special occupancy parks, added by SB 722). | (h)(1)–(3); replacement (f); local ordinances (g) | No |
| Labor standards above 85 ft | "for any building over 85 feet in height": strictly over 85 ft | (k) | Yes |
| Density bonus stacking (cited to § 65915) | SB 79 density is the base density; no extra height owed except under § 65915(d)(2)(D) (100% lower-income projects: up to three stories or 33 ft). Concession thresholds 90/75/75/60 du/ac and three, two, or one extra concessions are in § 65912.157, not § 65915; SB 79 did not amend § 65915. | (a)(3)–(6)(D); (d)(1)–(3); § 65915(d)(2)(D) | Numbers yes, cite no |
| No ministerial path | (l) "shall not require a ministerial approval process", but § 65912.159(a) makes SB 79 projects eligible for SB 35 streamlining (§ 65913.4) | (l); § 65912.159(a)–(b) | Partly |
| No CEQA change | As stated | (l) | Yes |
| Deemed consistent under the HAA | As stated | (l) | Yes |
| From 1/1/2027, denial in a high-resource area presumed unlawful; $10,000 per unit | (m) presumes a violation and cross-references § 65589.5(k)(1)(B), where the fine is "a minimum amount of ten thousand dollars ($10,000) per housing unit". High-resource = "highest resource or high resource" on the opportunity map. | (m); § 65589.5(k)(1)(B); § 65912.156(f) | Yes, but the $10,000 is a minimum and lives in § 65589.5 |
| City options: exemptions, exclusions, alternative plan (§§ 65912.160–.161) | As stated, with the details in sb79.json `cityOptions` | § 65912.160(d)–(e); § 65912.161(a)–(d) | Yes |
| (not in spec) MTC's map | "This map shall have a rebuttable presumption of validity" (statute, not HCD) | § 65912.160(f) | n/a |

## 2026 amendments (not in the spec)

| Act | Effective | Change | In sb79.json |
| --- | --- | --- | --- |
| SB 722, Stats. 2026, ch. 100 (urgency) | 2026-07-16 | Adds § 65912.157(h)(3) (park sites); wording fixes in (h) and (j) | `antiDisplacement.parkSite.from` |
| AB 2576, Stats. 2026, ch. 214 | 2027-01-01 | Rewrites § 65912.161(b)(1)(F) (historic exclusions add State Historic Resources Inventory sites); renumbers (c)(1)(A)(i)–(iv) to (c)(1)(A)–(D) and (c)(1)(B) to (c)(2). Section 1 controls: Section 1.5 depended on AB 2415, which was not enacted. | `cityOptions.exclusions.historicSites`, `cityOptions.alternativePlan.adoptOutsideHousingElement` |
| SB 1361, Stats. 2026, ch. 1027 | 2027-01-01 | Splits § 65912.157(c) into (c)(1) and a new (c)(2) barring cities from seeking transit cuts or holding up transit projects because of SB 79 density | `localStandards.*`, `localStandards.transitServiceProtections` |

The 2027 effective dates follow Cal. Const., art. IV, § 8(c)(1) (January 1
after 90 days from enactment for non-urgency statutes); a test recomputes them
from each bill's approval date.

## Data: spec vs. live sources

| Spec | Found | Handling |
| --- | --- | --- |
| Eight urban transit counties | HCD's advisory (Mar. 20, 2026, p. 9) lists seven: Alameda, Los Angeles, Sacramento, San Diego, San Francisco, San Mateo, Santa Clara. ABAG's summary adds Orange. | HCD's seven; Orange as an open issue (Matthew's decision) |
| Berkeley 2020 population 122,580 | 2020 Census: 124,321. MTC (ACS 2019–23): 120,223. | Show MTC's 120,223; keep the Census figure (Matthew's decision) |
| MTC added elevator access points at four East Bay BART stations | The live map has newer elevator access points at eight Alameda County stations, plus older ones elsewhere. North Berkeley's elevator (`NBRK_2`) puts every private parcel within 200 ft in that band. | `isElevator` derived from the access point name; exhibits report distances with and without elevators |
| Most districts near North Berkeley BART allow 35 ft | Confirmed: the April 15, 2026 staff report lists 35 ft for R-1, R-2, R-2A, R-3, R-4, and C-N; R-BMU 80 ft; C-U 48 ft; C-W 50 ft | `data/berkeley-zoning-standards.json` |
| MTC zones by straight-line distance | Confirmed (a 200 ft zone vertex measures 200.0 ft from the elevator). Zones are non-overlapping rings dissolved region-wide; North Berkeley's half-mile ring is merged with Downtown Berkeley's. | Exhibit bands are checked against the zone polygons |
| Oakland adopted exclusions (spec, III.F) | Confirmed with a carve-out: Ordinance 13875 C.M.S. (passed 2026-03-16) adopts exclusions, but § 17.86.060.A excludes "Not including sites within one-half mile of Ashby, MacArthur, and Rockridge BART stations" (council amendment of 2026-03-03). Oakland's S-8 GIS layer marks 5727 College Ave "Covered". | `apps/sb79-memo/data/rockridge/` |
| Alameda County parcels give lot area and owner | The county layer has neither; Berkeley's parcel layer (synced to the county roll) has both | Joined by APN; owner names reduced to an owner class |

## Law-firm summaries vs. the statute

The explainer cites Coblentz Patch Duffy & Bass ("Coming to a Major Transit
Stop Near You: Upzoning Under SB 79," October 1, 2025) and Holland & Knight
("Tracking SB 79 Implementation Before the Train Leaves the Station," June 16,
2026) for practitioners' readings, never for a legal value. Checked
2026-10-16 against `source/`:

| Summary says | Statute | Handling |
| --- | --- | --- |
| Coblentz: eight urban transit counties, with Orange | No list in the statute; HCD's advisory lists seven | HCD's seven; Orange stays an open issue |
| Coblentz: a site cannot have had more than two rent-controlled units in seven years | § 65912.157(h)(1) counts units on the site (more than two) where the project would demolish tenant-occupied rent-controlled housing | Statute's reading |
| Coblentz: SB 35 path at 10% very low income (rental) or 10% low income (for sale) | Right, § 65913.4(a)(4)(B)(i)(I)–(II), but (III) also lets Bay Area projects dedicate 20% below 100% AMI, averaging 80% | `streamlining.affordability` carries all three |
| Holland & Knight: temporary exclusions last until one year after the start of the seventh housing element cycle | § 65912.161(b)(1): "Prior to one year following the adoption of the seventh revision of the housing element" | Statute's wording |
| Holland & Knight: three limits on alternative plans | § 65912.161(a) has four; it omits (a)(3), no zone cut more than 50% | All four in `cityOptions.alternativePlan` |
| Holland & Knight: San Francisco pursuing exclusions and a plan; San Jose's hub exclusion approved June 4, 2026 | San Francisco's plan was approved July 1, 2026 (HCD letter, `apps/sb79-memo/data/sources/`) | The explainer maps only plans HCD has ruled on |

## Open items for Matthew

1. **Rounding.** Chapter 4.1.5 has no rounding rule for the base standards
   or the (i)(1) percentages. § 65915(f)(5) rounds density-bonus
   calculations up. `evaluateSite` reports unrounded unit floors.
2. **Affordability counting.** `evaluateSite` counts units at a deeper
   income level toward the shallower options (an ELI unit also counts as
   very low and lower income). Confirm this reading.
3. **Population.** The statute names no data source or date for the
   35,000 test.
4. **"Pedestrian access point."** Undefined in the statute; HCD's advisory
   treats any entrance, platform access point, or stop location on the MPO
   map as one. Exhibit A is within 200 ft only because of the elevator.
5. **Zoning classes.** `berkeley-zoning-standards.json` treats R-BMU as
   mixed and C-N, C-U, C-W as commercial; confirm.
6. **BMC text.** Height limits are quoted from the city's staff report; BMC
   table numbers come from a mirror because berkeley.municipal.codes blocks
   automated access. Verify against the official code before citing.
7. **Contrast site.** 5727 College Ave, Oakland is a real, pending
   application (ZW2601986). Its facts come from news and an advocacy fact
   sheet; check them against Oakland's project file, and keep the memo's
   treatment illustrative (spec guardrail on advice about specific projects).
8. **Memo date.** The spec is dated October 9, 2026; the data snapshot is
   dated 2026-10-12. The letterhead date follows the data.
