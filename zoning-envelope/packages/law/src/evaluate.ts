/**
 * evaluateSite: SB 79 applied to one site, step by step, in the order of
 * SB79_SPEC.md "How the law decides". Every number comes from sb79.json via
 * lawAsOf(); this file holds no legal values of its own.
 *
 * Steps 1–5 decide whether the site is reached at all. Step 6 checks the
 * project's conditions; with no project facts it is "pending", and the answer
 * is the floors the city must allow if the project meets those conditions.
 */
import { lawAsOf, type LawAsOf } from './resolve.ts';
import type { CitedLeaf } from './schema.ts';
import { milesToFeet, sqFtToAcres } from './units.ts';

export type Tier = 1 | 2;
export type BandId = 'adjacent' | 'quarterMile' | 'halfMile';
export type ZoningClass = 'residential' | 'mixed-use' | 'commercial' | 'industrial' | 'open-space' | 'other';
export type LocalOptOut = 'none' | 'exemption' | 'exclusion' | 'alternative-plan';

export interface ProjectInputs {
  units: number;
  averageUnitSizeNetSqFt: number;
  /** Proposed building height; the labor test uses it, or the height floor if omitted. */
  heightFt?: number;
  /** Local zoning's minimum density, if any (§ 65912.157(a)(1)(B)). */
  localMinDensityDuPerAcre?: number;
  /** Units restricted to each income level. */
  affordableUnits?: { extremelyLow?: number; veryLow?: number; lower?: number };
  includesTransientLodging?: boolean;
  /** Airport, military, and fire standards (§ 65912.157(j)); unknown if omitted. */
  meetsSafetyStandards?: boolean;
}

export interface ExistingSite {
  /** Dwelling units on the site now. */
  units: number;
  /** The project would demolish rent- or price-controlled housing that tenants occupied within the lookback period. */
  demolishesTenantOccupiedRentControlledHousing: boolean;
  /** Units demolished within the lookback period before the application, if any. */
  priorDemolition?: { units: number; includedRentControlled: boolean };
  /** Site governed by mobilehome, RV, or special occupancy park law. */
  parkSite?: boolean;
}

export interface SiteInputs {
  urbanTransitCounty: boolean;
  tier: Tier;
  /** Straight-line distance from the parcel's nearest edge to the nearest pedestrian access point. Give this or `band`. */
  distanceFt?: number;
  band?: BandId;
  cityPopulation: number;
  zoningClass: ZoningClass;
  localOptOut: LocalOptOut;
  lotAreaSqFt: number;
  /** For the ghost envelope only; SB 79 floors do not depend on it. */
  localHeightLimitFt?: number;
  highResourceArea?: boolean;
  project?: ProjectInputs;
  existingSite?: ExistingSite;
}

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'pending';
export interface Step {
  n: number;
  test: string;
  status: StepStatus;
  reason: string;
  cite: string;
}

export type ConditionStatus = 'pass' | 'fail' | 'not-evaluated' | 'not-applicable';
export interface Condition {
  id: string;
  label: string;
  status: ConditionStatus;
  detail: string;
  cite: string;
}

export interface Floor {
  value: number;
  unit: string;
  cite: string;
  /** For the adjacent band: the base standard and the intensifier that add up to the value. */
  parts?: { value: number; cite: string }[];
}

export type Outcome = 'not-yet-operative' | 'local-rules' | 'floors-apply' | 'floors-apply-if-conditions-met';

export interface Evaluation {
  asOf: string;
  outcome: Outcome;
  summary: string;
  steps: Step[];
  band: BandId | null;
  floors: { heightFt: Floor; densityDuPerAcre: Floor; residentialFar: Floor } | null;
  /** Density floor x lot area in acres, unrounded: how SB 79 rounds is an open issue. */
  unitFloor: { value: number; note: string } | null;
  residentialFloorAreaSqFt: number | null;
  conditions: Condition[];
  labor: { overFt: number; heightFt: number; triggered: boolean; cite: string } | null;
  densityBonus: { thresholdDuPerAcre: number; proposedDuPerAcre: number | null; met: boolean | null; cite: string } | null;
  denialPresumption: { beginsOn: string; inEffect: boolean; applies: boolean | null; cite: string };
}

