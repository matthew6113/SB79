/**
 * Every number the explainer shows, assembled from @zoning-envelope/law and
 * the frozen snapshots in data/. memo.mdx reads only from here (CLAUDE.md
 * rule 1); nothing below is a hand-typed legal value.
 */
import { evaluateSite, floorsFor, lawAsOf, sqFtToAcres, type BandId, type CitedLeaf, type Evaluation, type Tier } from '@zoning-envelope/law';
import manifest from '../data/manifest.json';
import exhibits from '../data/exhibit-candidates.json';
import accessPoints from '../data/tod-access-points.geojson?raw';
import population from '../data/population.json';
import counties from '../data/urban-transit-counties.json';
import zoning from '../data/berkeley-zoning-standards.json';
import localOptions from '../data/local-options.json';
import opportunityMeta from '../data/opportunity-areas.meta.json';
import inclusionary from '../data/berkeley-inclusionary.json';
import rockSite from '../data/rockridge/site.json';
import rockZoning from '../data/rockridge/oakland-zoning.json';
import rockProject from '../data/rockridge/project.json';
import rockOrdinance from '../data/rockridge/oakland-ordinance.json';
import altPlans from '../data/explainer/alternative-plans.json';
import hazards from '../data/explainer/hazards.json';
import landmarks from '../data/explainer/landmarks.json';
import rentControl from '../data/explainer/rent-control.json';
import firms from '../data/explainer/law-firm-memos.json';
import bartParcels from '../data/explainer/bart-ab2923-parcels.geojson?raw';
import bartParcelsMeta from '../data/explainer/bart-ab2923-parcels.meta.json';
import sfZonesMeta from '../data/explainer/sf-tod-zones.meta.json';
import bartStationsRaw from '../data/explainer/bart-stations.geojson?raw';
import jurisdictionsRaw from '../data/jurisdictions.geojson?raw';
import { pointInPolygon } from '@zoning-envelope/engine';
import { parcelCounts } from './parcel-classes';
import { pointDistanceFt, polygonsFt, projectFt } from '../scripts/lib/geo.ts';
import { memoConfig } from './memo.config';
import { address } from './format';

/** The explainer speaks as of the data snapshot's date (the header date). */
export const asOf = manifest.asOf;
export const law = lawAsOf(asOf);
/** The law as the January 1, 2027 amendments leave it, for notes on what changes. */
export const nextLaw = lawAsOf(law.acts.ab2576.effective.value);

function need<T>(x: T | undefined, what: string): T {
  if (x === undefined) throw new Error(`${what} is not in force on ${asOf}`);
  return x;
}

const tierOf = new Map(
  (JSON.parse(accessPoints) as { features: { properties: { access_id: string; ranked_tod_tier: string } }[] }).features.map((f) => [
    f.properties.access_id,
    f.properties.ranked_tod_tier === 'Tier 1' ? (1 as const) : (2 as const),
  ]),
);

type Candidate = (typeof exhibits)['A'][number];
/** Opportunity-map categories that count as high-resource (§ 65912.156(f)), lowercased. */
const highResource = new Set(law.definitions.highResourceArea.value.map((v) => v.toLowerCase()));

