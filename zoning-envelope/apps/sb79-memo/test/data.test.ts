import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { law } from '@zoning-envelope/law';
import { pointDistanceFt } from '../scripts/lib/geo.ts';

const DATA = new URL('../data/', import.meta.url);
const read = <T = any>(name: string): T => JSON.parse(readFileSync(new URL(name, DATA), 'utf8'));
const text = (name: string) => readFileSync(new URL(name, DATA), 'utf8').replace(/\s+/g, ' ');

const manifest = read('manifest.json');
const accessPoints = read('tod-access-points.geojson').features;
const zones = read('tod-zones.geojson').features;
const parcels = read('parcels.geojson').features;

describe('manifest', () => {
  it('dates the snapshot and lists only files that exist', () => {
    expect(manifest.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const f of manifest.files) expect(existsSync(new URL(f.file, DATA)), f.file).toBe(true);
  });
  it('gives every GeoJSON layer a meta file with its source and retrieval time', () => {
    for (const f of manifest.files.filter((x: { file: string }) => x.file.endsWith('.geojson'))) {
      const meta = read(f.file.replace('.geojson', '.meta.json'));
      expect(meta.source).toMatch(/^https:\/\//);
      expect(meta.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('MTC SB 79 map', () => {
  const nb = accessPoints.filter((f: any) => f.properties.station_id === manifest.center.stationId);
  it('has North Berkeley with three access points, one an elevator', () => {
    expect(nb).toHaveLength(3);
    expect(nb.filter((f: any) => f.properties.isElevator).map((f: any) => f.properties.access_id)).toEqual(['NBRK_2']);
    expect(nb.every((f: any) => f.properties.ranked_tod_tier === 'Tier 1')).toBe(true);
  });

  it('has the three Tier 1 zones around the station', () => {
    expect(zones.map((f: any) => f.properties.zone_label).sort()).toEqual(['Tier 1 - 200ft', 'Tier 1 - Half Mile', 'Tier 1 - Quarter Mile']);
  });

  it("agrees with our projection: the 200 ft zone's edge is 200 ft from the nearest access point", () => {
    const zone = zones.find((f: any) => f.properties.zone_label === 'Tier 1 - 200ft');
    const ring: number[][] = zone.geometry.type === 'Polygon' ? zone.geometry.coordinates[0] : zone.geometry.coordinates[0][0];
    const adjacentFt = law.definitions.adjacentWithin.value;
    for (const v of ring) {
      const d = Math.min(...nb.map((f: any) => pointDistanceFt(v, f.geometry.coordinates)));
      expect(Math.abs(d - adjacentFt)).toBeLessThan(2); // MTC buffered in EPSG:26910 with a segmented circle
    }
  });
});

describe('parcels', () => {
  it('covers the 3,000 ft radius and joins every parcel to the city layer', () => {
    expect(parcels.length).toBeGreaterThan(4000);
    expect(read('parcels.meta.json').joinedByApn).toBe(`${parcels.length} of ${parcels.length}`);
  });
  it('flags the BART station parcels and stores no owner names', () => {
    const bart = parcels.filter((f: any) => f.properties.ownerClass === 'BART').map((f: any) => f.properties.apn);
    expect(bart).toEqual(expect.arrayContaining(['58-2146-16-5', '58-2147-18-5', '58-2148-17-4', '58-2149-19-4']));
    expect(JSON.stringify(parcels[0].properties)).not.toMatch(/owner(s)?name/i);
  });
});

describe('curated, quoted data', () => {
  it('urban transit counties come from HCD, with Orange as an open issue from ABAG', () => {
    const utc = read('urban-transit-counties.json');
    expect(utc.counties).toContain('Alameda');
    expect(text(utc.source.file)).toContain(utc.source.quote);
    for (const c of utc.counties) expect(utc.source.quote).toContain(c);
    expect(text(utc.openIssue.source.file)).toContain(utc.openIssue.source.quote);
  });

  it("every district in the snapshot has a quoted local height limit and a statutory class", () => {
    const std = read('berkeley-zoning-standards.json');
    const source = text(std.source.file);
    const districts = new Set(read('zoning.geojson').features.map((f: any) => f.properties.district));
    for (const d of districts) {
      const s = std.districts[d as string];
      expect(s, `${d} missing from berkeley-zoning-standards.json`).toBeDefined();
      expect(source).toContain(s.quote);
      expect(s.quote).toContain(d);
      expect(s.quote).toContain(`${s.heightFt}’`);
      expect(['residential', 'mixed', 'commercial', 'other']).toContain(s.class);
    }
  });

  it('population: Berkeley clears the outer-band threshold in sb79.json under both counts', () => {
    const pop = read('population.json');
    expect(pop.shown).toBe('mtcAcs');
    expect(pop.mtcAcs.value).toBeGreaterThanOrEqual(law.eligibility.outerBandMinCityPopulation.tier1.value);
    expect(pop.census2020.value).toBeGreaterThanOrEqual(law.eligibility.outerBandMinCityPopulation.tier1.value);
  });
});

describe('exhibit candidates', () => {
  const ex = read('exhibit-candidates.json');
  const expected = { A: 'adjacent', B: 'quarterMile', C: 'halfMile' } as const;
  const mtcLabel = { adjacent: '200ft', quarterMile: 'Quarter Mile', halfMile: 'Half Mile' } as const;

  it.each(Object.entries(expected))('Exhibit %s candidates sit in the %s band, by our measure and by MTC zones', (key, band) => {
    expect(ex[key].length).toBeGreaterThan(0);
    for (const c of ex[key]) {
      expect(c.band).toBe(band);
      expect(c.nearestAccessPoint.station).toBe(manifest.center.stationId);
      expect(c.mtcZonesTouched).toContain(`Tier 1 - ${mtcLabel[band as keyof typeof mtcLabel]}`);
      expect(['residential', 'mixed-use', 'commercial']).toContain(c.zoningClass);
      expect(c.sb79).not.toBeNull();
    }
  });

  it('proposes no publicly owned parcels', () => {
    const owner = new Map(parcels.map((f: any) => [f.properties.apn, f.properties.ownerClass]));
    for (const key of ['A', 'B', 'C']) for (const c of ex[key]) expect(owner.get(c.apn)).toBe('private');
  });
});
