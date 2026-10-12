/**
 * Propose Exhibit A, B, and C parcels (one band each) from the frozen data.
 * Writes data/exhibit-candidates.json and EXHIBITS.md. Matthew picks the
 * final parcels; nothing here is a choice.
 *
 * Run: pnpm --filter @zoning-envelope/sb79-memo propose-exhibits
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as polyclip from 'polyclip-ts';
import { evaluateSite, law, type BandId, type ZoningClass } from '@zoning-envelope/law';
import { distancePointToPolygon, pointInPolygon, polygonArea, type Point, type Polygon } from '@zoning-envelope/engine';
import type { Feature, FeatureCollection, Geometry } from './lib/arcgis.ts';
import { polygonsFt, projectFt } from './lib/geo.ts';

const DATA = new URL('../data/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as T;

const manifest = read<{ asOf: string; center: { stationId: string } }>('manifest.json');
const parcels = read<FeatureCollection>('parcels.geojson').features;
const access = read<FeatureCollection>('tod-access-points.geojson').features;
const zones = read<FeatureCollection>('tod-zones.geojson').features;
const zoning = read<FeatureCollection>('zoning.geojson').features;
const opportunity = read<FeatureCollection>('opportunity-areas.geojson').features;
const standards = read<{ districts: Record<string, { name: string; class: string; heightFt: number; bmc: string }>; source: { title: string; date: string } }>('berkeley-zoning-standards.json');
const population = read<{ mtcAcs: { value: number } }>('population.json');
const useCodes = read<{ codes: Record<string, string | null> }>('use-codes.json').codes;
const utc = read<{ counties: string[] }>('urban-transit-counties.json');

const asOf = manifest.asOf;
const RANK: Record<BandId, number> = { adjacent: 0, quarterMile: 1, halfMile: 2 };
const MTC_LABEL: Record<BandId, string> = { adjacent: '200ft', quarterMile: 'Quarter Mile', halfMile: 'Half Mile' };

/** Area-weighted centroid of the largest part, used to place a parcel in a district or tract. */
function centroid(polys: Polygon[]): Point {
  const p = polys.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
  let cx = 0, cy = 0, a2 = 0;
  const r = p.outer;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]!;
    const [x2, y2] = r[(i + 1) % r.length]!;
    const cross = x1 * y2 - x2 * y1;
    a2 += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  }
  const c: Point = [cx / (3 * a2), cy / (3 * a2)];
  return pointInPolygon(c, p) ? c : r[0]!;
}

const zoningFt = zoning.map((f) => ({ district: String(f.properties.district), polys: polygonsFt(f.geometry as Geometry) }));
const tractsFt = opportunity.map((f) => ({ fips: String(f.properties.fips), category: String(f.properties.category), polys: polygonsFt(f.geometry as Geometry) }));
const accessFt = access.map((f) => ({
  id: String(f.properties.access_id),
  name: String(f.properties.access_point_name),
  station: String(f.properties.station_id),
  tier: f.properties.ranked_tod_tier === 'Tier 1' ? (1 as const) : (2 as const),
  isElevator: f.properties.isElevator === true,
  xy: projectFt((f.geometry as { coordinates: number[] }).coordinates),
}));

const containing = <T extends { polys: Polygon[] }>(items: T[], pt: Point) => items.find((i) => i.polys.some((p) => pointInPolygon(pt, p)));

function nearest(polys: Polygon[], filter: (a: (typeof accessFt)[number]) => boolean) {
  let best: { ap: (typeof accessFt)[number]; distanceFt: number } | null = null;
  for (const ap of accessFt.filter(filter)) {
    const d = Math.min(...polys.map((p) => distancePointToPolygon(ap.xy, p)));
    if (!best || d < best.distanceFt) best = { ap, distanceFt: d };
  }
  return best;
}

const bandOf = (distanceFt: number, tier: 1 | 2): BandId | null =>
  evaluateSite({ urbanTransitCounty: true, tier, distanceFt, cityPopulation: population.mtcAcs.value, zoningClass: 'residential', localOptOut: 'none', lotAreaSqFt: 1 }, { asOf }).band;

/** MTC zone labels the parcel touches, innermost first. */
function mtcZonesTouched(geometry: Geometry): string[] {
  const parcel = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry as { coordinates: number[][][][] }).coordinates;
  return zones
    .filter((z) => {
      const zg = z.geometry as Geometry;
      const zp = zg.type === 'Polygon' ? [zg.coordinates] : (zg as { coordinates: number[][][][] }).coordinates;
      return (polyclip.intersection(parcel as never, zp as never) as unknown[]).length > 0;
    })
    .map((z) => String(z.properties.zone_label));
}