const ROUNDING_NOTE =
  'Unrounded. Chapter 4.1.5 has no rounding rule for the base standards; how fractional units round is an open issue.';

/** 0.25 -> "1/4", 0.5 -> "1/2" for the step labels; any other value prints as a decimal. */
const miles = (m: number) => (m === 0.25 ? '1/4' : m === 0.5 ? '1/2' : String(m));
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Drop the last `levels` pinpoint segments: parentCite('§ 1(a)(1)', 1) -> '§ 1(a)'. */
export const parentCite = (cite: string, levels: number) => cite.replace(new RegExp(`(\\([0-9A-Za-z]+\\)){${levels}}$`), '');

function bandFor(law: LawAsOf, tier: Tier, distanceFt: number): BandId | null {
  const key = tier === 1 ? 'tier1' : 'tier2';
  if (distanceFt < 0 || !Number.isFinite(distanceFt)) throw new Error(`distanceFt must be finite and >= 0, got ${distanceFt}`);
  if (distanceFt <= law.definitions.adjacentWithin.value) return 'adjacent';
  if (distanceFt <= milesToFeet(law.bands.quarterMile[key].value)) return 'quarterMile';
  if (distanceFt <= milesToFeet(law.bands.halfMile[key].value)) return 'halfMile';
  return null;
}

function floorsFor(law: LawAsOf, tier: Tier, band: BandId): NonNullable<Evaluation['floors']> {
  const s = law.standards[tier === 1 ? 'tier1' : 'tier2'][band === 'halfMile' ? 'halfMile' : 'quarterMile'];
  const floor = (base: CitedLeaf<number>, add?: CitedLeaf<number>): Floor =>
    add
      ? { value: base.value + add.value, unit: base.unit ?? '', cite: `${base.cite}; ${add.cite}`, parts: [base, add].map((l) => ({ value: l.value, cite: l.cite })) }
      : { value: base.value, unit: base.unit ?? '', cite: base.cite };
  const i = band === 'adjacent' ? law.adjacencyIntensifier : undefined;
  return {
    heightFt: floor(s.heightLimitAtLeastFt, i?.heightAddFt),
    densityDuPerAcre: floor(s.maxDensityAtLeastDuPerAcre, i?.densityAddDuPerAcre),
    residentialFar: floor(s.residentialFarNotPrecludedUpTo, i?.residentialFarAdd),
  };
}

