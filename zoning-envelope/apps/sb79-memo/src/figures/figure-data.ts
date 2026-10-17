/**
 * Figure data, computed at build time (src/pages/figure-data.json.ts) from
 * memo-data, the frozen snapshots in data/, and @zoning-envelope/engine.
 *
 * Rule 1 (CLAUDE.md) holds here as in the prose: every number a figure shows
 * is a label built below from @zoning-envelope/law or data/. Drawing choices
 * that are not law (story height, setback depth, spacing) come from
 * memoConfig.figures and are never shown as numbers.
 */
import { geoIdentity, geoPath, geoTransform, type GeoPermissibleObjects, type GeoStream } from 'd3-geo';
import * as polyclip from 'polyclip-ts';
import {
  distancePointToPolygon,
  nearestPointOnPolygon,
  pointInPolygon,
  polygonArea,
  stackFloorPlates,
  type Point,
  type Polygon,
} from '@zoning-envelope/engine';
import { milesToFeet, parentCite, type BandId } from '@zoning-envelope/law';
import { polygonsFt, projectFt } from '../../scripts/lib/geo.ts';
import type { Feature, FeatureCollection, Geometry } from '../../scripts/lib/arcgis.ts';
import parcelsRaw from '../../data/parcels.geojson?raw';
import footprintsRaw from '../../data/footprints.geojson?raw';
import zoningRaw from '../../data/zoning.geojson?raw';
import zonesRaw from '../../data/tod-zones.geojson?raw';
import accessRaw from '../../data/tod-access-points.geojson?raw';
import stationsRaw from '../../data/tod-stations.geojson?raw';
import railRaw from '../../data/osm-rail.geojson?raw';
import railMeta from '../../data/osm-rail.meta.json';
import countiesRaw from '../../data/counties.geojson?raw';
import jurisdictionsRaw from '../../data/jurisdictions.geojson?raw';
import opportunityRaw from '../../data/opportunity-areas.geojson?raw';
import sfZonesRaw from '../../data/explainer/sf-tod-zones.geojson?raw';
import bartStationsRaw from '../../data/explainer/bart-stations.geojson?raw';
import bartParcelsRaw from '../../data/explainer/bart-ab2923-parcels.geojson?raw';
import beverlyRaw from '../../data/explainer/beverly-hills.geojson?raw';
import rockParcelRaw from '../../data/rockridge/parcel.geojson?raw';
import zoningStandards from '../../data/berkeley-zoning-standards.json';
import manifest from '../../data/manifest.json';
import { A, B, C, L, asOf, contrast, data, derived, explainer, law, project } from '../memo-data';
import { inBand, parcelClasses } from '../parcel-classes';
import { memoConfig } from '../memo.config';
import { date, duac, far, ftShort, milesShort, money, num, pct, shortCite, shortDate, sqftShort, word } from '../format';
import type { Box, EnvelopeData, FigureData, Label, MapData, Plate, Solid, TimelineData, XY } from './types';

const cfg = memoConfig.figures;
const parse = (raw: string) => JSON.parse(raw) as FeatureCollection;
const parcels = parse(parcelsRaw).features;
const byApn = (apn: string) => {
  const f = parcels.find((p) => p.properties.apn === apn);
  if (!f?.geometry) throw new Error(`Parcel ${apn} is not in data/parcels.geojson`);
  return f;
};

// ---------------------------------------------------------------- geometry

/** The largest polygon of a (Multi)Polygon, projected to EPSG:2227 feet. */
function largest(g: Geometry): Polygon {
  return polygonsFt(g).reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
}

/** Area-weighted centroid of a ring. */
function centroid(ring: readonly Point[]): Point {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    const f = x1 * y2 - x2 * y1;
    a += f; x += (x1 + x2) * f; y += (y1 + y2) * f;
  }
  return [x / (3 * a), y / (3 * a)];
}

/** Drop a repeated closing vertex. */
const open = (ring: readonly Point[]): Point[] => {
  const f = ring[0]!, l = ring[ring.length - 1]!;
  return f[0] === l[0] && f[1] === l[1] ? ring.slice(0, -1) : [...ring];
};
const signedArea = (ring: readonly Point[]) => ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length]!;
  return s + x1 * y2 - x2 * y1;
}, 0) / 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const unit = (v: Point): Point => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };

/** Clip a ring to the half-plane dot(p - origin, dir) >= offset. */
function clipHalfPlane(ring: readonly Point[], origin: Point, dir: Point, offset: number): Point[] {
  const big = 1e4;
  const n: Point = [-dir[1], dir[0]];
  const at = (s: number, t: number): [number, number] => [origin[0] + dir[0] * s + n[0] * t, origin[1] + dir[1] * s + n[1] * t];
  const half = [[at(offset, -big), at(big, -big), at(big, big), at(offset, big), at(offset, -big)]];
  const out = polyclip.intersection([[...ring, ring[0]!].map((p) => [p[0], p[1]])] as never, half as never) as unknown as number[][][][];
  const first = out[0]?.[0];
  if (!first) throw new Error('Half-plane clip left nothing');
  return open(first.map(([x, y]) => [x!, y!] as Point));
}

// ---------------------------------------------------------------- frames

