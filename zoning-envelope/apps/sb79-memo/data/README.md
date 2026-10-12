# data/

Frozen snapshots for the memo. Phase 1 fills this folder.

- One GeoJSON file per layer (TOD stops and access points, parcels, zoning,
  footprints, county outlines), each with a sibling `*.meta.json` recording
  the source URL, the query used, and the as-of date.
- Snapshots are never edited by hand. Re-run the snapshot script to refresh,
  and the letterhead date follows the data's as-of date.