function projectConditions(law: LawAsOf, site: SiteInputs): Condition[] {
  const p = site.project;
  const c = law.conditions;
  const a = law.affordability;
  const d = law.antiDisplacement;
  const notEvaluated = (id: string, label: string, cite: string, detail = 'No project facts given.'): Condition =>
    ({ id, label, status: 'not-evaluated', detail, cite });

  const out: Condition[] = [];
  if (!p) {
    out.push(notEvaluated('min-units', 'At least the minimum number of units', c.minUnits.cite));
    out.push(notEvaluated('min-density', 'Minimum density', c.minDensityDuPerAcre.cite));
    out.push(notEvaluated('unit-size', 'Average unit size', c.maxAverageUnitSizeNetSqFt.cite));
    out.push(notEvaluated('use', 'Housing, no transient lodging', law.definitions.housingDevelopmentProjectExcludesTransientLodging.cite));
    out.push(notEvaluated('affordability', 'Affordable units', parentCite(a.options.extremelyLow.cite, 2)));
  } else {
    const acres = sqFtToAcres(site.lotAreaSqFt);
    const density = p.units / acres;
    const minDensity = Math.max(c.minDensityDuPerAcre.value, p.localMinDensityDuPerAcre ?? 0);
    out.push({
      id: 'min-units', label: 'At least the minimum number of units',
      status: p.units >= c.minUnits.value ? 'pass' : 'fail',
      detail: `${p.units} units proposed; at least ${c.minUnits.value} required.`, cite: c.minUnits.cite,
    });
    out.push({
      id: 'min-density', label: 'Minimum density',
      status: density >= minDensity ? 'pass' : 'fail',
      detail: `${fmt(density)} du/ac proposed; at least ${fmt(minDensity)} du/ac required (the greater of ${c.minDensityDuPerAcre.value} du/ac or the local minimum).`,
      cite: p.localMinDensityDuPerAcre ? `${c.minDensityDuPerAcre.cite}; ${c.localMinDensityIfGreater.cite}` : c.minDensityDuPerAcre.cite,
    });
    out.push({
      id: 'unit-size', label: 'Average unit size',
      status: p.averageUnitSizeNetSqFt <= c.maxAverageUnitSizeNetSqFt.value ? 'pass' : 'fail',
      detail: `${fmt(p.averageUnitSizeNetSqFt)} net habitable sq ft average; at most ${fmt(c.maxAverageUnitSizeNetSqFt.value)} allowed.`,
      cite: c.maxAverageUnitSizeNetSqFt.cite,
    });
    out.push({
      id: 'use', label: 'Housing, no transient lodging',
      status: p.includesTransientLodging ? 'fail' : 'pass',
      detail: p.includesTransientLodging ? 'Part of the project is transient lodging.' : 'No transient lodging proposed.',
      cite: law.definitions.housingDevelopmentProjectExcludesTransientLodging.cite,
    });

    // Units at a deeper income level are counted toward the shallower options
    // too (extremely low income households are also very low and lower income).
    const au = p.affordableUnits ?? {};
    const eli = au.extremelyLow ?? 0;
    const vli = eli + (au.veryLow ?? 0);
    const li = vli + (au.lower ?? 0);
    const share = (n: number) => (100 * n) / p.units;
    const o = a.options;
    const met = share(eli) >= o.extremelyLow.value || share(vli) >= o.veryLow.value || share(li) >= o.lower.value;
    out.push(
      p.units <= a.appliesAboveUnits.value
        ? { id: 'affordability', label: 'Affordable units', status: 'not-applicable', detail: `Not required for ${a.appliesAboveUnits.value} units or fewer.`, cite: a.appliesAboveUnits.cite }
        : {
            id: 'affordability', label: 'Affordable units', status: met ? 'pass' : 'fail',
            detail:
              `Needs ${o.extremelyLow.value}% extremely low, ${o.veryLow.value}% very low, or ${o.lower.value}% lower income. ` +
              `Proposed: ${fmt(share(eli))}% / ${fmt(share(vli))}% / ${fmt(share(li))}% (deeper levels counted toward shallower). ` +
              'A stricter local inclusionary rule applies instead.',
            cite: `${parentCite(o.extremelyLow.cite, 2)}; ${a.stricterLocalInclusionaryControls.cite}`,
          },
    );
  }

  // Anti-displacement depends on the existing site, not the project.
  const e = site.existingSite;
  if (!e) {
    out.push(notEvaluated('rent-controlled-site', 'No demolition of tenant-occupied rent-controlled housing', d.rentControlledSite.moreThanUnits.cite, 'No facts about the existing site given.'));
  } else {
    const r = d.rentControlledSite;
    const barred = e.units > r.moreThanUnits.value && e.demolishesTenantOccupiedRentControlledHousing;
    out.push({
      id: 'rent-controlled-site', label: 'No demolition of tenant-occupied rent-controlled housing',
      status: barred ? 'fail' : 'pass',
      detail: barred
        ? `The site has ${e.units} units and the project would demolish rent-controlled housing occupied by tenants within the past ${r.tenantLookbackYears.value} years.`
        : `Not barred: the bar needs more than ${r.moreThanUnits.value} units on the site and demolition of rent-controlled housing occupied by tenants within the past ${r.tenantLookbackYears.value} years.`,
      cite: r.moreThanUnits.cite,
    });
    const pd = d.demolishedRentControlledSite;
    const priorBarred = !!e.priorDemolition && e.priorDemolition.units > pd.moreThanUnits.value && e.priorDemolition.includedRentControlled;
    out.push({
      id: 'prior-demolition', label: 'No recent demolition of rent-controlled housing',
      status: priorBarred ? 'fail' : 'pass',
      detail: priorBarred
        ? `More than ${pd.moreThanUnits.value} units, some rent-controlled, were demolished within ${pd.lookbackYears.value} years before the application.`
        : 'No qualifying demolition reported.',
      cite: pd.moreThanUnits.cite,
    });
    if (d.parkSite) {
      out.push({
        id: 'park-site', label: 'Not a mobilehome, RV, or special occupancy park',
        status: e.parkSite ? 'fail' : 'pass',
        detail: e.parkSite ? 'The site is governed by park law.' : 'Not a park site.',
        cite: d.parkSite.cite,
      });
    }
  }

  out.push(
    p?.meetsSafetyStandards === undefined
      ? notEvaluated('safety', 'Airport, military, and fire safety standards', c.safety.cite, 'Not assessed.')
      : { id: 'safety', label: 'Airport, military, and fire safety standards', status: p.meetsSafetyStandards ? 'pass' : 'fail', detail: '', cite: c.safety.cite },
  );
  return out;
}

