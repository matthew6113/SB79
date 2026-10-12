/** The 2026 CTCAC/HCD Opportunity Map, read from the state's official GeoPackage download. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRemoteZip, readEntry } from '@zoning-envelope/law/zip-range';
import type { Geometry } from './arcgis.ts';
import { gpkgGeometry, readGpkg } from './gpkg.ts';

export const OPPORTUNITY_MAP_URL = 'https://www.treasurer.ca.gov/sites/default/files/2025-11/shapefile.zip';

export interface OpportunityArea { fips: string; fipsBlockGroup: string | null; category: string; score: number; geometry: Geometry }

/** All opportunity areas in a county, with the download's entry name and Last-Modified date. */
export async function opportunityAreas(county: string): Promise<{ areas: OpportunityArea[]; entry: string; lastModified: string | null }> {
  const zip = await openRemoteZip(OPPORTUNITY_MAP_URL);
  const entry = [...zip.entries.keys()].find((k) => k.endsWith('.gpkg'));
  if (!entry) throw new Error('No GeoPackage in the opportunity map download');
  const dir = mkdtempSync(join(tmpdir(), 'sb79-opp-'));
  try {
    const path = join(dir, 'opp.gpkg');
    writeFileSync(path, await readEntry(zip, entry));
    const rows = readGpkg(path, `SELECT fips, fips_bg, oppcat, oppscore, geom FROM final_opp_2026_public WHERE county_name = '${county.replace(/'/g, "''")}'`);
    const areas = rows.map((r) => ({
      fips: String(r.fips), fipsBlockGroup: (r.fips_bg as string | null) ?? null, category: String(r.oppcat), score: Number(r.oppscore),
      geometry: gpkgGeometry(r.geom as Uint8Array),
    }));
    return { areas, entry, lastModified: zip.lastModified ? new Date(zip.lastModified).toISOString() : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