const site = largest(byApn(B.apn).geometry!);
const ORIGIN = centroid(site.outer).map(Math.round) as unknown as Point;
const [ox, oy] = ORIGIN;

/** Envelope frame: feet from Exhibit B's center, y north. */
const toLocal = (p: Point, o: Point = ORIGIN): XY => [r1(p[0] - o[0]), r1(p[1] - o[1])];

/** Map frame: the same feet, SVG axes (y south). */
const toSvg = (p: Point): XY => [Math.round(p[0] - ox), Math.round(oy - p[1])];
const svgPath = geoPath(
  geoTransform({
    point(this: { stream: GeoStream }, lon: number, lat: number) {
      const [x, y] = projectFt([lon, lat]);
      this.stream.point(x - ox, oy - y);
    },
  }),
).digits(0);
const pathOf = (features: Feature[]) => svgPath({ type: 'FeatureCollection', features } as GeoPermissibleObjects) ?? '';

const boxAround = (pts: XY[], margin: number): Box => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [x0 - margin, y0 - margin, x1 - x0 + 2 * margin, y1 - y0 + 2 * margin];
};

// ---------------------------------------------------------------- shared labels

const bandLabel: Record<BandId, string> = {
  adjacent: `within ${ftShort(L.adjacent.value)}`,
  quarterMile: `within ${milesShort(L.quarter.value)}`,
  halfMile: `${milesShort(L.quarter.value)} to ${milesShort(L.half.value)}`,
};
const reachFt = milesToFeet(L.half.value);
const quarterFt = milesToFeet(L.quarter.value);

// ---------------------------------------------------------------- map

/** Lon/lat features to rings in the map frame (feet, SVG axes). */
type Rings = number[][][];
const svgRings = (g: Geometry): Rings[] => polygonsFt(g).map((p) => [p.outer, ...(p.holes ?? [])].map((r) => r.map((q) => toSvg(q) as number[])));
const ringsPath = (polys: Rings[]) => geoPath(geoIdentity()).digits(0)({ type: 'MultiPolygon', coordinates: polys } as GeoPermissibleObjects) ?? '';
const boxOf = (polys: Rings[], margin: number) => boxAround(polys.flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as XY)), margin);
const overlaps = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const largestPiece = (polys: Rings[]) => polys.map((p) => p[0]!.map(([x, y]) => [x!, y!] as Point))
  .reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
const centerOf = (polys: Rings[]): XY => {
  const [x, y] = centroid(largestPiece(polys));
  return [Math.round(x), Math.round(y)];
};
/** A view `w` wide around a point, at the figure's usual aspect (5:4). */
const viewAround = (c: XY, w: number): Box => [c[0] - w / 2, c[1] - (w * 0.8) / 2, w, w * 0.8];