export function evaluateSite(site: SiteInputs, { asOf }: { asOf: string }): Evaluation {
  const law = lawAsOf(asOf);
  const key = site.tier === 1 ? 'tier1' : 'tier2';
  const dp = law.approval.denialPresumption;
  const denialPresumption = {
    beginsOn: dp.beginsOn.value,
    inEffect: asOf >= dp.beginsOn.value,
    applies: null as boolean | null,
    cite: `${dp.beginsOn.cite}; ${law.definitions.highResourceArea.cite}`,
  };
  const empty = { band: null, floors: null, unitFloor: null, residentialFloorAreaSqFt: null, conditions: [], labor: null, densityBonus: null, denialPresumption };

  if (asOf < law.operative.cities.value) {
    return {
      asOf, outcome: 'not-yet-operative', steps: [], ...empty,
      summary: `SB 79's standards do not apply to cities until ${law.operative.cities.value} (${law.operative.cities.cite}).`,
    };
  }

  const steps: Step[] = [];
  const stop = (reason: string): Evaluation => {
    for (let n = steps.length + 1; n <= 7; n++) steps.push({ n, test: STEP_TESTS[n - 1]!(law, site), status: 'skipped', reason: 'Not reached.', cite: '' });
    return { asOf, outcome: 'local-rules', steps, ...empty, summary: `Local rules govern; SB 79's floors do not apply. ${reason}` };
  };

  // 1. Urban transit county.
  const utc = law.definitions.urbanTransitCountyMoreThanRailStations;
  steps.push({
    n: 1, test: STEP_TESTS[0]!(law, site), status: site.urbanTransitCounty ? 'passed' : 'failed',
    reason: site.urbanTransitCounty ? `The county has more than ${utc.value} passenger rail stations.` : `The county has ${utc.value} or fewer passenger rail stations.`,
    cite: utc.cite,
  });
  if (!site.urbanTransitCounty) return stop('The site is not in an urban transit county.');

  // 2. Within the half mile, measured from the parcel's nearest edge to a pedestrian access point.
  if ((site.band === undefined) === (site.distanceFt === undefined)) throw new Error('Give exactly one of distanceFt or band');
  const band = site.band ?? bandFor(law, site.tier, site.distanceFt!);
  const reach = law.bands.halfMile[key];
  steps.push({
    n: 2, test: STEP_TESTS[1]!(law, site), status: band ? 'passed' : 'failed',
    reason: band
      ? site.distanceFt !== undefined ? `${fmt(site.distanceFt)} ft from the nearest access point: ${BAND_LABEL[band](law, key)}.` : `Band given: ${BAND_LABEL[band](law, key)}.`
      : `${fmt(site.distanceFt!)} ft is beyond ${miles(reach.value)} mile.`,
    cite: `${reach.cite}; ${law.eligibility.distanceMeasurement.cite}`,
  });
  if (!band) return stop(`The site is more than ${miles(reach.value)} mile from a pedestrian access point.`);

  // 3. City population, for the outer band only.
  const pop = law.eligibility.outerBandMinCityPopulation[key];
  if (band === 'halfMile') {
    const ok = site.cityPopulation >= pop.value;
    steps.push({
      n: 3, test: STEP_TESTS[2]!(law, site), status: ok ? 'passed' : 'failed',
      reason: `City population ${fmt(site.cityPopulation)}; the outer band needs at least ${fmt(pop.value)}.`, cite: pop.cite,
    });
    if (!ok) return stop(`The ${BAND_LABEL.halfMile(law, key)} band applies only in cities of at least ${fmt(pop.value)} people.`);
  } else {
    steps.push({ n: 3, test: STEP_TESTS[2]!(law, site), status: 'skipped', reason: `Inside ${miles(law.bands.quarterMile[key].value)} mile, population does not matter.`, cite: pop.cite });
  }

  // 4. Zoning class.
  const zoning = law.eligibility.qualifyingZoning;
  const statutoryClass = site.zoningClass === 'mixed-use' ? 'mixed' : site.zoningClass;
  const zoned = zoning.value.includes(statutoryClass);
  steps.push({
    n: 4, test: STEP_TESTS[3]!(law, site), status: zoned ? 'passed' : 'failed',
    reason: zoned ? `Zoned ${site.zoningClass}.` : `Zoned ${site.zoningClass}; only ${zoning.value.join(', ')} sites qualify.`,
    cite: zoning.cite,
  });
  if (!zoned) return stop(`The site is zoned ${site.zoningClass}.`);

  // 5. Local exemption, exclusion, or alternative plan.
  const opts = law.cityOptions;
  const optCite: Record<Exclude<LocalOptOut, 'none'>, string> = {
    exemption: parentCite(opts.exemptions.noWalkingPathUnderMiles.cite, 1),
    exclusion: opts.exclusions.untilYearsAfterSeventhHousingElement.cite,
    'alternative-plan': opts.alternativePlan.replacesDefaults.cite,
  };
  if (site.localOptOut !== 'none') {
    steps.push({ n: 5, test: STEP_TESTS[4]!(law, site), status: 'failed', reason: `The city's ${site.localOptOut} covers the site.`, cite: optCite[site.localOptOut] });
    return stop(`A local ${site.localOptOut} replaces the defaults${site.localOptOut === 'alternative-plan' ? '; the alternative plan governs' : ''}.`);
  }
  steps.push({ n: 5, test: STEP_TESTS[4]!(law, site), status: 'passed', reason: 'No local exemption, exclusion, or alternative plan covers the site.', cite: `${optCite.exemption}; ${optCite.exclusion}; ${optCite['alternative-plan']}` });

  // 6. Project conditions.
  const conditions = projectConditions(law, site);
  const failed = conditions.filter((c) => c.status === 'fail');
  const open = conditions.filter((c) => c.status === 'not-evaluated');
  const status6: StepStatus = failed.length ? 'failed' : open.length ? 'pending' : 'passed';
  steps.push({
    n: 6, test: STEP_TESTS[5]!(law, site), status: status6,
    reason: failed.length ? `Fails: ${failed.map((c) => c.label.toLowerCase()).join('; ')}.` : open.length ? `Not yet shown: ${open.map((c) => c.label.toLowerCase()).join('; ')}.` : 'All conditions met.',
    cite: parentCite(law.conditions.minUnits.cite, 2),
  });
  if (failed.length) {
    const ev = stop(`The project fails: ${failed.map((c) => `${c.label.toLowerCase()} (${c.cite})`).join('; ')}.`);
    return { ...ev, conditions };
  }

  // 7. Floors.
  const floors = floorsFor(law, site.tier, band);
  steps.push({
    n: 7, test: STEP_TESTS[6]!(law, site), status: status6 === 'passed' ? 'passed' : 'pending',
    reason: `${BAND_LABEL[band](law, key)}, Tier ${site.tier}.`, cite: floors.heightFt.cite,
  });

  const acres = sqFtToAcres(site.lotAreaSqFt);
  const labor = law.labor.buildingHeightOverFt;
  const laborHeight = site.project?.heightFt ?? floors.heightFt.value;
  const concession = law.standards[key][band === 'halfMile' ? 'halfMile' : 'quarterMile'].concessionMinDensityDuPerAcre;
  const proposedDensity = site.project ? site.project.units / acres : null;
  denialPresumption.applies = site.highResourceArea === undefined ? null : denialPresumption.inEffect && site.highResourceArea;

  const outcome: Outcome = status6 === 'passed' ? 'floors-apply' : 'floors-apply-if-conditions-met';
  const what = `at least ${floors.heightFt.value} ft, ${floors.densityDuPerAcre.value} du/ac, and a residential FAR of ${floors.residentialFar.value}`;
  return {
    asOf, outcome, steps, band, floors, conditions,
    summary: outcome === 'floors-apply' ? `The city must allow ${what}.` : `The city must allow ${what}, if the project meets SB 79's conditions.`,
    unitFloor: { value: floors.densityDuPerAcre.value * acres, note: ROUNDING_NOTE },
    residentialFloorAreaSqFt: floors.residentialFar.value * site.lotAreaSqFt,
    labor: { overFt: labor.value, heightFt: laborHeight, triggered: laborHeight > labor.value, cite: labor.cite },
    densityBonus: {
      thresholdDuPerAcre: concession.value,
      proposedDuPerAcre: proposedDensity,
      met: proposedDensity === null ? null : proposedDensity >= concession.value,
      cite: `${concession.cite}; ${parentCite(law.densityBonus.additionalConcessions.extremelyLow.cite, 1)}`,
    },
    denialPresumption,
  };
}