interface Candidate {
  apn: string; address: string; feature: Feature; polys: Polygon[];
  district: string | null; districtClass: string | null; localHeightFt: number | null;
  nearest: NonNullable<ReturnType<typeof nearest>>; nearestNonElevator: NonNullable<ReturnType<typeof nearest>>;
  band: BandId | null; bandWithoutElevators: BandId | null; tract: { fips: string; category: string } | null;
}

const rows: Candidate[] = parcels.flatMap((f) => {
  if (!f.geometry) return [];
  const polys = polygonsFt(f.geometry as Geometry);
  const c = centroid(polys);
  const district = containing(zoningFt, c)?.district ?? null;
  const std = district ? standards.districts[district] : undefined;
  const n = nearest(polys, () => true);
  const ne = nearest(polys, (a) => !a.isElevator);
  if (!n || !ne) return [];
  const tract = containing(tractsFt, c);
  return [{
    apn: String(f.properties.apn), address: String(f.properties.address), feature: f, polys,
    district, districtClass: std?.class ?? null, localHeightFt: std?.heightFt ?? null,
    nearest: n, nearestNonElevator: ne, band: bandOf(n.distanceFt, n.ap.tier), bandWithoutElevators: bandOf(ne.distanceFt, ne.ap.tier),
    tract: tract ? { fips: tract.fips, category: tract.category } : null,
  }];
});

const qualifying = new Set(law.eligibility.qualifyingZoning.value);
const highResource = new Set(law.definitions.highResourceArea.value.map((v) => v.toLowerCase()));
const rentControlMoreThan = law.antiDisplacement.rentControlledSite.moreThanUnits.value;
const p = (c: Candidate) => c.feature.properties as Record<string, number | string | null>;

// Exhibits are measured to North Berkeley's own entrances, so the memo's comparison stays about one station.
const eligible = rows.filter(
  (c) => c.band && c.nearest.ap.station === manifest.center.stationId && c.districtClass && qualifying.has(c.districtClass) && p(c).ownerClass === 'private' && typeof p(c).assessorLotSizeSqFt === 'number' && (p(c).assessorLotSizeSqFt as number) > 0,
);

/** Keep the best-ranked parcel on each street, so the shortlist offers different settings. */
const street = (c: Candidate) => c.address.replace(/^\d+\S*\s+/, '').replace(/\s+BERKELEY.*$/, '');
const onePerStreet = (cs: Candidate[]) => cs.filter((c, i) => cs.findIndex((o) => street(o) === street(c)) === i);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const residentialLow = (c: Candidate) => c.districtClass === 'residential' && ['R-1', 'R-2', 'R-2A'].includes(c.district ?? '');
const smallBuilding = (c: Candidate) => typeof p(c).units === 'number' && (p(c).units as number) <= rentControlMoreThan;