function buildMap(): MapData {
  const ex = explainer;
  const stationFt = projectFt(manifest.center.lonLat);
  const nb = toSvg(stationFt);

  // California, in the same frame as the parcels.
  const counties = parse(countiesRaw).features;
  const utc = new Set(data.counties.counties);
  const orange = data.counties.openIssue.county;
  const countyRings = new Map(counties.map((f) => [String(f.properties.name), svgRings(f.geometry!)]));
  const allCounties = [...countyRings.values()].flat();
  const caBox = boxOf(allCounties, 60000);

  // Bay Area city limits, clipped to the counties' shoreline so they read as land.
  const jurisdictions = parse(jurisdictionsRaw).features;
  const juris = (name: string) => {
    const f = jurisdictions.find((j) => j.properties.name === name);
    if (!f) throw new Error(`Jurisdiction ${name} missing`);
    return f;
  };
  const roughBay = boxOf([...svgRings(juris('Berkeley').geometry!), ...svgRings(juris('San Francisco').geometry!)], 30000);
  const land = polyclip.union(
    ...(allCounties.filter((p) => overlaps(boxOf([p], 0), roughBay)) as never[]) as [never, ...never[]],
  ) as unknown as Rings[];
  const onLand = (f: Feature): Rings[] => polyclip.intersection(svgRings(f.geometry!) as never, land as never) as unknown as Rings[];
  const sfLand = onLand(juris('San Francisco'));
  // The main piece only: San Francisco's limits include the Farallon Islands.
  const sfMain: Rings[] = [[largestPiece(sfLand).map(([x, y]) => [x, y])]];
  const berkeleyLand = onLand(juris('Berkeley'));
  const beverly = parse(beverlyRaw).features[0]!;
  const beverlyRings = svgRings(beverly.geometry!);

  // San Francisco's SB 79 zones (its copy of MTC's map).
  const sfZones = parse(sfZonesRaw).features.map((f) => {
    const label = String(f.properties.zone_label);
    const tier = label.startsWith('Tier 1') ? 1 as const : 2 as const;
    return { tier, band: label.replace(/^Tier \d - /, ''), d: pathOf([f]) };
  }).sort((a, b) => ['Half Mile', 'Quarter Mile', '200ft'].indexOf(a.band) - ['Half Mile', 'Quarter Mile', '200ft'].indexOf(b.band) || b.tier - a.tier);

  // North Berkeley: MTC's zones, access points, the station, the track.
  const zones = parse(zonesRaw).features;
  const zone = (word: string) => {
    const z = zones.find((f) => String(f.properties.zone_label).includes(word));
    if (!z) throw new Error(`MTC zone "${word}" missing`);
    return z;
  };
  const zoneFeatures = { adjacent: zone('200ft'), quarter: zone('Quarter'), half: zone('Half') };
  const accessPoints = parse(accessRaw).features;
  const apFt = accessPoints.map((f) => projectFt((f.geometry as { coordinates: number[] }).coordinates));
  const primaryId = manifest.center.stationId;
  const stationName = String(parse(stationsRaw).features.find((s) => s.properties.station_id === primaryId)?.properties.station_name ?? '');
  // Ring labels where a ray from the station to the west-southwest leaves each zone.
  const ray = unit([-0.94, -0.34]); // in projected feet (y north)
  const exitAlong = (f: Feature): number => {
    let best = 0;
    for (const poly of polygonsFt(f.geometry!)) {
      for (const ring of [poly.outer, ...(poly.holes ?? [])]) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = sub(ring[i]!, stationFt), b = sub(ring[i + 1]!, stationFt);
          const e = sub(b, a);
          const den = ray[0] * e[1] - ray[1] * e[0];
          if (Math.abs(den) < 1e-9) continue;
          const t = (a[0] * e[1] - a[1] * e[0]) / den;
          const s = (a[0] * ray[1] - a[1] * ray[0]) / den;
          if (t > 0 && s >= 0 && s <= 1 && t < reachFt + 600) best = Math.max(best, t);
        }
      }
    }
    return best;
  };
  const ringLabel = (f: Feature, text: string): Label => {
    const t = exitAlong(f);
    return { at: toSvg([stationFt[0] + ray[0] * t, stationFt[1] + ray[1] * t]), text };
  };
  // The measuring line: Exhibit B's nearest edge to its nearest access point.
  const apIndex = accessPoints.findIndex((f) => f.properties.access_id === B.accessPointId);
  if (apIndex < 0) throw new Error(`Access point ${B.accessPointId} missing`);
  const ap = apFt[apIndex]!;
  const near = nearestPointOnPolygon(ap, site);
  const railFeatures = parse(railRaw).features.filter((f) => f.properties.railway === 'subway');

  // Zoning districts, labeled at a parcel near the middle of each district's parcels in the band.
  const districts = zoningStandards.districts as Record<string, { class: 'residential' | 'mixed' | 'commercial' | 'other'; heightFt: number }>;
  const zoning = parse(zoningRaw).features.map((f) => {
    const district = String(f.properties.district);
    const std = districts[district];
    if (!std) throw new Error(`No standards for district ${district}`);
    const probes = inBand.filter((p) => p.district === district).map((p) => p.probe);
    const pool = probes.length ? probes : [centroid(open(largest(f.geometry!).outer))];
    const mx = pool.reduce((s, q) => s + q[0], 0) / pool.length, my = pool.reduce((s, q) => s + q[1], 0) / pool.length;
    const at = pool.reduce((a, b) => (Math.hypot(b[0] - mx, b[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? b : a));
    return { district, cls: std.class, d: pathOf([f]), label: { at: toSvg(at), text: district, sub: ftShort(std.heightFt) } };
  });
  const byClass = (cls: string) => Object.entries(districts).filter(([, d]) => d.class === cls);
  const heightsOf = (cls: string) => {
    const hs = [...new Set(byClass(cls).map(([, d]) => d.heightFt))];
    return hs.length === 1 ? ftShort(hs[0]!) : byClass(cls).map(([k, d]) => `${k} ${ftShort(d.heightFt)}`).join(', ');
  };

  // BART's AB 2923 parcels at North Berkeley.
  const bartFeatures = parse(bartParcelsRaw).features.filter((f) => f.properties.ab2923 === 'Yes' && f.properties.station === stationName);
  const bartRings = bartFeatures.flatMap((f) => svgRings(f.geometry!));

  // Hazards: the radius CAL FIRE was queried at, and the direction of Oakland airport's influence area.
  const fireR = Math.round(ex.hazards.fireRadiusFt);
  // Room above the circle for its label, and below it for the airport arrow.
  const hazardsBox: Box = [nb[0] - fireR - 2400, nb[1] - fireR - 900, 2 * fireR + 4800, 2 * fireR + 3300];

  const opportunity = parse(opportunityRaw).features;
  const oppOf = (cat: string) => opportunity.filter((f) => String(f.properties.category).toLowerCase() === cat.toLowerCase());
  const oppHighest = oppOf('Highest Resource'), oppHigh = oppOf('High Resource');
  const oppOther = opportunity.filter((f) => !oppHighest.includes(f) && !oppHigh.includes(f));

  const pathsOf = (ps: typeof inBand) => pathOf(ps.map((p) => p.feature));
  const clear = inBand.filter((p) => p.qualifyingZoning && !p.bart && !p.rentEstimate && !p.landmark);
  const flagged = inBand.filter((p) => !clear.includes(p));
  const siteCenter = toSvg(centroid(open(site.outer)));
  const pc = ex.parcels;
  const berkeleyStations = parse(bartStationsRaw).features
    .map((f) => ({ name: String(f.properties.Station), at: toSvg(projectFt((f.geometry as { coordinates: number[] }).coordinates)) }))
    .filter((st) => berkeleyLand.some((poly) => pointInPolygon(st.at as unknown as Point, { outer: poly[0]!.map(([x, y]) => [x!, y!] as Point) })));
  const alt = ex.altPlans;
  const sfCenter = centerOf(sfMain);

  return {
    views: {
      california: caBox,
      sf: boxOf(sfMain, 9000),
      berkeley: boxOf(berkeleyLand, 3000),
      rings: [nb[0] - reachFt - 500, nb[1] - reachFt - 500, 2 * reachFt + 1000, 2 * reachFt + 1000],
      hazards: hazardsBox,
      parcel: viewAround(siteCenter, 1500),
    },
    california: {
      counties: counties.map((f) => ({
        name: String(f.properties.name),
        d: ringsPath(countyRings.get(String(f.properties.name))!),
        utc: utc.has(String(f.properties.name)),
        openIssue: f.properties.name === orange,
      })),
      labels: {
        alameda: { at: centerOf(countyRings.get('Alameda')!), text: 'Alameda' },
        orange: { at: centerOf(countyRings.get(orange)!), text: orange, sub: 'open issue' },
      },
    },
    altPlans: [
      { name: alt.sanFrancisco.name, d: ringsPath(sfMain), at: sfCenter },
      { name: alt.beverlyHills.name, d: ringsPath(beverlyRings), at: centerOf(beverlyRings) },
    ],
    sf: {
      zones: sfZones,
      stamp: { at: [sfCenter[0], sfCenter[1] - 6000], text: 'Alternative plan', sub: 'No parcel under the defaults' },
    },
    berkeley: {
      d: ringsPath(berkeleyLand),
      stamp: { at: [centerOf(berkeleyLand)[0] + 3500, centerOf(berkeleyLand)[1] - 6500], text: 'No exclusions', sub: 'SB 79 defaults govern' },
      stations: berkeleyStations,
    },
    population: {
      title: 'Berkeley',
      lines: [`Population ${num(data.population.mtc)}`, `The outer band needs ${num(L.pop.value)}`],
    },
    parcels: pathOf(parcelClasses.map((p) => p.feature)),
    rail: pathOf(railFeatures),
    station: { name: `${stationName} BART`, at: nb },
    accessPoints: accessPoints.map((f, i) => ({ at: toSvg(apFt[i]!), elevator: Boolean(f.properties.isElevator), primary: f.properties.station_id === primaryId })),
    zones: { adjacent: pathOf([zoneFeatures.adjacent]), quarter: pathOf([zoneFeatures.quarter]), half: pathOf([zoneFeatures.half]) },
    ringLabels: [
      ringLabel(zoneFeatures.adjacent, ftShort(L.adjacent.value)),
      ringLabel(zoneFeatures.quarter, milesShort(L.quarter.value)),
      ringLabel(zoneFeatures.half, milesShort(L.half.value)),
    ],
    tierStamp: { at: [nb[0] + 1000, nb[1] - 1100], text: 'Tier 1', sub: 'Heavy rail (BART)' },
    site: { d: pathOf([byApn(B.apn)]), at: siteCenter, label: 'B' },
    measure: { from: toSvg(near.point), to: toSvg(ap), label: ftShort(B.distanceFt) },
    zoning,
    bart: { d: ringsPath(bartRings), label: { at: centerOf(bartRings), text: 'BART land', sub: 'AB 2923; § 65912.158' } },
    hazards: {
      fire: { at: nb, r: fireR, label: `No very high fire hazard zone within ${num(ex.hazards.fire.lra.radiusM)} m` },
      airport: { from: [nb[0], nb[1] + fireR + 300], to: [nb[0], hazardsBox[1] + hazardsBox[3] - 500], label: `Oakland airport influence area: ${num(ex.hazards.airportMiles, 1)} mi south` },
    },
    rent: {
      estimate: pathsOf(inBand.filter((p) => p.rentEstimate)),
      unknown: pathsOf(inBand.filter((p) => p.units > L.anti.rentControlledSite.moreThanUnits.value && p.yearBuilt === null)),
    },
    historic: {
      landmark: pathsOf(inBand.filter((p) => p.landmark === 'Landmark')),
      merit: pathsOf(inBand.filter((p) => p.landmark === 'Structure of Merit')),
    },
    opportunity: { highest: pathOf(oppHighest), high: pathOf(oppHigh), other: pathOf(oppOther) },
    pick: { clear: pathsOf(clear), flagged: pathsOf(flagged), label: { at: siteCenter, text: B.address, sub: `${B.district}, ${ftShort(B.distanceFt)} from the station` } },
    legends: {
      counties: [
        { swatch: 'ca-utc', text: 'urban transit counties per HCD' },
        { swatch: 'ca-open-issue legend-dashed', text: `${orange}: counted by ABAG, not HCD` },
      ],
      alt: [
        { swatch: 'map-alt', text: `${alt.sanFrancisco.name}: plan in substantial compliance (HCD, ${shortDate(alt.sanFrancisco.hcd.date)})` },
        { swatch: 'map-alt', text: `${alt.beverlyHills.name}: plan needs revisions (HCD, ${shortDate(alt.beverlyHills.hcd.date)})` },
        { swatch: 'ca-utc', text: 'Urban transit county' },
      ],
      sf: [
        { swatch: 'sf-tier1', text: 'Tier 1 zones: 200 ft, ¼ mile, ½ mile' },
        { swatch: 'sf-tier2', text: 'Tier 2 zones' },
        { swatch: 'map-alt', text: 'Replaced by the alternative plan' },
      ],
      distance: [
        { swatch: 'legend-ap', text: 'Station entrance (MTC)' },
        { swatch: 'legend-ap legend-ap-elevator', text: 'Elevator entrance' },
        { swatch: 'legend-ring', text: 'MTC SB 79 zones' },
      ],
      zoning: [
        { swatch: 'zone-residential', text: `Residential (${byClass('residential').map(([k]) => k).join(', ')}): ${heightsOf('residential')}` },
        { swatch: 'zone-mixed', text: `Mixed use (${byClass('mixed').map(([k]) => k).join(', ')}): ${heightsOf('mixed')}` },
        { swatch: 'zone-commercial', pattern: 'dots', text: `Commercial: ${heightsOf('commercial')}` },
        { swatch: 'map-parcel', text: `No district in the city's layer (${num(pc.otherZoning)})` },
      ],
      bart: [{ swatch: 'zone-residential', pattern: 'hatch', text: `BART's AB 2923 parcels (${word(ex.bart.count)}, ${num(ex.bart.acres, 1)} acres)` }],
      hazards: [
        { swatch: 'legend-ring', text: `${num(ex.hazards.fire.lra.radiusM)} m: no very high fire hazard zone or state responsibility area` },
        { swatch: 'legend-arrow', text: `Oakland airport influence area, ${num(ex.hazards.airportMiles, 1)} mi south` },
      ],
      rent: [
        { swatch: 'map-rent', pattern: 'cross', text: `More than two units, built by ${ex.rentControl.estimate.lastYearBuilt} (${num(pc.rentEstimate)}): estimate` },
        { swatch: 'map-rent-unknown', text: `More than two units, year built unknown (${num(pc.rentUnknownYear)})` },
      ],
      historic: [
        { swatch: 'map-landmark', text: `Berkeley Landmark (${word(pc.landmark)})` },
        { swatch: 'map-merit', text: `Structure of Merit (${word(pc.structureOfMerit)})` },
      ],
      opportunity: [
        { swatch: 'opp-highest', text: 'Highest resource' },
        { swatch: 'opp-high', text: 'High resource' },
      ],
      pick: [
        { swatch: 'map-clear', text: `Zoned to qualify, no flag on this map (${num(pc.clear)})` },
        { swatch: 'map-flagged', text: 'BART land, a flag, or not zoned to qualify' },
      ],
    },
    captions: {
      california: 'California, county by county.',
      'utc-fill': `Urban transit counties: more than ${num(L.utc.value)} passenger rail stations.`,
      'transit-counties': `HCD lists ${word(derived.utcCountyCount)}, Alameda among them; Orange County is an open issue.`,
      'alt-plan-cities': 'Gray: cities whose alternative plans HCD has ruled on.',
      'sf-plan': `San Francisco's SB 79 zones, replaced by its alternative plan (HCD, ${shortDate(alt.sanFrancisco.hcd.date)}).`,
      berkeley: `Berkeley: ${word(berkeleyStations.length)} BART stations; no exemption, exclusion, or alternative plan (as of ${shortDate(data.localOptions.berkeley.source.date)}).`,
      'station-rings': `North Berkeley BART, Tier 1. MTC's zones at ${ftShort(L.adjacent.value)}, ${milesShort(L.quarter.value)}, and ${milesShort(L.half.value)}; Exhibit B is ${ftShort(B.distanceFt)} from the nearest entrance. Track ${railMeta.attribution}.`,
      zoning: 'Every district in the half mile is residential, mixed use, or commercial.',
      'bart-land': "BART's own station land: AB 2923 and SB 79's transit-agency rule.",
      hazards: 'No very high fire hazard zone or airport influence area reaches the half mile.',
      'rent-control': 'Where the rent-control bar could reach: an estimate from unit counts and year built.',
      historic: 'Berkeley Landmarks and Structures of Merit in the half mile.',
      'high-resource': 'The state opportunity map: every tract here is high or highest resource.',
      'pick-parcel': `${B.address}: zoned to qualify, and no flag on this map.`,
    },
  };
}

// ---------------------------------------------------------------- envelope

/** Edges of `ring` with no other parcel across them: the street frontage. */
function frontage(ring: Point[], others: Polygon[]): number[] {
  const ccw = signedArea(ring) > 0;
  const street: number[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const e = unit(sub(b, a));
    const out: Point = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
    const probe: Point = [(a[0] + b[0]) / 2 + out[0] * 4, (a[1] + b[1]) / 2 + out[1] * 4];
    if (!others.some((p) => pointInPolygon(probe, p))) street.push(i);
  });
  return street;
}