function exhibit(key: 'A' | 'B' | 'C') {
  const apn = memoConfig.exhibits[key];
  const c = (exhibits[key] as Candidate[]).find((x) => x.apn === apn);
  if (!c) throw new Error(`Exhibit ${key}: APN ${apn} is not among the candidates in data/exhibit-candidates.json`);
  const tier = tierOf.get(c.nearestAccessPoint.id);
  if (!tier) throw new Error(`Exhibit ${key}: unknown access point ${c.nearestAccessPoint.id}`);
  const site = {
    urbanTransitCounty: counties.counties.includes('Alameda'),
    tier,
    distanceFt: c.nearestAccessPoint.distanceFt,
    cityPopulation: population.mtcAcs.value,
    zoningClass: c.zoningClass as 'residential' | 'mixed-use' | 'commercial',
    localOptOut: localOptions.berkeley.status === 'defaults' ? ('none' as const) : ('exclusion' as const),
    lotAreaSqFt: c.lotSizeSqFt,
    localHeightLimitFt: c.localHeightFt as number,
    highResourceArea: c.opportunity ? highResource.has(c.opportunity.category.toLowerCase()) : false,
  };
  const ev: Evaluation = evaluateSite(site, { asOf });
  if (!ev.floors || !ev.unitFloor || ev.residentialFloorAreaSqFt === null || !ev.labor) throw new Error(`Exhibit ${key}: SB 79 floors do not apply`);
  return {
    key,
    apn,
    address: address(c.address),
    lotSqFt: c.lotSizeSqFt,
    acres: sqFtToAcres(c.lotSizeSqFt),
    district: c.district as string,
    districtName: c.districtName as string,
    localHeightFt: c.localHeightFt as number,
    units: c.units as number,
    yearBuilt: c.yearBuilt as number,
    use: c.use as string,
    tier,
    distanceFt: c.nearestAccessPoint.distanceFt,
    accessPointId: c.nearestAccessPoint.id,
    nearestIsElevator: c.nearestAccessPoint.isElevator,
    distanceWithoutElevatorFt: c.nearestNonElevatorAccessPoint.distanceFt,
    bandWithoutElevator: c.nearestNonElevatorAccessPoint.band as BandId | null,
    band: ev.band as BandId,
    opportunity: c.opportunity?.category ?? null,
    floors: { heightFt: ev.floors.heightFt.value, densityDuPerAcre: ev.floors.densityDuPerAcre.value, residentialFar: ev.floors.residentialFar.value },
    unitFloor: ev.unitFloor.value,
    residentialFloorAreaSqFt: ev.residentialFloorAreaSqFt,
    laborTriggered: ev.labor.triggered,
    heightGainFt: ev.floors.heightFt.value - (c.localHeightFt as number),
    evaluation: ev,
  };
}

export const A = exhibit('A');
export const B = exhibit('B');
export const C = exhibit('C');

const std = law.standards.tier1;
/** Shorthand for the provisions the prose cites most. */
export const L = {
  utc: law.definitions.urbanTransitCountyMoreThanRailStations,
  tier1: law.definitions.tier1,
  tier2: law.definitions.tier2,
  adjacent: law.definitions.adjacentWithin,
  highResource: law.definitions.highResourceArea,
  nhsf: law.definitions.netHabitableSquareFootage,
  rfar: law.definitions.residentialFloorAreaRatio,
  zoning: law.eligibility.qualifyingZoning,
  measure: law.eligibility.distanceMeasurement,
  pop: law.eligibility.outerBandMinCityPopulation.tier1,
  quarter: law.bands.quarterMile.tier1,
  half: law.bands.halfMile.tier1,
  q: std.quarterMile,
  h: std.halfMile,
  /** Tier 2 standards, for the standards table. */
  t2q: law.standards.tier2.quarterMile,
  t2h: law.standards.tier2.halfMile,
  intens: law.adjacencyIntensifier,
  cond: law.conditions,
  aff: law.affordability,
  anti: law.antiDisplacement,
  parkSite: need(law.antiDisplacement.parkSite, 'antiDisplacement.parkSite'),
  labor: law.labor,
  bonus: law.densityBonus,
  mayNotPrevent: need(law.localStandards.mayNotPrevent, 'localStandards.mayNotPrevent'),
  approval: law.approval,
  streamlining: law.streamlining,
  agencyLand: law.transitAgencyLand,
  operative: law.operative.cities,
  map: law.mapPresumption,
  options: law.cityOptions,
  historicExclusion: need(law.cityOptions.exclusions.historicSites, 'cityOptions.exclusions.historicSites'),
  amendments: [law.acts.ab2576, law.acts.sb1361],
} as const;

/**
 * The standards table: what the city must allow for each stop tier and
 * distance band (§ 65912.157(a)(3)-(6), with the adjacency intensifier in the
 * band within 200 feet), computed as evaluateSite computes them.
 */