function describe(c: Candidate) {
  const props = p(c);
  const lot = props.assessorLotSizeSqFt as number;
  const zoningClass = (c.districtClass === 'mixed' ? 'mixed-use' : c.districtClass) as ZoningClass;
  const ev = evaluateSite(
    {
      urbanTransitCounty: utc.counties.includes('Alameda'), tier: c.nearest.ap.tier, distanceFt: c.nearest.distanceFt,
      cityPopulation: population.mtcAcs.value, zoningClass, localOptOut: 'none', lotAreaSqFt: lot,
      ...(c.localHeightFt !== null ? { localHeightLimitFt: c.localHeightFt } : {}),
      ...(c.tract ? { highResourceArea: highResource.has(c.tract.category.replace(/ Resource$/i, ' resource').toLowerCase()) } : {}),
    },
    { asOf },
  );
  const touched = mtcZonesTouched(c.feature.geometry as Geometry);
  const innermost = touched.sort((a, b) => RANK[bandFromLabel(a)] - RANK[bandFromLabel(b)])[0] ?? null;
  const flags: string[] = [];
  if (c.band !== c.bandWithoutElevators) flags.push(`Band depends on the elevator access point (${c.bandWithoutElevators ?? 'outside'} without it).`);
  if (typeof props.units === 'number' && props.units > rentControlMoreThan) flags.push(`Existing building has ${props.units} units (more than ${rentControlMoreThan}): check rent control and tenancy, § 65912.157(h)(1).`);
  const diff = Math.abs((props.gisAreaSqFt as number) - lot) / lot;
  if (diff > 0.1) flags.push(`Assessor lot size and GIS area differ by ${Math.round(diff * 100)}%.`);
  if (innermost && bandFromLabel(innermost) !== c.band) flags.push(`MTC's zones put the parcel in ${innermost}, not ${c.band}.`);
  return {
    apn: c.apn,
    address: c.address,
    lotSizeSqFt: lot,
    gisAreaSqFt: props.gisAreaSqFt,
    district: c.district,
    districtName: c.district ? standards.districts[c.district]?.name : null,
    zoningClass,
    localHeightFt: c.localHeightFt,
    useCode: props.useCode,
    use: useCodes[String(props.useCode)] ?? null,
    units: props.units, yearBuilt: props.yearBuilt, stories: props.stories,
    nearestAccessPoint: { id: c.nearest.ap.id, name: c.nearest.ap.name, isElevator: c.nearest.ap.isElevator, station: c.nearest.ap.station, distanceFt: Math.round(c.nearest.distanceFt * 10) / 10 },
    nearestNonElevatorAccessPoint: { id: c.nearestNonElevator.ap.id, distanceFt: Math.round(c.nearestNonElevator.distanceFt * 10) / 10, band: c.bandWithoutElevators },
    band: c.band,
    mtcZonesTouched: touched,
    opportunity: c.tract,
    sb79: ev.floors && {
      heightFt: ev.floors.heightFt.value, densityDuPerAcre: ev.floors.densityDuPerAcre.value, residentialFar: ev.floors.residentialFar.value,
      unitFloor: Math.round((ev.unitFloor?.value ?? 0) * 100) / 100, residentialFloorAreaSqFt: Math.round(ev.residentialFloorAreaSqFt ?? 0),
      laborTriggeredAtFloor: ev.labor?.triggered ?? null, highResourceArea: ev.denialPresumption.applies !== null ? c.tract?.category : null,
      summary: ev.summary,
    },
    flags,
  };
}

function bandFromLabel(label: string): BandId {
  const entry = (Object.entries(MTC_LABEL) as [BandId, string][]).find(([, l]) => label.endsWith(l));
  if (!entry) throw new Error(`Unknown MTC zone label ${label}`);
  return entry[0];
}

// Exhibit A: every eligible parcel within 200 ft.
const exhibitA = eligible.filter((c) => c.band === 'adjacent').sort((a, b) => a.nearest.distanceFt - b.nearest.distanceFt);

// Exhibit B: an ordinary low-rise residential lot inside 1/4 mile whose band does not depend on
// the elevator, on the Eola–Sacramento block (APN book-page 58-2151) when possible.
const bPool = eligible.filter((c) => c.band === 'quarterMile' && c.bandWithoutElevators === 'quarterMile' && residentialLow(c) && smallBuilding(c));
const eola = bPool.filter((c) => c.apn.startsWith('58-2151-'));
const bMedian = median((eola.length ? eola : bPool).map((c) => p(c).assessorLotSizeSqFt as number));
const exhibitB = (eola.length >= 3 ? eola : bPool).sort(
  (a, b) => Math.abs((p(a).assessorLotSizeSqFt as number) - bMedian) - Math.abs((p(b).assessorLotSizeSqFt as number) - bMedian),
);

// Exhibit C: an ordinary low-rise residential lot well inside the 1/4–1/2 mile band (at least
// 10% of the band's width from either edge, whichever access point is used).
const quarterFt = law.bands.quarterMile.tier1.value * 5280;
const halfFt = law.bands.halfMile.tier1.value * 5280;
const margin = (halfFt - quarterFt) * 0.1;
const cPool = eligible.filter(
  (c) => c.band === 'halfMile' && c.bandWithoutElevators === 'halfMile' && residentialLow(c) && smallBuilding(c) &&
    c.nearest.distanceFt > quarterFt + margin && c.nearestNonElevator.distanceFt < halfFt - margin,
);
const cMedian = median(cPool.map((c) => p(c).assessorLotSizeSqFt as number));
const mid = (quarterFt + halfFt) / 2;
const exhibitC = cPool.sort(
  (a, b) =>
    Math.abs((p(a).assessorLotSizeSqFt as number) - cMedian) / cMedian + Math.abs(a.nearest.distanceFt - mid) / mid -
    (Math.abs((p(b).assessorLotSizeSqFt as number) - cMedian) / cMedian + Math.abs(b.nearest.distanceFt - mid) / mid),
);

