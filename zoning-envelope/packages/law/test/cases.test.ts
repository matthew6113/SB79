import { describe, expect, it } from 'vitest';
import { evaluateSite, type SiteInputs } from '../src/index.ts';

// The memo's as-of date (SB79_SPEC.md letterhead).
const asOf = '2026-10-09';

// Facts the spec's cases leave implicit: an ordinary residential site in an
// urban transit county with no local opt-out.
const base = { urbanTransitCounty: true, zoningClass: 'residential', localOptOut: 'none', cityPopulation: 122_580 } as const;

const case1: SiteInputs = { ...base, lotAreaSqFt: 5000, tier: 1, band: 'quarterMile' };
const compliantProject = { units: 14, averageUnitSizeNetSqFt: 900, affordableUnits: { veryLow: 2 } };

describe('worked cases from SB79_SPEC.md', () => {
  it('case 1: 5,000 sq ft, Tier 1, within 1/4 mi -> 75 ft; 13.77 du; 17,500 sq ft', () => {
    const r = evaluateSite(case1, { asOf });
    expect(r.outcome).toBe('floors-apply-if-conditions-met');
    expect(r.floors?.heightFt.value).toBe(75);
    expect(r.floors?.densityDuPerAcre.value).toBe(120);
    expect(r.floors?.residentialFar.value).toBe(3.5);
    expect(r.unitFloor?.value).toBeCloseTo(13.77, 2);
    expect(r.residentialFloorAreaSqFt).toBe(17_500);
  });

  it('case 2: same lot, Tier 1, 1/4-1/2 mi, city 122,580 -> 65 ft; 11.48 du; 15,000 sq ft', () => {
    const r = evaluateSite({ ...case1, band: 'halfMile', cityPopulation: 122_580 }, { asOf });
    expect(r.outcome).toBe('floors-apply-if-conditions-met');
    expect(r.floors?.heightFt.value).toBe(65);
    expect(r.unitFloor?.value).toBeCloseTo(11.48, 2);
    expect(r.residentialFloorAreaSqFt).toBe(15_000);
  });

  it('case 3: same as 2 in a city of 30,000 -> band does not apply', () => {
    const r = evaluateSite({ ...case1, band: 'halfMile', cityPopulation: 30_000 }, { asOf });
    expect(r.outcome).toBe('local-rules');
    expect(r.floors).toBeNull();
    expect(r.steps.find((s) => s.n === 3)?.status).toBe('failed');
  });

  it('case 4: 10,000 sq ft, Tier 2, within 200 ft -> 85 ft; 32.14 du; 40,000 sq ft; labor not triggered', () => {
    const r = evaluateSite({ ...base, lotAreaSqFt: 10_000, tier: 2, band: 'adjacent' }, { asOf });
    expect(r.floors?.heightFt.value).toBe(85);
    expect(r.floors?.densityDuPerAcre.value).toBe(140);
    expect(r.floors?.residentialFar.value).toBe(4);
    expect(r.unitFloor?.value).toBeCloseTo(32.14, 2);
    expect(r.residentialFloorAreaSqFt).toBe(40_000);
    expect(r.labor?.triggered).toBe(false);
  });

  it('case 5: case 1 with 3+ tenant-occupied rent-controlled units demolished -> ineligible', () => {
    const r = evaluateSite(
      { ...case1, project: compliantProject, existingSite: { units: 3, demolishesTenantOccupiedRentControlledHousing: true } },
      { asOf },
    );
    expect(r.outcome).toBe('local-rules');
    expect(r.floors).toBeNull();
    expect(r.conditions.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['rent-controlled-site']);
  });

  it('case 6: case 1 with 4 units -> ineligible: fewer than 5 units', () => {
    const r = evaluateSite({ ...case1, project: { units: 4, averageUnitSizeNetSqFt: 1000 } }, { asOf });
    expect(r.outcome).toBe('local-rules');
    expect(r.conditions.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['min-units']);
  });
});