export const BANDS = ['adjacent', 'quarterMile', 'halfMile'] as const satisfies readonly BandId[];
export const TIERS = [1, 2] as const satisfies readonly Tier[];
export const standards = TIERS.map((tier) => ({ tier, rows: BANDS.map((band) => ({ band, floors: floorsFor(law, tier, band) })) }));
const allFloors = standards.flatMap((t) => t.rows.map((r) => r.floors));
/** The lowest and highest floors in the table, for the key points. */
export const range = {
  heightFt: { min: Math.min(...allFloors.map((f) => f.heightFt.value)), max: Math.max(...allFloors.map((f) => f.heightFt.value)) },
  densityDuPerAcre: { min: Math.min(...allFloors.map((f) => f.densityDuPerAcre.value)), max: Math.max(...allFloors.map((f) => f.densityDuPerAcre.value)) },
};

/** Feet per meter, for the hazard queries run in meters (a unit conversion, not law). */
const FT_PER_M = 3.28084;
const FT_PER_MILE = 5280;
const stationLonLat = manifest.center.lonLat as [number, number];
const bartAb2923 = (JSON.parse(bartParcels) as { features: { properties: { ab2923: string; acres: number; station: string } }[] }).features
  .filter((f) => f.properties.ab2923 === 'Yes' && f.properties.station === 'North Berkeley');

const berkeleyLimits = (JSON.parse(jurisdictionsRaw) as { features: { properties: { name: string }; geometry: Parameters<typeof polygonsFt>[0] }[] }).features
  .find((f) => f.properties.name === 'Berkeley');
if (!berkeleyLimits) throw new Error('Berkeley missing from data/jurisdictions.geojson');
const berkeleyStations = (JSON.parse(bartStationsRaw) as { features: { properties: { Station: string }; geometry: { coordinates: number[] } }[] }).features
  .filter((f) => polygonsFt(berkeleyLimits.geometry).some((poly) => pointInPolygon(projectFt(f.geometry.coordinates), poly)))
  .map((f) => f.properties.Station);
const source = (s: { title: string; url: string; date?: string }) => s;
const firmSource = (f: { publisher: string; title: string; date: string; url: string }) => ({ title: `${f.publisher}, “${f.title}”`, date: f.date, url: f.url });

/** The explainer's map beyond North Berkeley's parcels: cities' plans, hazards, landmarks, rent control, BART land. */
export const explainer = {
  berkeleyStations,
  sources: {
    coblentz: firmSource(firms.coblentz),
    hollandKnight: firmSource(firms.hollandKnight),
    hcdSf: altPlans.sanFrancisco.hcd.source,
    hcdBh: altPlans.beverlyHills.hcd.source,
    sfBulletin: altPlans.sanFrancisco.noDefaults.source,
    sfExec: altPlans.sanFrancisco.capacity.source,
    sfOrdinance: altPlans.sanFrancisco.ordinance.source,
    lawsuit: altPlans.sanFrancisco.lawsuit.source,
    calfire: source({ title: hazards.fire.lra.title, url: hazards.fire.lra.url }),
    calfireSra: source({ title: hazards.fire.sra.title, url: hazards.fire.sra.url }),
    aluc: source({ title: hazards.airport.title, url: hazards.airport.url }),
    landmarks: landmarks.source,
    rso: rentControl.newConstruction.source,
  },
  altPlans,
  firms,
  sfZonesSource: { title: 'San Francisco Planning, SB 79 zones (copy of MTC\'s map)', url: sfZonesMeta.source },
  hazards: {
    ...hazards,
    fireRadiusFt: hazards.fire.lra.radiusM * FT_PER_M,
    airportMiles: pointDistanceFt(stationLonLat, [stationLonLat[0], hazards.airport.northernmostLatitude]) / FT_PER_MILE,
  },
  landmarks,
  rentControl,
  parcels: parcelCounts,
  bart: {
    count: bartAb2923.length,
    acres: bartAb2923.reduce((s, f) => s + f.properties.acres, 0),
    source: { title: 'BART, AB 2923 parcels', url: bartParcelsMeta.source },
  },
};

