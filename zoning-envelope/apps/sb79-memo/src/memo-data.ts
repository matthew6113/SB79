/**
 * Every number the memo shows, assembled from @zoning-envelope/law and the
 * frozen snapshots in data/. memo.mdx reads only from here (CLAUDE.md rule 1);
 * nothing below is a hand-typed legal value.
 */
import { evaluateSite, lawAsOf, sqFtToAcres, type BandId, type CitedLeaf, type Evaluation } from '@zoning-envelope/law';
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
import { memoConfig } from './memo.config';
import { address, num } from './format';
import type { CalcForm } from './calculator/model';

/** The memo speaks as of the data snapshot's date (the letterhead date). */
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
  intens: law.adjacencyIntensifier,
  cond: law.conditions,
  aff: law.affordability,
  anti: law.antiDisplacement,
  parkSite: need(law.antiDisplacement.parkSite, 'antiDisplacement.parkSite'),
  labor: law.labor,
  bonus: law.densityBonus,
  mayNotPrevent: need(law.localStandards.mayNotPrevent, 'localStandards.mayNotPrevent'),
  approval: law.approval,
  operative: law.operative.cities,
  map: law.mapPresumption,
  options: law.cityOptions,
  amendments: [law.acts.ab2576, law.acts.sb1361],
} as const;

/** Numbers the memo derives (shown so the arithmetic is visible). */
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

/** The calculator opens on Exhibit B's facts (a project left blank). */
export const calcDefaults: CalcForm = {
  tier: B.tier,
  where: 'distance',
  distanceFt: String(B.distanceFt),
  band: B.band,
  cityPopulation: num(data.population.mtc),
  lotAreaSqFt: num(B.lotSqFt),
  localHeightFt: String(B.localHeightFt),
  existingUnits: String(B.units),
  rentControlledTenants: false,
  units: '',
  averageUnitSizeNetSqFt: '',
  affordableUnits: '',
  affordableLevel: 'veryLow',
  heightFt: '',
};

export type Leaf = CitedLeaf;
