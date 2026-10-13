/**
 * The what-if calculator's logic (SB79_SPEC.md, "The what-if calculator"),
 * kept apart from the UI so the spec's cases can be tested directly.
 *
 * Form fields are strings, as typed; calculate() turns them into
 * evaluateSite inputs and evaluateSite's answer into display rows. The law
 * and its numbers come only from @zoning-envelope/law, so the calculator can
 * never disagree with the prose.
 *
 * Fixed assumptions (stated beside the calculator): the site is in an urban
 * transit county, zoned residential, mixed-use, or commercial, and no local
 * exemption, exclusion, or alternative plan covers it.
 */
import { evaluateSite, lawAsOf, milesToFeet, type BandId, type Condition, type Evaluation, type SiteInputs, type Tier } from '@zoning-envelope/law';
import { duac, far, ftShort, milesShort, num, shortCite, sqftShort } from '../format';

export type IncomeLevel = 'extremelyLow' | 'veryLow' | 'lower';

export interface CalcForm {
  tier: Tier;
  /** Give a distance in feet, or pick a band. */
  where: 'distance' | 'band';
  distanceFt: string;
  band: BandId;
  cityPopulation: string;
  lotAreaSqFt: string;
  /** Optional: draws the ghost. */
  localHeightFt: string;
  /** Existing dwelling units on the site, and whether the project would demolish rent-controlled units occupied by tenants within the lookback. */
  existingUnits: string;
  rentControlledTenants: boolean;
  /** Optional project facts: units and average size check the conditions; height checks the labor rule. */
  units: string;
  averageUnitSizeNetSqFt: string;
  affordableUnits: string;
  affordableLevel: IncomeLevel;
  heightFt: string;
}

export interface Row {
  label: string;
  value: string;
  cite?: string;
  note?: string;
}

export interface CalcResult {
  /** Messages for missing or invalid entries; when present there is no evaluation. */
  errors: string[];
  inputs: SiteInputs | null;
  evaluation: Evaluation | null;
  headline: string;
  rows: Row[];
  conditions: Condition[];
  /** For the small envelope. */
  envelope: {
    lotAreaSqFt: number;
    localHeightFt: number | null;
    floorHeightFt: number | null;
    proposedHeightFt: number | null;
    laborFt: number;
    /** Eligibility lost to a failed project condition: the envelope collapses to local zoning. */
    collapsed: boolean;
  } | null;
}

