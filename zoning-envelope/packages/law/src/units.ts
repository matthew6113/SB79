/**
 * Unit definitions, not legal values. The statute states distances in feet and
 * miles and densities per acre; these convert between them.
 */
export const FEET_PER_MILE = 5280;
export const SQ_FT_PER_ACRE = 43_560;

export const milesToFeet = (miles: number) => miles * FEET_PER_MILE;
export const sqFtToAcres = (sqFt: number) => sqFt / SQ_FT_PER_ACRE;
