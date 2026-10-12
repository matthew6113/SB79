/**
 * Zod schema for sb79.json. Every legal value is a cited leaf; the shape below
 * names each one, so a missing or misspelled provision fails validation.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const leafFields = {
  unit: z.string().optional(),
  /** One pinpoint, e.g. "Gov. Code § 65912.157(a)(3)(A)". */
  cite: z.string().min(1),
  /** Snapshot file in packages/law/source that contains the quote. */
  source: z.string().regex(/^[\w.-]+\.txt$/),
  /** Verbatim text from the cited pinpoint. */
  quote: z.string().min(8),
  note: z.string().optional(),
  /** In force from this date (inclusive). Defaults to the statute's effective date. */
  from: isoDate.optional(),
  /** No longer in force from this date (exclusive). */
  to: isoDate.optional(),
  /** For a date the text implies rather than states (non-urgency effective dates). */
  derivation: z.object({ enacted: isoDate, urgency: z.boolean(), billSource: z.string() }).strict().optional(),
};

const cited = <T extends z.ZodType>(value: T) => z.object({ value, ...leafFields }).strict();
const versioned = <T extends z.ZodType>(value: T) => z.object({ versions: z.array(cited(value)).min(2) }).strict();

const num = cited(z.number());
const date = cited(isoDate);
const text = cited(z.string().min(1));
const flag = cited(z.boolean());
const list = cited(z.array(z.string().min(1)).min(1));
const byTier = <T extends z.ZodType>(s: T) => z.object({ tier1: s, tier2: s }).strict();

const act = z.object({ citation: z.string(), approved: date, effective: date, amends: z.string().optional() }).strict();
const bandStandards = z
  .object({
    heightLimitAtLeastFt: num,
    maxDensityAtLeastDuPerAcre: num,
    residentialFarNotPrecludedUpTo: num,
    concessionMinDensityDuPerAcre: num,
  })
  .strict();

export const sb79Schema = z
  .object({
    title: z.string(),
    codified: z.string(),
    sources: z.string(),
    readme: z.string(),
    acts: z.object({ sb79: act, sb722: act, ab2576: act, sb1361: act }).strict(),
    operative: z.object({ cities: date, unincorporated: text }).strict(),
    definitions: z
      .object({
        urbanTransitCountyMoreThanRailStations: num,
        tier1: text,
        tier2: text,
        veryHighFrequencyCommuterRailTrainsPerDay: num,
        highFrequencyCommuterRailTrainsPerDay: num,
        todZoneRadius: num,
        adjacentWithin: num,
        highResourceArea: list,
        housingDevelopmentProjectExcludesTransientLodging: flag,
        netHabitableSquareFootage: text,
        residentialFloorAreaRatio: text,
      })
      .strict(),
    eligibility: z
      .object({ qualifyingZoning: list, reach: num, distanceMeasurement: text, outerBandMinCityPopulation: byTier(num) })
      .strict(),
    bands: z.object({ quarterMile: byTier(num), halfMile: byTier(num) }).strict(),
    standards: byTier(z.object({ quarterMile: bandStandards, halfMile: bandStandards }).strict()),
    adjacencyIntensifier: z
      .object({ appliesTo: text, heightAddFt: num, densityAddDuPerAcre: num, residentialFarAdd: num })
      .strict(),
    conditions: z
      .object({ minUnits: num, minDensityDuPerAcre: num, localMinDensityIfGreater: text, maxAverageUnitSizeNetSqFt: num, safety: text })
      .strict(),
    affordability: z
      .object({
        appliesAboveUnits: num,
        options: z.object({ extremelyLow: num, veryLow: num, lower: num }).strict(),
        rentalTermYears: num,
        ownershipTermYears: num,
        stricterLocalInclusionaryControls: flag,
      })
      .strict(),
    antiDisplacement: z
      .object({
        replacementHousing: text,
        localDemolitionStandards: text,
        rentControlledSite: z.object({ moreThanUnits: num, tenantLookbackYears: num }).strict(),
        demolishedRentControlledSite: z.object({ moreThanUnits: num, lookbackYears: num }).strict(),
        parkSite: text,
      })
      .strict(),
    labor: z.object({ buildingHeightOverFt: num, standards: text }).strict(),
    densityBonus: z
      .object({
        baseDensity: text,
        noAdditionalHeightRequired: flag,
        heightExceptionFt: num,
        additionalConcessions: z.object({ extremelyLow: num, veryLow: num, low: num }).strict(),
      })
      .strict(),
    localStandards: z
      .object({ mayNotPrevent: versioned(z.string()), noSb79SpecificRequirements: versioned(z.string()), transitServiceProtections: text })
      .strict(),
    approval: z
      .object({
        deemedConsistent: flag,
        noMinisterialProcessRequired: flag,
        ceqaUnchanged: flag,
        sb35Eligible: flag,
        conflictingZoningDoesNotApply: flag,
        denialPresumption: z.object({ beginsOn: date, inHighResourceArea: flag, minFinePerUnitUsd: num }).strict(),
      })
      .strict(),
    mapPresumption: text,
    cityOptions: z
      .object({
        hcdReview: z
          .object({ draftDaysBeforeAdoption: num, submitWithinDays: num, reviewDays: num, extensionDays: num })
          .strict(),
        exemptions: z
          .object({ noWalkingPathUnderMiles: num, industrialHubMinStops: num, industrialHubMinAcres: num, industrialHubDesignatedBy: date })
          .strict(),
        exclusions: z.object({ untilYearsAfterSeventhHousingElement: num, historicSites: versioned(z.string()) }).strict(),
        alternativePlan: z
          .object({
            sameTotalCapacity: flag,
            maxSiteDensityCutPercent: num,
            maxZoneCapacityCutPercent: num,
            maxSiteCapacityCountedPercent: num,
            adoptOutsideHousingElement: versioned(z.string()),
            replacesDefaults: flag,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type Sb79Law = z.infer<typeof sb79Schema>;

export interface CitedLeaf<V = unknown> {
  value: V;
  unit?: string | undefined;
  cite: string;
  source: string;
  quote: string;
  note?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  derivation?: { enacted: string; urgency: boolean; billSource: string } | undefined;
}