const out = {
  asOf,
  generatedFrom: 'data/*.geojson via scripts/propose-exhibits.ts',
  counts: { parcels: rows.length, eligiblePrivate: eligible.length, adjacent: exhibitA.length, quarterMilePool: bPool.length, eolaBlock: eola.length, halfMilePool: cPool.length },
  method: {
    distance: 'Straight line from the nearest edge of the parcel to the nearest MTC pedestrian access point, in EPSG:2227 feet (Gov. Code § 65912.157(b)).',
    eligibility: 'Nearest access point belongs to North Berkeley station; zoned residential, mixed, or commercial (berkeley-zoning-standards.json); privately owned (no BART, City, or other public owner); assessor lot size known. B and C keep one parcel per street.',
    A: 'Every eligible parcel within 200 ft of an access point.',
    B: `Inside 1/4 mile under both measurements (with and without elevator access points); R-1, R-2, or R-2A; no more than ${rentControlMoreThan} existing units; on the Eola–Sacramento block (APN 58-2151) when it has three or more; ranked by closeness to the median lot size.`,
    C: `In the 1/4–1/2 mile band under both measurements and at least ${Math.round(margin)} ft from either edge; R-1, R-2, or R-2A; no more than ${rentControlMoreThan} existing units; ranked by closeness to the median lot size and to the middle of the band.`,
  },
  A: exhibitA.slice(0, 5).map(describe),
  B: onePerStreet(exhibitB).slice(0, 3).map(describe),
  C: onePerStreet(exhibitC).slice(0, 3).map(describe),
};
writeFileSync(new URL('exhibit-candidates.json', DATA), JSON.stringify(out, null, 2) + '\n');

// EXHIBITS.md: a readable report generated from the same numbers.
type Row = ReturnType<typeof describe>;
const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n ?? '—'));
const table = (rs: Row[]) =>
  [
    '| APN | Address | Lot (assessor / GIS sq ft) | Zoning | Local height | Existing | Nearest access point | Without elevators | Opportunity area | SB 79 floors | Flags |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rs.map((r) =>
      `| ${r.apn} | ${r.address} | ${fmt(r.lotSizeSqFt)} / ${fmt(r.gisAreaSqFt)} | ${r.district} (${r.zoningClass}) | ${fmt(r.localHeightFt)} ft | ${fmt(r.units)} units, ${fmt(r.yearBuilt)}, ${fmt(r.stories)} st.; ${r.use ?? fmt(r.useCode)} | ` +
      `${r.nearestAccessPoint.id}${r.nearestAccessPoint.isElevator ? ' (elevator)' : ''}: ${fmt(r.nearestAccessPoint.distanceFt)} ft | ${r.nearestNonElevatorAccessPoint.id}: ${fmt(r.nearestNonElevatorAccessPoint.distanceFt)} ft (${r.nearestNonElevatorAccessPoint.band ?? 'outside'}) | ` +
      `${r.opportunity ? `${r.opportunity.category} (tract ${r.opportunity.fips})` : '—'} | ` +
      `${r.sb79 ? `${r.sb79.heightFt} ft, ${r.sb79.densityDuPerAcre} du/ac (${r.sb79.unitFloor} du), FAR ${r.sb79.residentialFar} (${fmt(r.sb79.residentialFloorAreaSqFt)} sq ft)${r.sb79.laborTriggeredAtFloor ? '; labor rule triggered at the floor' : ''}` : '—'} | ` +
      `${r.flags.join(' ') || '—'} |`,
    ),
  ].join('\n');

const md = `# Exhibit candidates (proposed, not chosen)

Generated by \`scripts/propose-exhibits.ts\` from the data snapshot as of ${asOf}. Matthew chooses the final parcels.

Every SB 79 number below comes from \`evaluateSite\` and \`sb79.json\`; site facts come from \`data/\`. Local height limits are the existing maximums in ${standards.source.title} (${standards.source.date}).

**Method.** ${out.method.distance} ${out.method.eligibility}

Of ${fmt(out.counts.parcels)} parcels within 3,000 ft of the station, ${fmt(out.counts.eligiblePrivate)} are eligible and privately owned.

## Exhibit A: within 200 ft of an access point

${out.method.A} ${fmt(out.counts.adjacent)} parcel(s) qualify.

${table(out.A)}

## Exhibit B (canonical): within 1/4 mile

${out.method.B} Pool: ${fmt(out.counts.quarterMilePool)} parcels, ${fmt(out.counts.eolaBlock)} on the Eola–Sacramento block.

${table(out.B)}

## Exhibit C: 1/4 to 1/2 mile

${out.method.C} Pool: ${fmt(out.counts.halfMilePool)} parcels.

${table(out.C)}
`;
writeFileSync(new URL('../EXHIBITS.md', DATA), md);
console.log(`A: ${out.A.length}  B: ${out.B.length}  C: ${out.C.length}  (eligible ${out.counts.eligiblePrivate} of ${out.counts.parcels})`);
