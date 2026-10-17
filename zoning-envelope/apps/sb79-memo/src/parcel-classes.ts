/**
 * Every parcel near North Berkeley BART, classified once for the map and the
 * text: its SB 79 band, zoning district and class, BART ownership, the
 * rent-control estimate, and Berkeley landmark status. Built from the frozen
 * snapshots in data/ and from sb79.json; no legal value is typed here.
 */
import { distancePointToPolygon, pointInPolygon, polygonArea, type Point, type Polygon } from '@zoning-envelope/engine';
import { lawAsOf, milesToFeet, type BandId } from '@zoning-envelope/law';
import { polygonsFt, projectFt } from '../scripts/lib/geo.ts';
import type { Feature, FeatureCollection } from '../scripts/lib/arcgis.ts';
import parcelsRaw from '../data/parcels.geojson?raw';
import zoningRaw from '../data/zoning.geojson?raw';
import accessRaw from '../data/tod-access-points.geojson?raw';
import zoningStandards from '../data/berkeley-zoning-standards.json';
import landmarks from '../data/explainer/landmarks.json';
import rentControl from '../data/explainer/rent-control.json';
import manifest from '../data/manifest.json';

const law = lawAsOf(manifest.asOf);
const parse = (raw: string) => (JSON.parse(raw) as FeatureCollection).features;

export type ZoningClass = 'residential' | 'mixed' | 'commercial' | 'other';
export interface ParcelClass {
  apn: string;
  feature: Feature;
  polys: Polygon[];
  /** A point inside the parcel's largest piece. */
  probe: Point;
  units: number;
  yearBuilt: number | null;
  /** Straight line from the parcel's nearest edge to the nearest MTC access point (Gov. Code § 65912.157(b)). */
  distanceFt: number;
  band: BandId | null;
  /** Inside the zoning snapshot's radius (data/manifest.json), so its district is known. */
  inSnapshot: boolean;
  district: string | null;
  zoningClass: ZoningClass | null;
  /** Zoned residential, mixed, or commercial (Gov. Code § 65912.157(a)). */
  qualifyingZoning: boolean;
  bart: boolean;
  /** More than two units, built in or before the rent ordinance's new-construction cutoff year: an estimate. */
  rentEstimate: boolean;
  landmark: 'Landmark' | 'Structure of Merit' | null;
}

const ring0 = (p: Polygon) => p.outer;
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

const zoning = parse(zoningRaw).map((f) => ({ district: String(f.properties.district), polys: polygonsFt(f.geometry!) }));
const districts = zoningStandards.districts as Record<string, { class: ZoningClass; heightFt: number }>;
const accessFt = parse(accessRaw).map((f) => projectFt((f.geometry as { coordinates: number[] }).coordinates));
const stationFt = projectFt(manifest.center.lonLat);
const adjacentFt = law.definitions.adjacentWithin.value;
const quarterFt = milesToFeet(law.bands.quarterMile.tier1.value);
const halfFt = milesToFeet(law.bands.halfMile.tier1.value);
const landmarkOf = new Map(landmarks.records.map((r) => [r.apn, r.type as 'Landmark' | 'Structure of Merit']));
const moreThanUnits = law.antiDisplacement.rentControlledSite.moreThanUnits.value;

export const parcelClasses: ParcelClass[] = parse(parcelsRaw).filter((f) => f.geometry).map((f) => {
  const polys = polygonsFt(f.geometry!);
  const big = polys.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
  let probe = centroid(ring0(big));
  if (!pointInPolygon(probe, big)) probe = big.outer[0]!;
  const distanceFt = Math.min(...accessFt.map((a) => Math.min(...polys.map((p) => distancePointToPolygon(a, p)))));
  const band: BandId | null = distanceFt <= adjacentFt ? 'adjacent' : distanceFt <= quarterFt ? 'quarterMile' : distanceFt <= halfFt ? 'halfMile' : null;
  const inSnapshot = Math.hypot(probe[0] - stationFt[0], probe[1] - stationFt[1]) <= manifest.radiusFt;
  const district = inSnapshot ? zoning.find((z) => z.polys.some((p) => pointInPolygon(probe, p)))?.district ?? null : null;
  const zoningClass = district ? districts[district]?.class ?? null : null;
  const units = Number(f.properties.units ?? 0);
  const yearBuilt = Number(f.properties.yearBuilt) > 0 ? Number(f.properties.yearBuilt) : null;
  const apn = String(f.properties.apn);
  return {
    apn, feature: f, polys, probe, units, yearBuilt, distanceFt, band, inSnapshot, district, zoningClass,
    qualifyingZoning: !!zoningClass && (law.eligibility.qualifyingZoning.value as readonly string[]).includes(zoningClass),
    bart: f.properties.ownerClass === 'BART',
    rentEstimate: units > moreThanUnits && yearBuilt !== null && yearBuilt <= rentControl.estimate.lastYearBuilt,
    landmark: landmarkOf.get(apn) ?? null,
  };
});

/** Parcels in the half-mile band whose district the snapshot knows: the map's subject. */
export const inBand = parcelClasses.filter((p) => p.band && p.inSnapshot);

export const parcelCounts = {
  inBand: inBand.length,
  qualifyingZoning: inBand.filter((p) => p.qualifyingZoning).length,
  otherZoning: inBand.filter((p) => !p.qualifyingZoning).length,
  bart: inBand.filter((p) => p.bart).length,
  rentEstimate: inBand.filter((p) => p.rentEstimate).length,
  /** More than two units with no year built in the city's layer: left out of the estimate. */
  rentUnknownYear: inBand.filter((p) => p.units > moreThanUnits && p.yearBuilt === null).length,
  landmark: inBand.filter((p) => p.landmark === 'Landmark').length,
  structureOfMerit: inBand.filter((p) => p.landmark === 'Structure of Merit').length,
  /** Qualifying zoning, not BART land, and none of the map's flags. */
  clear: inBand.filter((p) => p.qualifyingZoning && !p.bart && !p.rentEstimate && !p.landmark).length,
};