/** The project-condition and affordability arithmetic for Exhibit B (no legal values: products of the law's numbers and the lot). */
const wholeUnits = Math.floor(B.unitFloor);
const nextUnits = L.aff.appliesAboveUnits.value + 1;
const berkeleyShare = (n: number) => Math.ceil((n * inclusionary.percentOfUnits.value) / 100);
export const project = {
  /** Units the minimum density gives on this lot. */
  minDensityUnits: L.cond.minDensityDuPerAcre.value * B.acres,
  /** Units needed to use all the residential floor area at the largest average unit size allowed. */
  unitsToFillFloorArea: B.residentialFloorAreaSqFt / L.cond.maxAverageUnitSizeNetSqFt.value,
  /** Whole units at the unit floor, if the fraction rounds down. */
  wholeUnits,
  sb79AffordabilityAtFloor: wholeUnits > L.aff.appliesAboveUnits.value,
  /** Berkeley's inclusionary share, rounded up as the ordinance says, and its very-low-income part. */
  berkeleyAtFloor: berkeleyShare(wholeUnits),
  berkeleyVeryLowAtFloor: Math.ceil((berkeleyShare(wholeUnits) * inclusionary.veryLowShareOfRequired.value) / 100),
  /** The smallest project SB 79's own rule reaches, and what each option and Berkeley's rule would require there. */
  nextUnits,
  sb79AtNext: {
    extremelyLow: (nextUnits * L.aff.options.extremelyLow.value) / 100,
    veryLow: (nextUnits * L.aff.options.veryLow.value) / 100,
    lower: (nextUnits * L.aff.options.lower.value) / 100,
  },
  berkeleyAtNext: berkeleyShare(nextUnits),
};

/** Numbers the explainer derives (shown so the arithmetic is visible). */
export const derived = {
  /** One more than the anti-displacement threshold: the smallest site that trips (h)(1). */
  rentControlledSiteUnits: L.anti.rentControlledSite.moreThanUnits.value + 1,
  utcCountyCount: counties.counties.length,
};

export const data = {
  population: {
    mtc: population.mtcAcs.value,
    mtcVintage: population.mtcAcs.vintage,
    census: population.census2020.value,
    censusVintage: population.census2020.vintage,
  },
  counties,
  zoningSource: zoning.source,
  localOptions,
  inclusionary,
  districts: zoning.districts as Record<string, { class: string; heightFt: number }>,
  opportunityMap: { title: 'CTCAC/HCD Opportunity Map', url: opportunityMeta.source },
  mtcMap: { title: 'MTC, Senate Bill 79 regional map', url: 'https://mtc.ca.gov/planning/land-use/senate-bill-79-regional-map' },
  mtcPopulationSource: { title: 'MTC, SB 79 map jurisdiction populations', url: population.mtcAcs.source },
  censusSource: { title: 'U.S. Census Bureau', url: population.census2020.source },
};

export const contrast = {
  address: address(String(rockZoning.s8.address)),
  distanceFt: rockSite.nearestAccessPoint.distanceFt,
  band: rockSite.band as BandId,
  sb79HeightFt: need(rockSite.sb79, 'contrast SB 79 floors').heightFt,
  localHeightFt: rockZoning.heightArea.maxHeightFt,
  baseZone: rockZoning.baseZone.zone,
  towerHeightsFt: rockProject.facts.towerHeightsFt.value,
  units: rockProject.facts.units.value,
  preliminaryApplication: rockProject.facts.preliminaryApplication.value,
  formalApplication: rockProject.facts.formalApplication.value,
  project: rockProject,
  ordinance: rockOrdinance,
  sources: {
    height: { title: 'City of Oakland GIS, Height – Commercial Corridor', url: rockZoning.heightArea.source },
    s8: { title: 'City of Oakland GIS, S-8 combining zone (SB 79)', url: rockZoning.s8.source },
    piedmont: { title: 'Piedmont Exedra, State laws may make Oakland’s Rockridge Trader Joe’s housing project hard to stop', url: 'https://piedmontexedra.com/2026/07/state-laws-may-make-oaklands-rockridge-trader-joes-housing-project-hard-to-stop' },
    factSheet: { title: 'Upper Broadway Advocates, 5727 College Avenue fact sheet', url: 'https://ubaoakland.org/projects/two-towers/' },
    sfYimby: { title: 'SF YIMBY, Reduced height and increased retail for Rockridge tower', url: 'https://sfyimby.com/2026/08/reduced-height-and-increased-retail-for-rockridge-tower-oakland.html' },
    ordinance: { title: `Oakland Ordinance ${rockOrdinance.enactmentNumber}`, date: rockOrdinance.passed, url: localOptions.oakland.source.url },
  },
};

export type Leaf = CitedLeaf;
