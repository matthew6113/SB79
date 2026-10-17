/**
 * Figure data, computed at build time (src/pages/figure-data.json.ts) from
 * memo-data, the frozen snapshots in data/, and @zoning-envelope/engine.
 *
 * Rule 1 (CLAUDE.md) holds here as in the prose: every number a figure shows
 * is a label built below from @zoning-envelope/law or data/. Drawing choices
 * that are not law (story height, setback depth, spacing) come from
 * memoConfig.figures and are never shown as numbers.
 */
import { geoConicEqualArea, geoIdentity, geoPath, geoTransform, type GeoPermissibleObjects, type GeoStream } from 'd3-geo';
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
import rockParcelRaw from '../../data/rockridge/parcel.geojson?raw';
import zoningStandards from '../../data/berkeley-zoning-standards.json';
import manifest from '../../data/manifest.json';
import { A, B, C, L, asOf, contrast, data, derived, law } from '../memo-data';
import { memoConfig } from '../memo.config';
import { date, duac, far, ftShort, milesShort, money, num, pct, shortCite, sqftShort, word } from '../format';
import type { Box, ChecklistData, EnvelopeData, FigureData, Label, MapData, Plate, Solid, TimelineData, XY } from './types';

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

function buildMap(): MapData {
  // California counties, conic equal-area (California Albers parallels).
  const counties = parse(countiesRaw).features;
  const size: [number, number] = [600, 700];
  // d3-geo is spherical: exterior rings must wind clockwise in lon/lat.
  const rewind = (f: Feature): Feature => {
    const fix = (poly: number[][][]) => poly.map((ring, i) => {
      const cw = signedArea(ring as unknown as Point[]) < 0;
      return (i === 0) === cw ? ring : [...ring].reverse();
    });
    const g = f.geometry!;
    const geometry = g.type === 'Polygon' ? { ...g, coordinates: fix(g.coordinates) }
      : g.type === 'MultiPolygon' ? { ...g, coordinates: g.coordinates.map(fix) } : g;
    return { ...f, geometry } as Feature;
  };
  const caFeatures = counties.map(rewind);
  const ca = geoConicEqualArea().parallels([34, 40.5]).rotate([120, 0])
    .fitExtent([[12, 12], [size[0] - 12, size[1] - 12]], { type: 'FeatureCollection', features: caFeatures } as GeoPermissibleObjects);
  const caPath = geoPath(ca).digits(1);
  const utc = new Set(data.counties.counties);
  const orange = data.counties.openIssue.county;
  const countyAt = (name: string): XY => {
    const f = caFeatures.find((x) => x.properties.name === name);
    if (!f) throw new Error(`County ${name} missing`);
    const [x, y] = caPath.centroid(f as GeoPermissibleObjects);
    return [Math.round(x), Math.round(y)];
  };

  // Block scale.
  const zoning = parse(zoningRaw).features.map((f) => ({ district: String(f.properties.district), polys: polygonsFt(f.geometry!) }));
  const districts = zoningStandards.districts as Record<string, { class: string }>;
  const accessPoints = parse(accessRaw).features;
  const apFt = accessPoints.map((f) => projectFt((f.geometry as { coordinates: number[] }).coordinates));
  const groups: Record<'eligible' | 'bart' | 'notQualifying' | 'outside', Feature[]> = { eligible: [], bart: [], notQualifying: [], outside: [] };
  // Zoning was snapshotted within manifest.radiusFt of the station; parcels
  // beyond it are drawn but not classified.
  const zoningReach = manifest.radiusFt;
  const stationFt = projectFt(manifest.center.lonLat);
  let noDistrict = 0, otherClass = 0;
  for (const f of parcels) {
    if (!f.geometry) continue;
    const polys = polygonsFt(f.geometry);
    const big = polys.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
    let probe = centroid(open(big.outer));
    if (!pointInPolygon(probe, big)) probe = big.outer[0]!;
    const dist = Math.min(...apFt.map((a) => Math.min(...polys.map((p) => distancePointToPolygon(a, p)))));
    if (dist > reachFt || Math.hypot(...sub(probe, stationFt)) > zoningReach) { groups.outside.push(f); continue; }
    if (f.properties.ownerClass === 'BART') { groups.bart.push(f); continue; }
    const district = zoning.find((z) => z.polys.some((p) => pointInPolygon(probe, p)))?.district;
    const cls = district ? districts[district]?.class : undefined;
    if (cls && (L.zoning.value as readonly string[]).includes(cls)) { groups.eligible.push(f); continue; }
    if (district) otherClass++; else noDistrict++;
    groups.notQualifying.push(f);
  }

  const zones = parse(zonesRaw).features;
  const zone = (word: string) => {
    const z = zones.find((f) => String(f.properties.zone_label).includes(word));
    if (!z) throw new Error(`MTC zone "${word}" missing`);
    return z;
  };
  const zoneFeatures = { adjacent: zone('200ft'), quarter: zone('Quarter'), half: zone('Half') };

  const stations = parse(stationsRaw).features;
  const primaryId = manifest.center.stationId;
  const nbStation = stations.find((s) => s.properties.station_id === primaryId);
  if (!nbStation) throw new Error('North Berkeley station missing');
  const nbFt = projectFt((nbStation.geometry as { coordinates: number[] }).coordinates);
  const nb = toSvg(nbFt);

  // Ring labels where a ray from the station to the west-southwest leaves each zone.
  const ray = unit([-0.94, -0.34]); // in projected feet (y north)
  const exitAlong = (f: Feature): number => {
    let best = 0;
    for (const poly of polygonsFt(f.geometry!)) {
      for (const ring of [poly.outer, ...(poly.holes ?? [])]) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = sub(ring[i]!, nbFt), b = sub(ring[i + 1]!, nbFt);
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
    return { at: toSvg([nbFt[0] + ray[0] * t, nbFt[1] + ray[1] * t]), text };
  };

  // The measuring line: Exhibit B's nearest edge to its nearest access point.
  const apIndex = accessPoints.findIndex((f) => f.properties.access_id === B.accessPointId);
  if (apIndex < 0) throw new Error(`Access point ${B.accessPointId} missing`);
  const ap = apFt[apIndex]!;
  const near = nearestPointOnPolygon(ap, site);

  const jurisdictions = parse(jurisdictionsRaw).features;
  const juris = (name: string) => {
    const f = jurisdictions.find((j) => j.properties.name === name);
    if (!f) throw new Error(`Jurisdiction ${name} missing`);
    return f;
  };
  // City limits run into the Bay; clip them to the counties' shoreline so the
  // city and Bay Area views read as land. All in the map frame (feet, y south).
  type Rings = number[][][];
  const svgRings = (g: Geometry): Rings[] => polygonsFt(g).map((p) => [p.outer, ...(p.holes ?? [])].map((r) => r.map((q) => toSvg(q) as number[])));
  const bbox = (polys: Rings[]) => boxAround(polys.flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as XY)), 0);
  const overlaps = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const around = (names: string[], margin: number) => boxAround(names.flatMap((n) => svgRings(juris(n).geometry!).flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as XY))), margin);
  const roughBay = around(['Berkeley', 'Oakland', 'San Francisco'], 30000);
  const land = polyclip.union(
    ...(counties.flatMap((c) => svgRings(c.geometry!)).filter((p) => overlaps(bbox([p]), roughBay)) as never[]) as [never, ...never[]],
  ) as unknown as Rings[];
  const onLand = (f: Feature): Rings[] => polyclip.intersection(svgRings(f.geometry!) as never, land as never) as unknown as Rings[];
  const planar = geoPath(geoIdentity()).digits(0);
  const ringsPath = (polys: Rings[]) => planar({ type: 'MultiPolygon', coordinates: polys } as GeoPermissibleObjects) ?? '';
  const largestPiece = (polys: Rings[]) => polys.map((p) => p[0]!.map(([x, y]) => [x!, y!] as Point))
    .reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
  const landOf = new Map(['Berkeley', 'Oakland', 'San Francisco'].map((n) => [n, onLand(juris(n))]));
  const centerOf = (name: string): XY => {
    const [x, y] = centroid(largestPiece(landOf.get(name)!));
    return [Math.round(x), Math.round(y)];
  };
  const berkeleyLand = landOf.get('Berkeley')!;
  const cityBox = boxAround(berkeleyLand.flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as XY)), 3000);
  // The main piece of each city only: San Francisco's land includes the Farallon Islands.
  const bayBox = boxAround([...landOf.values()].flatMap((polys) => largestPiece(polys).map((q) => [q[0], q[1]] as XY)), 8000);
  const statusOf: Record<string, MapData['local']['jurisdictions'][number]['status']> = {
    Berkeley: data.localOptions.berkeley.status as 'defaults',
    Oakland: data.localOptions.oakland.status as 'exclusions',
    'San Francisco': data.localOptions.sanFrancisco.status as 'alternative-plan',
  };
  const bayJurisdictions = jurisdictions
    .filter((f) => overlaps(bbox(svgRings(f.geometry!)), bayBox))
    .map((f) => ({ name: String(f.properties.name), polys: onLand(f) }))
    .filter((j) => j.polys.length > 0);

  const sites = ([['A', A], ['B', B], ['C', C]] as const).map(([key, x]) => {
    const f = byApn(x.apn);
    return { key, d: pathOf([f]), at: toSvg(centroid(open(largest(f.geometry!).outer))), label: key };
  });

  const railFeatures = parse(railRaw).features.filter((f) => f.properties.railway === 'subway');

  return {
    california: {
      size,
      counties: caFeatures.map((f) => ({
        name: String(f.properties.name),
        d: caPath(f as GeoPermissibleObjects) ?? '',
        utc: utc.has(String(f.properties.name)),
        openIssue: f.properties.name === orange,
      })),
      labels: {
        alameda: { at: countyAt('Alameda'), text: 'Alameda' },
        orange: { at: countyAt(orange), text: orange, sub: 'open issue' },
      },
      legend: {
        utc: `Urban transit counties per HCD (${word(derived.utcCountyCount)})`,
        openIssue: `${orange}: counted by ABAG, not HCD`,
      },
    },
    local: {
      views: {
        station: [nb[0] - 1300, nb[1] - 1100, 2600, 2200],
        rings: [nb[0] - reachFt - 500, nb[1] - reachFt - 500, 2 * reachFt + 1000, 2 * reachFt + 1000],
        city: cityBox,
        bayArea: bayBox,
      },
      parcels: {
        eligible: pathOf(groups.eligible),
        bart: pathOf(groups.bart),
        notQualifying: pathOf(groups.notQualifying),
        outside: pathOf(groups.outside),
      },
      sites,
      zones: { adjacent: pathOf([zoneFeatures.adjacent]), quarter: pathOf([zoneFeatures.quarter]), half: pathOf([zoneFeatures.half]) },
      ringLabels: [
        ringLabel(zoneFeatures.adjacent, ftShort(L.adjacent.value)),
        ringLabel(zoneFeatures.quarter, milesShort(L.quarter.value)),
        ringLabel(zoneFeatures.half, milesShort(L.half.value)),
      ],
      rail: pathOf(railFeatures),
      stations: stations.map((s) => ({
        name: String(s.properties.station_name),
        at: toSvg(projectFt((s.geometry as { coordinates: number[] }).coordinates)),
        primary: s.properties.station_id === primaryId,
      })),
      accessPoints: accessPoints.map((f, i) => ({
        at: toSvg(apFt[i]!),
        elevator: Boolean(f.properties.isElevator),
        primary: f.properties.station_id === primaryId,
      })),
      measure: { from: toSvg(near.point), to: toSvg(ap), label: ftShort(B.distanceFt) },
      tierStamp: { at: [nb[0] + 260, nb[1] - 240], text: 'Tier 1', sub: 'Heavy rail (BART)' },
      population: {
        at: [nb[0] + reachFt * 0.55, nb[1] - reachFt * 0.95],
        title: 'Berkeley',
        lines: [`Population ${num(data.population.mtc)}`, `Outer band needs ${num(L.pop.value)}`],
      },
      eligibility: {
        eligible: 'Zoned residential, mixed-use, or commercial',
        bart: 'BART-owned (see open issue)',
        notQualifying: otherClass === 0
          ? (noDistrict ? "No zoning district in the City's layer" : `None zoned open space or industrial within ${milesShort(L.half.value)}`)
          : noDistrict ? "Zoned open space or industrial, or no district in the City's layer" : 'Zoned open space or industrial',
        outside: `Beyond ${milesShort(L.half.value)} or the zoning snapshot`,
      },
      land: ringsPath(land.filter((p) => overlaps(bbox([p]), bayBox))),
      berkeley: {
        d: ringsPath(berkeleyLand),
        label: { at: centerOf('Berkeley'), text: 'Berkeley' },
        // The stamp sits north of the city's center, clear of the station rings.
        stamp: { at: [centerOf('Berkeley')[0], Math.round(centerOf('Berkeley')[1] - cityBox[3] * 0.2)], text: 'No exclusions', sub: 'SB 79 defaults govern' },
      },
      jurisdictions: bayJurisdictions.map((j) => ({ name: j.name, d: ringsPath(j.polys), status: statusOf[j.name] ?? null })),
      bayLabels: ['Berkeley', 'Oakland', 'San Francisco'].map((n) => ({ at: centerOf(n), text: n })),
      bayLegend: {
        defaults: 'Berkeley: SB 79 defaults',
        exclusions: 'Oakland: interim exclusions, not near Ashby, MacArthur, or Rockridge BART',
        alternativePlan: 'San Francisco: alternative plan, found in substantial compliance by HCD',
      },
    },
    captions: {
      'transit-counties': `Urban transit counties have more than ${num(L.utc.value)} passenger rail stations. HCD lists ${word(derived.utcCountyCount)}; Orange County is an open issue.`,
      'station-tier': `North Berkeley BART, a heavy rail stop: Tier 1. Track alignment ${railMeta.attribution}.`,
      'distance-rings': `MTC's SB 79 zones at ${ftShort(L.adjacent.value)}, ${milesShort(L.quarter.value)}, and ${milesShort(L.half.value)}. Exhibit B's nearest edge is ${ftShort(B.distanceFt)} from the nearest entrance.`,
      'outer-band': `The band from ${milesShort(L.quarter.value)} to ${milesShort(L.half.value)} counts in cities of at least ${num(L.pop.value)} people.`,
      'eligibility-tint': 'Parcels by zoning class, from City of Berkeley zoning.',
      'no-exclusions': `Berkeley took no exemption, exclusion, or alternative plan (as of ${date(data.localOptions.berkeley.source.date)}).`,
      'bay-area-options': 'Three Bay Area cities, three positions under SB 79.',
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
      preview: `At least ${ftShort(B.floors.heightFt)}, if the project meets SB 79's conditions`,
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
    captions: {
      ghost: `${B.address}. Pale: what Berkeley's zoning allows, ${ftShort(B.localHeightFt)}.`,
      'preview-rise': `Preview: Berkeley must allow at least ${ftShort(B.floors.heightFt)}.`,
      'height-rise': `Height: local limit ${ftShort(B.localHeightFt)}; SB 79 floor ${ftShort(B.floors.heightFt)}.`,
      'unit-fill': `Density: ${duac(B.floors.densityDuPerAcre)} × ${num(B.acres, 3)} acres = ${num(B.unitFloor, 2)} units, unrounded.`,
      'plate-stack': `Residential FAR: ${far(B.floors.residentialFar)} × ${sqftShort(B.lotSqFt)} = ${sqftShort(B.residentialFloorAreaSqFt)}. Plates drawn at full lot coverage.`,
      'setback-cannot-preclude': 'A local setback applies only so far as it does not prevent the SB 79 standards. Illustrative.',
      collapse: 'Counterfactual: one failed condition, and local zoning governs.',
      'bonus-locked-height': 'Density bonus: more units on the SB 79 base; no added height owed.',
      'contrast-three-heights': `${contrast.address}, Oakland: the SB 79 floor, Oakland's limit, and the proposed towers.`,
      'exhibit-comparison': 'Exhibits A, B, and C: the standards step down with distance.',
      final: `${B.address}: what Berkeley must allow.`,
    },
  };
}

