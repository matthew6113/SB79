import { describe, expect, it } from 'vitest';
import { BLANK, calculate, type CalcForm } from '../src/calculator/model';
import { asOf } from '../src/memo-data';

// SB79_SPEC.md, "The what-if calculator": cases 1-6, entered as a reader
// would type them into the form.
const blank: CalcForm = {
  tier: 1, where: 'band', distanceFt: '', band: 'quarterMile', cityPopulation: '122,580', lotAreaSqFt: '5,000',
  localHeightFt: '', existingUnits: '', rentControlledTenants: false,
  units: '', averageUnitSizeNetSqFt: '', affordableUnits: '', affordableLevel: 'veryLow', heightFt: '',
};
const row = (r: ReturnType<typeof calculate>, label: string) => r.rows.find((x) => x.label === label)?.value;

describe('calculator: SB79_SPEC.md cases', () => {
  it('case 1: 5,000 sq ft, Tier 1, within 1/4 mi -> 75 ft; 13.77 du; 17,500 sq ft', () => {
    const r = calculate(blank, asOf);
    expect(r.errors).toEqual([]);
    expect(r.evaluation?.outcome).toBe('floors-apply-if-conditions-met');
    expect(row(r, 'Height the city must allow')).toBe('At least 75 ft');
    expect(row(r, 'Unit floor')).toBe('13.77 units');
    expect(row(r, 'Residential floor area')).toBe('17,500 sq ft');
    expect(r.envelope).toMatchObject({ floorHeightFt: 75, collapsed: false });
  });

  it('case 2: same lot, Tier 1, 1/4-1/2 mi, city 122,580 -> 65 ft; 11.48 du; 15,000 sq ft', () => {
    const r = calculate({ ...blank, band: 'halfMile' }, asOf);
    expect(row(r, 'Band')).toBe('¼ mile to ½ mile');
    expect(row(r, 'Height the city must allow')).toBe('At least 65 ft');
    expect(row(r, 'Unit floor')).toBe('11.48 units');
    expect(row(r, 'Residential floor area')).toBe('15,000 sq ft');
  });

  it('case 3: same as 2, city of 30,000 -> band does not apply', () => {
    const r = calculate({ ...blank, band: 'halfMile', cityPopulation: '30000' }, asOf);
    expect(r.evaluation?.outcome).toBe('local-rules');
    expect(r.headline).toMatch(/applies only in cities of at least 35,000/);
    expect(row(r, 'Height the city must allow')).toBeUndefined();
    expect(row(r, 'Band')).toBe('¼ mile to ½ mile: counts only in cities of at least 35,000');
    expect(r.envelope).toMatchObject({ floorHeightFt: null, collapsed: false });
  });

  it('case 4: 10,000 sq ft, Tier 2, within 200 ft -> 85 ft; 32.14 du; 40,000 sq ft; labor not triggered', () => {
    const r = calculate({ ...blank, tier: 2, band: 'adjacent', lotAreaSqFt: '10000' }, asOf);
    expect(row(r, 'Height the city must allow')).toBe('At least 85 ft');
    expect(row(r, 'Unit floor')).toBe('32.14 units');
    expect(row(r, 'Residential floor area')).toBe('40,000 sq ft');
    expect(row(r, 'Labor standards')).toMatch(/^Not triggered: the 85 ft height floor is not over 85 ft/);
  });

  it('case 5: case 1 with rent-controlled tenants in the past 7 years (3+ units) -> ineligible; envelope collapses', () => {
    const r = calculate({ ...blank, units: '14', averageUnitSizeNetSqFt: '900', affordableUnits: '2', existingUnits: '3', rentControlledTenants: true }, asOf);
    expect(r.evaluation?.outcome).toBe('local-rules');
    expect(r.conditions.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['rent-controlled-site']);
    expect(r.envelope).toMatchObject({ floorHeightFt: null, collapsed: true });
  });

  it('case 6: case 1 with 4 units -> ineligible: fewer than 5 units', () => {
    const r = calculate({ ...blank, units: '4', averageUnitSizeNetSqFt: '1000' }, asOf);
    expect(r.evaluation?.outcome).toBe('local-rules');
    expect(r.conditions.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['min-units']);
    expect(r.envelope?.collapsed).toBe(true);
  });
});

describe('calculator: entry handling', () => {
  it('measures a typed distance into the band', () => {
    const r = calculate({ ...blank, where: 'distance', distanceFt: '150' }, asOf);
    expect(row(r, 'Band')).toBe('Within 200 ft of an access point');
    expect(row(r, 'Height the city must allow')).toBe('At least 95 ft');
    expect(row(r, 'Labor standards')).toMatch(/^Apply: the 95 ft height floor is over 85 ft/);
  });

  it('reports a site beyond the half mile as not reached', () => {
    const r = calculate({ ...blank, where: 'distance', distanceFt: '3000' }, asOf);
    expect(r.evaluation?.outcome).toBe('local-rules');
    expect(row(r, 'Band')).toBe('Beyond ½ mile: not reached');
  });

  it('checks the density bonus threshold once units are entered', () => {
    expect(row(calculate(blank, asOf), 'Density bonus concessions')).toMatch(/enter proposed units/);
    const r = calculate({ ...blank, units: '14', averageUnitSizeNetSqFt: '900', affordableUnits: '2' }, asOf);
    expect(r.evaluation?.outcome).toBe('floors-apply-if-conditions-met'); // safety standards are never assessed here
    expect(row(r, 'Density bonus concessions')).toMatch(/^Threshold met/);
  });

  it('uses the proposed height for the labor rule when given', () => {
    const r = calculate({ ...blank, units: '20', averageUnitSizeNetSqFt: '900', affordableUnits: '3', heightFt: '90' }, asOf);
    expect(row(r, 'Labor standards')).toMatch(/^Apply: the proposed 90 ft is over 85 ft/);
    expect(r.envelope?.proposedHeightFt).toBe(90);
  });

  it('asks for missing or invalid entries instead of guessing', () => {
    expect(calculate({ ...blank, lotAreaSqFt: '' }, asOf)).toMatchObject({ needed: ['Lot area'], errors: [], evaluation: null });
    expect(calculate({ ...blank, lotAreaSqFt: 'abc' }, asOf).errors[0]).toMatch(/lot area must be a number/);
    expect(calculate({ ...blank, units: '12' }, asOf).needed).toEqual(['Average unit size, to check the project']);
    expect(calculate({ ...blank, units: '12', averageUnitSizeNetSqFt: '900', affordableUnits: '13' }, asOf).errors).toEqual(['Affordable units cannot exceed the proposed units.']);
    expect(calculate({ ...blank, where: 'band', band: '' }, asOf).needed).toEqual(['Band']);
  });

  it('opens blank: no site facts and no result until the site is filled in', () => {
    const facts = Object.entries(BLANK).filter(([k]) => !['where', 'affordableLevel', 'rentControlledTenants'].includes(k));
    expect(facts.filter(([, v]) => v !== '' && v !== null)).toEqual([]);
    expect(BLANK.rentControlledTenants).toBe(false);
    const r = calculate(BLANK, asOf);
    expect(r).toMatchObject({ errors: [], evaluation: null, envelope: null, rows: [] });
    expect(r.needed).toEqual(['Stop tier', 'Distance to the nearest access point', 'City population', 'Lot area']);
  });
});
