# data/

Frozen snapshots for the memo. Never edit by hand: re-run
`pnpm --filter @zoning-envelope/sb79-memo snapshot` (needs network access and
`pdftotext`). `manifest.json` lists every file with its source and the
source's own last-edit date; its `asOf` is the memo's data date.

| File | Source |
| --- | --- |
| `tod-stations`, `tod-stops`, `tod-access-points`, `tod-zones` | MTC SB 79 map feature services (presumed valid, Gov. Code § 65912.160(f)) |
| `parcels` | Alameda County assessor parcels, joined by APN to Berkeley's parcel layer; owner names reduced to `ownerClass` |
| `use-codes.json` | Alameda County assessor use-code names |
| `zoning` | City of Berkeley zoning districts, clipped to 3,000 ft |
| `footprints` | City of Berkeley building outlines |
| `counties` | California State Geoportal county boundaries (simplified) |
| `opportunity-areas` | 2026 CTCAC/HCD Opportunity Map (official GeoPackage) |
| `population.json` | MTC (ACS 2019–23, shown) and 2020 Census |
| `sources/*.txt` | Text of the HCD advisory, ABAG summary, and Berkeley staff report PDFs |

Two files are curated, not fetched, and every value in them is quoted from a
file in `sources/` (tests check the quotes):

- `urban-transit-counties.json`: HCD's seven counties; Orange as an open issue.
- `berkeley-zoning-standards.json`: each district's statutory class and local
  height limit, from the city's April 15, 2026 staff report, with BMC tables.