// ---------------------------------------------------------------- checklist

function buildChecklist(): ChecklistData {
  const c = L.cond, a = L.aff, anti = L.anti.rentControlledSite;
  const inc = data.inclusionary;
  const reached = B.units > anti.moreThanUnits.value;
  return {
    title: 'What the project must do',
    cards: [
      { id: 'min-units', title: 'Units', text: `At least ${word(c.minUnits.value)} units`, cite: shortCite(c.minUnits.cite), status: 'tick' },
      { id: 'min-density', title: 'Density', text: `At least ${duac(c.minDensityDuPerAcre.value)}, or the local minimum if higher`, cite: shortCite(c.minDensityDuPerAcre.cite), status: 'tick' },
      { id: 'unit-size', title: 'Unit size', text: `Average no more than ${num(c.maxAverageUnitSizeNetSqFt.value)} net habitable sq ft`, cite: shortCite(c.maxAverageUnitSizeNetSqFt.cite), status: 'tick' },
      { id: 'affordability', title: 'Affordability', text: `Over ${word(a.appliesAboveUnits.value)} units: one of SB 79's options, or Berkeley's stricter rule`, cite: shortCite(`${parentCite(a.options.extremelyLow.cite, 2)}; ${a.stricterLocalInclusionaryControls.cite}`), status: 'tick' },
      {
        id: 'rent-controlled-site', title: 'Anti-displacement',
        text: `No demolition of tenant-occupied rent-controlled housing on a site of more than ${word(anti.moreThanUnits.value)} units`,
        cite: shortCite(anti.moreThanUnits.cite),
        status: reached ? 'tick' : 'gray',
        ...(reached ? {} : { note: `The site holds ${B.units === 1 ? 'one home' : `${word(B.units)} units`}: the bar does not reach it.` }),
      },
    ],
    affordability: {
      title: 'Affordable share of units',
      rows: [
        { label: 'SB 79: extremely low income', percent: a.options.extremelyLow.value },
        { label: 'or very low income', percent: a.options.veryLow.value },
        { label: 'or lower income', percent: a.options.lower.value },
        {
          label: `Berkeley (${inc.section})`,
          percent: inc.percentOfUnits.value,
          deeper: { label: 'very low income', percent: (inc.percentOfUnits.value * inc.veryLowShareOfRequired.value) / 100 },
        },
      ],
      note: `Each square is one percent of units. Berkeley's ${pct(inc.percentOfUnits.value)} governs where stricter.`,
    },
    captions: { 'conditions-tick': 'The conditions that come with the floors.' },
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
  cached ??= { asOf, map: buildMap(), envelope: buildEnvelope(), checklist: buildChecklist(), timeline: buildTimeline() };
  return cached;
}

/** Exposed for tests. */
export const frame = { origin: ORIGIN, site, quarterFt, reachFt };