describe('adjacency intensifier (§ 65912.157(e)) reproduces the spec table', () => {
  it.each([
    [1, 95, 160, 4.5],
    [2, 85, 140, 4],
  ] as const)('Tier %i within 200 ft: %i ft, %i du/ac, FAR %d', (tier, h, d, far) => {
    const r = evaluateSite({ ...base, lotAreaSqFt: 5000, tier, band: 'adjacent' }, { asOf });
    expect([r.floors?.heightFt.value, r.floors?.densityDuPerAcre.value, r.floors?.residentialFar.value]).toEqual([h, d, far]);
    expect(r.floors?.heightFt.parts?.map((p) => p.cite)).toEqual([
      `Gov. Code § 65912.157(a)(${tier === 1 ? 3 : 5})(A)`,
      'Gov. Code § 65912.157(e)',
    ]);
  });

  it('Tier 2 standards match the spec table', () => {
    const at = (band: 'quarterMile' | 'halfMile') => evaluateSite({ ...base, lotAreaSqFt: 5000, tier: 2, band }, { asOf }).floors;
    expect([at('quarterMile')?.heightFt.value, at('quarterMile')?.densityDuPerAcre.value, at('quarterMile')?.residentialFar.value]).toEqual([65, 100, 3]);
    expect([at('halfMile')?.heightFt.value, at('halfMile')?.densityDuPerAcre.value, at('halfMile')?.residentialFar.value]).toEqual([55, 80, 2.5]);
  });
});

describe('distance bands (inclusive outer edges)', () => {
  const bandAt = (distanceFt: number) => evaluateSite({ ...base, lotAreaSqFt: 5000, tier: 1, distanceFt }, { asOf }).band;
  it.each([
    [0, 'adjacent'],
    [200, 'adjacent'],
    [200.01, 'quarterMile'],
    [1320, 'quarterMile'],
    [1320.01, 'halfMile'],
    [2640, 'halfMile'],
    [2640.01, null],
  ] as const)('%d ft -> %s', (ft, band) => {
    expect(bandAt(ft)).toBe(band);
  });

  it('requires exactly one of distanceFt and band', () => {
    expect(() => evaluateSite({ ...base, lotAreaSqFt: 5000, tier: 1 }, { asOf })).toThrow();
    expect(() => evaluateSite({ ...base, lotAreaSqFt: 5000, tier: 1, band: 'adjacent', distanceFt: 10 }, { asOf })).toThrow();
  });
});

describe('each step can send the site to local rules', () => {
  const failsAt = (site: SiteInputs) => evaluateSite(site, { asOf }).steps.find((s) => s.status === 'failed')?.n;
  it('step 1: not an urban transit county', () => expect(failsAt({ ...case1, urbanTransitCounty: false })).toBe(1));
  it('step 2: beyond the half mile', () => {
    const { band: _band, ...noBand } = case1;
    expect(failsAt({ ...noBand, distanceFt: 3000 })).toBe(2);
  });
  it('step 3: small city in the outer band', () => expect(failsAt({ ...case1, band: 'halfMile', cityPopulation: 34_999 })).toBe(3));
  it('step 3 is skipped inside the quarter mile, whatever the population', () => {
    const r = evaluateSite({ ...case1, cityPopulation: 1000 }, { asOf });
    expect(r.steps.find((s) => s.n === 3)?.status).toBe('skipped');
    expect(r.outcome).toBe('floors-apply-if-conditions-met');
  });
  it('step 4: industrial or open space', () => {
    expect(failsAt({ ...case1, zoningClass: 'industrial' })).toBe(4);
    expect(failsAt({ ...case1, zoningClass: 'open-space' })).toBe(4);
    expect(failsAt({ ...case1, zoningClass: 'mixed-use' })).toBeUndefined();
  });
  it.each(['exemption', 'exclusion', 'alternative-plan'] as const)('step 5: %s', (localOptOut) =>
    expect(failsAt({ ...case1, localOptOut })).toBe(5));
  it('step 6: unit size, density, affordability, transient lodging', () => {
    expect(failsAt({ ...case1, project: { ...compliantProject, averageUnitSizeNetSqFt: 1751 } })).toBe(6);
    expect(failsAt({ ...case1, project: { ...compliantProject, units: 5, localMinDensityDuPerAcre: 60 } })).toBe(6);
    expect(failsAt({ ...case1, project: { ...compliantProject, affordableUnits: {} } })).toBe(6);
    expect(failsAt({ ...case1, project: { ...compliantProject, includesTransientLodging: true } })).toBe(6);
  });
});