function buildEnvelope(): EnvelopeData {
  const f2f = cfg.floorToFloorFt;
  const ring = open(site.outer);
  const local = ring.map((p) => toLocal(p));
  const localPoly: Polygon = { outer: local };

  // Street frontage, depth axis, and lot depth.
  const neighbors = parcels
    .filter((f) => f.properties.apn !== B.apn && f.geometry)
    .map((f) => largest(f.geometry!))
    .filter((p) => Math.hypot(...sub(centroid(open(p.outer)), ORIGIN)) < 400);
  const street = frontage(ring, neighbors);
  if (street.length === 0) throw new Error('Exhibit B has no street frontage');
  const edgeLen = (i: number) => Math.hypot(...sub(local[(i + 1) % local.length]!, local[i]!));
  const front = street.reduce((a, b) => (edgeLen(b) < edgeLen(a) ? b : a));
  const fa = local[front]!, fb = local[(front + 1) % local.length]!;
  const fMid: Point = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
  const along = unit(sub(fb, fa));
  let inward: Point = [-along[1], along[0]];
  if (dot(sub([0, 0], fMid), inward) < 0) inward = [-inward[0], -inward[1]];
  const depth = Math.max(...local.map((p) => dot(sub(p, fMid), inward)));

  // Floor plates: FAR x lot area, stacked at full lot coverage; a partial top
  // plate keeps the street side of the lot.
  const plates = stackFloorPlates(localPoly, { floorToFloor: f2f, maxHeight: B.floors.heightFt, maxFloorArea: B.residentialFloorAreaSqFt });
  const partialRing = (area: number): XY[] => {
    let lo = 0, hi = depth;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const clipped = clipHalfPlane(local, fMid, [-inward[0], -inward[1]], -mid);
      if (polygonArea({ outer: clipped }) < area) lo = mid; else hi = mid;
    }
    return clipHalfPlane(local, fMid, [-inward[0], -inward[1]], -hi).map((p) => [r1(p[0]), r1(p[1])] as XY);
  };
  const plateGeo: Plate[] = plates.map((p) => ({
    ring: p.partial ? partialRing(p.area) : local,
    elevation: p.elevation,
    thickness: 1,
  }));

  // Unit dots: two per story, bottom up, on the lot's depth axis; bonus dots
  // sit between them, one per story (an illustrative count, not a legal one).
  const center = centroid(local);
  const levels = Math.floor(B.floors.heightFt / f2f);
  const slot = (t: number, level: number): [number, number, number] => {
    const s = (t - 0.5) * depth * 0.7;
    return [r1(center[0] + inward[0] * s), r1(center[1] + inward[1] * s), r1(level * f2f + f2f / 2)];
  };
  const baseCount = Math.ceil(B.unitFloor);
  const dots = Array.from({ length: baseCount }, (_, i) => slot(i % 2 === 0 ? 0.15 : 0.85, Math.floor(i / 2)));
  const bonusDots = Array.from({ length: levels }, (_, level) => slot(0.5, level));
  if (Math.floor((baseCount - 1) / 2) >= levels) throw new Error('Unit dots do not fit under the height floor');

  // An illustrative rear setback: a slab along the rear lot line.
  const setDepth = depth * cfg.setbackShareOfDepth;
  const slab = clipHalfPlane(local, fMid, inward, depth - setDepth).map((p) => [r1(p[0]), r1(p[1])] as XY);
  const lineAt = (s: number): XY => [r1(fMid[0] + inward[0] * s), r1(fMid[1] + inward[1] * s)];
  const halfWidth = Math.max(...local.map((p) => Math.abs(dot(sub(p, fMid), along)))) + 2;
  const sl = lineAt(depth - setDepth);
  const setbackLine: [XY, XY] = [
    [r1(sl[0] - along[0] * halfWidth), r1(sl[1] - along[1] * halfWidth)],
    [r1(sl[0] + along[0] * halfWidth), r1(sl[1] + along[1] * halfWidth)],
  ];

  // Context: neighbors' buildings, a story height per recorded story.
  const footprints = parse(footprintsRaw).features;
  const context: Solid[] = [];
  for (const f of footprints) {
    if (!f.geometry) continue;
    const p = largest(f.geometry);
    const c = centroid(open(p.outer));
    if (Math.hypot(...sub(c, ORIGIN)) > cfg.contextRadiusFt || pointInPolygon(c, site)) continue;
    const stories = Math.max(1, Number(f.properties.parcelStories ?? 1) || 1);
    context.push({ ring: open(p.outer).map((q) => toLocal(q)), height: stories * f2f });
  }
  const ground = neighbors
    .filter((p) => Math.hypot(...sub(centroid(open(p.outer)), ORIGIN)) < cfg.contextRadiusFt + 40)
    .map((p) => open(p.outer).map((q) => toLocal(q)));

  // Rockridge, in its own frame.
  const rock = largest(parse(rockParcelRaw).features[0]!.geometry!);
  const rockRing = open(rock.outer);
  const rockCenter = centroid(rockRing);
  const rockLocal = rockRing.map((p) => toLocal(p, rockCenter));
  const rockAxis = (() => {
    let best: Point = [1, 0], len = 0;
    rockLocal.forEach((a, i) => {
      const b = rockLocal[(i + 1) % rockLocal.length]!;
      const l = Math.hypot(...sub(b, a));
      if (l > len) { len = l; best = unit(sub(b, a)); }
    });
    return { dir: best, len };
  })();
  const towers = contrast.towerHeightsFt.map((h, i) => {
    const s = (i === 0 ? -1 : 1) * rockAxis.len * 0.22;
    return { at: [r1(rockAxis.dir[0] * s), r1(rockAxis.dir[1] * s)] as XY, heightFt: h };
  });

  // Exhibits side by side, each in its own frame, A to C from left to right.
  const exhibitList = ([['A', A], ['B', B], ['C', C]] as const).map(([key, x]) => {
    const p = largest(byApn(x.apn).geometry!);
    const r = open(p.outer);
    const c = centroid(r);
    return { key, x, ring: r.map((q) => toLocal(q, c)) };
  });
  let cursor = 0;
  const placed = exhibitList.map((e) => {
    const xs = e.ring.map((p) => p[0]);
    const dx = cursor - Math.min(...xs);
    cursor += Math.max(...xs) - Math.min(...xs) + cfg.exhibitGapFt;
    return { ...e, dx };
  });
  const shift = placed[1]!.dx;
  const exhibits = placed.map(({ key, x, ring: r, dx }) => ({
    key,
    ring: r.map(([px, py]) => [r1(px + dx - shift), py] as XY),
    center: [r1(dx - shift), 0] as XY,
    localHeightFt: x.localHeightFt,
    floorHeightFt: x.floors.heightFt,
    label: `${key} · ${x.address}`,
    sub: `${bandLabel[x.band]} · at least ${ftShort(x.floors.heightFt)}`,
  }));

  const anti = L.anti.rentControlledSite;
  return {
    block: {
      site: local,
      context,
      ground,
      localHeightFt: B.localHeightFt,
      floorHeightFt: B.floors.heightFt,
      plates: plateGeo,
      plateAreas: plates.map((p) => p.area),
      residentialFloorAreaSqFt: B.residentialFloorAreaSqFt,
      unitFloor: B.unitFloor,
      levels: Array.from({ length: levels }, (_, i) => (i + 1) * f2f).filter((h) => h < B.floors.heightFt),
      dots,
      bonusDots,
      minUnits: L.cond.minUnits.value,
      affordable: project.berkeleyAtFloor,
      setback: { slab, line: setbackLine, depth: r1(setDepth) },
      inward: [r1(inward[0] * 1000) / 1000, r1(inward[1] * 1000) / 1000],
    },
    rockridge: {
      site: rockLocal,
      localHeightFt: contrast.localHeightFt,
      floorHeightFt: contrast.sb79HeightFt,
      towers,
      inward: [0, 1],
    },
    exhibits,
    laborFt: L.labor.buildingHeightOverFt.value,
    labels: {
      site: B.address,
      local: `Local limit ${ftShort(B.localHeightFt)}`,
      floor: `SB 79 floor ${ftShort(B.floors.heightFt)}`,
      gain: `+${ftShort(B.heightGainFt)}`,
      unitsOf: `${duac(B.floors.densityDuPerAcre)} × ${num(B.acres, 3)} acres`,
      plateOf: `FAR ${far(B.floors.residentialFar)} × ${sqftShort(B.lotSqFt)} lot = ${sqftShort(B.residentialFloorAreaSqFt)}`,
      setback: 'Rear setback (illustrative)',
      cannotPreclude: 'Cannot preclude',
      toggle: `Had the site held ${word(derived.rentControlledSiteUnits)} rent-controlled units, tenant-occupied within ${word(anti.tenantLookbackYears.value)} years`,
      toggleValue: 'Yes',
      collapse: 'SB 79 does not apply',
      collapseSub: 'Local zoning governs',
      lock: `Height stays at ${ftShort(B.floors.heightFt)}`,
      lockSub: `Exception: all-affordable projects near transit may gain up to ${ftShort(L.bonus.heightExceptionFt.value)} (${shortCite(L.bonus.heightExceptionFt.cite)})`,
      base: `${num(B.unitFloor, 2)} units at SB 79 density: the base`,
      bonus: 'Bonus units (illustrative count)',
      rockSite: `${contrast.address}, Oakland`,
      rockLocal: `Oakland zoning ${ftShort(contrast.localHeightFt)}`,
      rockFloor: `SB 79 floor ${ftShort(contrast.sb79HeightFt)}`,
      rockTowers: `Proposed towers ${contrast.towerHeightsFt.map(ftShort).join(' and ')}`,
      rockNote: 'Density Bonus Law application; tower positions schematic',
      labor: `${ftShort(L.labor.buildingHeightOverFt.value)}: labor standards apply above this height`,
      totals: `At least ${ftShort(B.floors.heightFt)} · ${duac(B.floors.densityDuPerAcre)} · FAR ${far(B.floors.residentialFar)}`,
      totalsSub: `${num(B.unitFloor, 2)} units · ${sqftShort(B.residentialFloorAreaSqFt)} residential floor area`,
    },
    panels: {
      minimums: {
        title: 'What the project must include',
        rows: [
          { text: `At least ${word(L.cond.minUnits.value)} units`, cite: shortCite(L.cond.minUnits.cite), strong: true },
          { text: `At least ${duac(L.cond.minDensityDuPerAcre.value)}: ${num(project.minDensityUnits, 2)} units on this lot, so the ${word(L.cond.minUnits.value)}-unit minimum governs`, cite: shortCite(L.cond.minDensityDuPerAcre.cite) },
          { text: `Units averaging no more than ${num(L.cond.maxAverageUnitSizeNetSqFt.value)} net sq ft: using all ${sqftShort(B.residentialFloorAreaSqFt)} takes at least ${num(project.unitsToFillFloorArea, 2)} units`, cite: shortCite(L.cond.maxAverageUnitSizeNetSqFt.cite) },
        ],
      },
      affordable: {
        title: 'Affordable units',
        rows: [
          { text: `At the floor, ${word(project.wholeUnits)} whole units: SB 79's own rule starts above ${word(L.aff.appliesAboveUnits.value)}`, cite: shortCite(L.aff.appliesAboveUnits.cite) },
          { text: `Berkeley: ${pct(data.inclusionary.percentOfUnits.value)}, rounded up: ${word(project.berkeleyAtFloor)} of ${word(project.wholeUnits)} units, at least ${word(project.berkeleyVeryLowAtFloor)} very low income`, cite: data.inclusionary.section, strong: true },
          { text: `At ${word(project.nextUnits)} units, SB 79 asks ${num(project.sb79AtNext.extremelyLow, 2)} extremely low, ${num(project.sb79AtNext.veryLow, 2)} very low, or ${num(project.sb79AtNext.lower, 2)} lower income units; Berkeley's ${word(project.berkeleyAtNext)} apply instead`, cite: shortCite(L.aff.stricterLocalInclusionaryControls.cite) },
        ],
      },
    },
    captions: {
      ghost: `${B.address}. Pale: what Berkeley's zoning allows, ${ftShort(B.localHeightFt)}.`,
      'height-rise': `Height: local limit ${ftShort(B.localHeightFt)}; SB 79 floor ${ftShort(B.floors.heightFt)}.`,
      'unit-fill': `Density: ${duac(B.floors.densityDuPerAcre)} × ${num(B.acres, 3)} acres = ${num(B.unitFloor, 2)} units, unrounded.`,
      'plate-stack': `Residential FAR: ${far(B.floors.residentialFar)} × ${sqftShort(B.lotSqFt)} = ${sqftShort(B.residentialFloorAreaSqFt)}. Plates drawn at full lot coverage.`,
      'setback-cannot-preclude': 'A local setback applies only so far as it does not prevent the SB 79 standards. Illustrative.',
      minimums: `What the project must include: at least ${word(L.cond.minUnits.value)} units, a minimum density, and an average unit size cap.`,
      'affordable-units': `Affordable units at the floor: Berkeley's ${pct(data.inclusionary.percentOfUnits.value)} rule, rounded up.`,
      collapse: 'Counterfactual: one failed condition, and local zoning governs.',
      'bonus-locked-height': 'Density bonus: more units on the SB 79 base; no added height owed.',
      'contrast-three-heights': `${contrast.address}, Oakland: the SB 79 floor, Oakland's limit, and the proposed towers.`,
      'exhibit-comparison': 'Exhibits A, B, and C: the standards step down with distance.',
      final: `${B.address}: what Berkeley must allow.`,
    },
  };
}