type Key = 'tier1' | 'tier2';
const BAND_LABEL: Record<BandId, (law: LawAsOf, key: Key) => string> = {
  adjacent: (law) => `within ${law.definitions.adjacentWithin.value} ft of an access point`,
  quarterMile: (law, key) => `within ${miles(law.bands.quarterMile[key].value)} mile`,
  halfMile: (law, key) => `${miles(law.bands.quarterMile[key].value)} to ${miles(law.bands.halfMile[key].value)} mile`,
};

/** The seven tests, worded as in the memo; numbers are read from the law. */
const STEP_TESTS: ((law: LawAsOf, site: SiteInputs) => string)[] = [
  () => 'In an urban transit county?',
  (law, s) => `Within ${miles(law.bands.halfMile[s.tier === 1 ? 'tier1' : 'tier2'].value)} mile of a TOD stop?`,
  (law, s) => {
    const k = s.tier === 1 ? 'tier1' : 'tier2';
    return `If ${BAND_LABEL.halfMile(law, k)} out: city of ${fmt(law.eligibility.outerBandMinCityPopulation[k].value)}+?`;
  },
  () => 'Zoned residential, mixed-use, or commercial?',
  () => 'City exemption, exclusion, or alternative plan covering the site?',
  () => "Project meets SB 79's conditions?",
  () => 'The city must allow at least the SB 79 floors.',
];