/** "" -> undefined; otherwise a finite number, or NaN to flag an entry that is not one. */
const parse = (s: string): number | undefined => {
  const t = s.replace(/,/g, '').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

export function calculate(form: CalcForm, asOf: string): CalcResult {
  const law = lawAsOf(asOf);
  const key = form.tier === 1 ? 'tier1' : 'tier2';
  const errors: string[] = [];
  const need = (label: string, s: string, min = 0) => {
    const n = parse(s);
    if (n === undefined) errors.push(`Enter the ${label}.`);
    else if (Number.isNaN(n) || n < min) errors.push(`The ${label} must be a number of at least ${num(min)}.`);
    return n ?? Number.NaN;
  };
  const optional = (label: string, s: string, min = 0) => {
    const n = parse(s);
    if (n !== undefined && (Number.isNaN(n) || n < min)) errors.push(`The ${label} must be a number of at least ${num(min)}.`);
    return n;
  };

  const lotAreaSqFt = need('lot area', form.lotAreaSqFt, 1);
  const cityPopulation = need('city population', form.cityPopulation);
  const distanceFt = form.where === 'distance' ? need('distance to the nearest access point', form.distanceFt) : undefined;
  const localHeightFt = optional('local height limit', form.localHeightFt, 1);
  const existingUnits = optional('number of existing units', form.existingUnits);
  const units = optional('number of proposed units', form.units, 1);
  const size = optional('average unit size', form.averageUnitSizeNetSqFt, 1);
  const affordable = optional('number of affordable units', form.affordableUnits);
  const heightFt = optional('proposed height', form.heightFt, 1);
  if (units !== undefined && size === undefined) errors.push("Enter the average unit size to check the project's conditions.");
  if (units !== undefined && affordable !== undefined && affordable > units) errors.push('Affordable units cannot exceed the proposed units.');

  if (errors.length) return { errors, inputs: null, evaluation: null, headline: '', rows: [], conditions: [], envelope: null };

  const inputs: SiteInputs = {
    urbanTransitCounty: true,
    zoningClass: 'residential',
    localOptOut: 'none',
    tier: form.tier,
    ...(form.where === 'distance' ? { distanceFt } : { band: form.band }),
    cityPopulation,
    lotAreaSqFt,
    ...(localHeightFt !== undefined ? { localHeightLimitFt: localHeightFt } : {}),
    ...(units !== undefined && size !== undefined
      ? {
          project: {
            units,
            averageUnitSizeNetSqFt: size,
            ...(heightFt !== undefined ? { heightFt } : {}),
            ...(affordable ? { affordableUnits: { [form.affordableLevel]: affordable } } : {}),
          },
        }
      : {}),
    ...(existingUnits !== undefined || form.rentControlledTenants
      ? { existingSite: { units: existingUnits ?? 0, demolishesTenantOccupiedRentControlledHousing: form.rentControlledTenants } }
      : {}),
  };
  const ev = evaluateSite(inputs, { asOf });

  const bandLabel: Record<BandId, string> = {
    adjacent: `Within ${ftShort(law.definitions.adjacentWithin.value)} of an access point`,
    quarterMile: `Within ${milesShort(law.bands.quarterMile[key].value)}`,
    halfMile: `${milesShort(law.bands.quarterMile[key].value)} to ${milesShort(law.bands.halfMile[key].value)}`,
  };
  const rows: Row[] = [];
  const failedAt = ev.steps.find((s) => s.status === 'failed');
  if (ev.band) rows.push({ label: 'Band', value: bandLabel[ev.band] });
  else if (failedAt?.n === 2) rows.push({ label: 'Band', value: `Beyond ${milesShort(law.bands.halfMile[key].value)}: not reached`, cite: shortCite(failedAt.cite) });
  else if (failedAt?.n === 3) {
    rows.push({ label: 'Band', value: `${bandLabel.halfMile}: counts only in cities of at least ${num(law.eligibility.outerBandMinCityPopulation[key].value)}`, cite: shortCite(failedAt.cite) });
  }
  if (ev.floors && ev.unitFloor && ev.residentialFloorAreaSqFt !== null) {
    const f = ev.floors;
    rows.push({ label: 'Height the city must allow', value: `At least ${ftShort(f.heightFt.value)}`, cite: shortCite(f.heightFt.cite) });
    rows.push({ label: 'Density the city must allow', value: `At least ${duac(f.densityDuPerAcre.value)}`, cite: shortCite(f.densityDuPerAcre.cite) });
    rows.push({ label: 'Residential floor area ratio', value: `Up to ${far(f.residentialFar.value)} may not be precluded`, cite: shortCite(f.residentialFar.cite) });
    rows.push({ label: 'Unit floor', value: `${num(ev.unitFloor.value, 2)} units`, note: 'Unrounded: how SB 79 rounds a fraction is an open issue.' });
    rows.push({ label: 'Residential floor area', value: sqftShort(ev.residentialFloorAreaSqFt) });
  }
  if (ev.labor) {
    const basis = inputs.project?.heightFt !== undefined ? `the proposed ${ftShort(ev.labor.heightFt)}` : `the ${ftShort(ev.labor.heightFt)} height floor`;
    rows.push({
      label: 'Labor standards',
      value: ev.labor.triggered ? `Apply: ${basis} is over ${ftShort(ev.labor.overFt)}` : `Not triggered: ${basis} is not over ${ftShort(ev.labor.overFt)}`,
      cite: shortCite(ev.labor.cite),
    });
  }
  if (ev.densityBonus) {
    const d = ev.densityBonus;
    rows.push({
      label: 'Density bonus concessions',
      value: d.met === null
        ? `Threshold ${duac(d.thresholdDuPerAcre)}; enter proposed units to check`
        : `${d.met ? 'Threshold met' : 'Threshold not met'}: ${num(d.proposedDuPerAcre ?? 0, 2)} of at least ${duac(d.thresholdDuPerAcre)}`,
      cite: shortCite(d.cite),
    });
  }

  const conditionFailed = ev.conditions.some((c) => c.status === 'fail');
  return {
    errors,
    inputs,
    evaluation: ev,
    headline: ev.summary,
    rows,
    conditions: ev.conditions,
    envelope: {
      lotAreaSqFt,
      localHeightFt: localHeightFt ?? null,
      floorHeightFt: ev.floors?.heightFt.value ?? null,
      proposedHeightFt: heightFt ?? null,
      laborFt: law.labor.buildingHeightOverFt.value,
      collapsed: conditionFailed,
    },
  };
}

/** Distance in feet that ends each band, for the form's hint (statute values converted, not typed). */
export function bandEdgesFt(asOf: string, tier: Tier) {
  const law = lawAsOf(asOf);
  const key = tier === 1 ? 'tier1' : 'tier2';
  return {
    adjacent: law.definitions.adjacentWithin.value,
    quarterMile: milesToFeet(law.bands.quarterMile[key].value),
    halfMile: milesToFeet(law.bands.halfMile[key].value),
  };
}