// ---------------------------------------------------------------- timeline

function buildTimeline(): TimelineData {
  const ap = L.approval, dp = ap.denialPresumption;
  const end = new Date(`${dp.beginsOn.value}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 3);
  return {
    start: law.acts.sb79.approved.value,
    end: end.toISOString().slice(0, 10),
    events: [
      { date: law.acts.sb79.effective.value, label: 'SB 79 takes effect', kind: 'law' },
      { date: L.operative.value, label: 'Standards reach cities', kind: 'law' },
      { date: law.acts.sb722.effective.value, label: 'SB 722', kind: 'law' },
      { date: asOf, label: 'This explainer', kind: 'memo' },
      { date: dp.beginsOn.value, label: 'Denial presumption', sub: 'AB 2576 and SB 1361 take effect', kind: 'presumption' },
    ],
    path: {
      application: 'Application',
      local: { title: 'Local review', sub: `No new approval process; CEQA unchanged (${shortCite(ap.noMinisterialProcessRequired.cite)})` },
      haa: { title: 'Housing Accountability Act', sub: `Deemed consistent with local plans (${shortCite(ap.deemedConsistent.cite)})` },
      sb35: { title: 'Optional: SB 35 streamlining', sub: `Ministerial approval under § 65913.4 (${shortCite(ap.sb35Eligible.cite)})` },
      presumption: {
        title: `From ${date(dp.beginsOn.value)}`,
        sub: `Denial in a high-resource area presumed to violate the Act; fines of at least ${money(dp.minFinePerUnitUsd.value)} per unit (${shortCite(dp.beginsOn.cite)})`,
      },
      site: `${B.address}: ${B.opportunity} area`,
    },
    captions: { 'approval-path': `Approval: the Housing Accountability Act, an optional SB 35 path, and the presumption from ${date(dp.beginsOn.value)}.` },
  };
}

let cached: FigureData | undefined;
export function buildFigureData(): FigureData {
  cached ??= { asOf, map: buildMap(), envelope: buildEnvelope(), timeline: buildTimeline() };
  return cached;
}

/** Exposed for tests. */
export const frame = { origin: ORIGIN, site, quarterFt, reachFt };