describe('a fully compliant project', () => {
  const site: SiteInputs = {
    ...case1,
    highResourceArea: true,
    project: { ...compliantProject, meetsSafetyStandards: true },
    existingSite: { units: 1, demolishesTenantOccupiedRentControlledHousing: false },
  };
  it('gets the floors outright, with every step passed', () => {
    const r = evaluateSite(site, { asOf });
    expect(r.outcome).toBe('floors-apply');
    expect(r.steps.map((s) => s.status)).toEqual(['passed', 'passed', 'skipped', 'passed', 'passed', 'passed', 'passed']);
    expect(r.summary).toContain('at least 75 ft');
  });
  it('affordability is not required at 10 units or fewer', () => {
    const r = evaluateSite({ ...site, project: { units: 10, averageUnitSizeNetSqFt: 900, meetsSafetyStandards: true } }, { asOf });
    expect(r.conditions.find((c) => c.id === 'affordability')?.status).toBe('not-applicable');
    expect(r.outcome).toBe('floors-apply');
  });
  it('density bonus: concession threshold for Tier 1 inside 1/4 mile', () => {
    const r = evaluateSite(site, { asOf });
    expect(r.densityBonus?.thresholdDuPerAcre).toBe(90);
    expect(r.densityBonus?.met).toBe(true); // 14 units on 0.1148 ac is about 122 du/ac
  });
});

describe('labor standards (§ 65912.157(k)) apply only over 85 ft', () => {
  it('Tier 1 within 200 ft: the 95 ft floor triggers them', () => {
    expect(evaluateSite({ ...case1, band: 'adjacent' }, { asOf }).labor?.triggered).toBe(true);
  });
  it('a proposed height of exactly 85 ft does not', () => {
    expect(evaluateSite({ ...case1, band: 'adjacent', project: { ...compliantProject, heightFt: 85 } }, { asOf }).labor?.triggered).toBe(false);
  });
});

describe('law keyed by date', () => {
  it('no floors before cities are covered (2026-07-01)', () => {
    expect(evaluateSite(case1, { asOf: '2026-06-30' }).outcome).toBe('not-yet-operative');
    expect(evaluateSite(case1, { asOf: '2026-07-01' }).outcome).toBe('floors-apply-if-conditions-met');
  });
  it('rejects dates before SB 79 took effect', () => {
    expect(() => evaluateSite(case1, { asOf: '2025-12-31' })).toThrow(/took effect/);
  });
  it('the park-site bar (h)(3) exists only from 2026-07-16 (SB 722)', () => {
    const site: SiteInputs = { ...case1, project: compliantProject, existingSite: { units: 0, demolishesTenantOccupiedRentControlledHousing: false, parkSite: true } };
    expect(evaluateSite(site, { asOf: '2026-07-15' }).conditions.some((c) => c.id === 'park-site')).toBe(false);
    expect(evaluateSite(site, { asOf: '2026-07-16' }).outcome).toBe('local-rules');
  });
  it('the denial presumption begins 2027-01-01 and needs a high-resource area', () => {
    const site: SiteInputs = { ...case1, highResourceArea: true };
    expect(evaluateSite(site, { asOf: '2026-12-31' }).denialPresumption).toMatchObject({ inEffect: false, applies: false });
    expect(evaluateSite(site, { asOf: '2027-01-01' }).denialPresumption).toMatchObject({ inEffect: true, applies: true });
    expect(evaluateSite({ ...site, highResourceArea: false }, { asOf: '2027-01-01' }).denialPresumption.applies).toBe(false);
  });
});
