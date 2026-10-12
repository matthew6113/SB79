/**
 * What each figure shows in each script state, as a pure function of
 * progress (0..1). Figures render these views; they hold no state logic of
 * their own. Progress 1 is the settled look the dev panel jumps to, and every
 * value is a function of progress alone, so scrolling back plays a state in
 * reverse (CLAUDE.md rule 3).
 *
 * These views carry no legal numbers: heights and counts come from the
 * figure data (built from sb79.json and data/) passed in.
 */
import type { EnvelopeData } from './types';

/** Progress within the window [a, b] of the state's own progress, clamped to 0..1. */
export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- map

export type MapBox = 'station' | 'rings' | 'city' | 'bayArea';

export interface MapView {
  scene: 'california' | 'local';
  box: MapBox;
  /** California: qualifying counties fill, Alameda emphasized, Orange's open issue, legend. */
  utc: number;
  alameda: number;
  orange: number;
  /** Local layers, each an opacity or a draw-on fraction. */
  parcels: number;
  tint: number;
  rail: number;
  stations: number;
  tier: number;
  accessPoints: number;
  rings: number;
  ringLabels: number;
  site: number;
  measure: number;
  outerFill: number;
  population: number;
  berkeley: number;
  stamp: number;
  bay: number;
  legend: 'counties' | 'distance' | 'eligibility' | 'bay' | null;
}

const MAP_BASE: MapView = {
  scene: 'local', box: 'rings',
  utc: 0, alameda: 0, orange: 0,
  parcels: 1, tint: 0, rail: 1, stations: 1, tier: 1, accessPoints: 1, rings: 1, ringLabels: 1,
  site: 1, measure: 1, outerFill: 0, population: 0, berkeley: 0, stamp: 0, bay: 0, legend: null,
};

export const mapViews = {
  'transit-counties': (p: number): MapView => ({
    ...MAP_BASE, scene: 'california', utc: seg(p, 0, 0.6), alameda: seg(p, 0.5, 0.85), orange: seg(p, 0.7, 1), legend: 'counties',
  }),
  'station-tier': (p: number): MapView => ({
    ...MAP_BASE, box: 'station',
    rail: seg(p, 0, 0.4), stations: seg(p, 0.2, 0.6), tier: seg(p, 0.7, 1),
    accessPoints: 0, rings: 0, ringLabels: 0, site: 0, measure: 0,
  }),
  'distance-rings': (p: number): MapView => ({
    ...MAP_BASE,
    tier: 0, accessPoints: seg(p, 0, 0.2), rings: seg(p, 0.1, 0.7), ringLabels: seg(p, 0.5, 0.8),
    site: seg(p, 0.6, 0.7), measure: seg(p, 0.7, 1), legend: 'distance',
  }),
  'outer-band': (p: number): MapView => ({
    ...MAP_BASE, tier: 0, outerFill: seg(p, 0, 0.6), population: seg(p, 0.4, 1), legend: 'distance',
  }),
  'eligibility-tint': (p: number): MapView => ({
    ...MAP_BASE, tier: 0, measure: 0, tint: seg(p, 0, 0.9), outerFill: 0, legend: 'eligibility',
  }),
  'no-exclusions': (p: number): MapView => ({
    ...MAP_BASE, box: 'city', tier: 0, measure: 0, ringLabels: 0, accessPoints: 0, stations: 0, site: 0, rings: 0.5, tint: 1,
    berkeley: seg(p, 0, 0.5), stamp: seg(p, 0.6, 1),
  }),
  'bay-area-options': (p: number): MapView => ({
    ...MAP_BASE, box: 'bayArea', tier: 0, measure: 0, ringLabels: 0, accessPoints: 0, rings: 0, rail: 0, stations: 0, site: 0,
    parcels: 0, berkeley: 1, bay: seg(p, 0, 0.7), legend: 'bay',
  }),
} satisfies Record<string, (p: number) => MapView>;

// ---------------------------------------------------------------- envelope

export type EnvelopeScene = 'block' | 'rockridge' | 'exhibits';

export interface EnvelopeView {
  scene: EnvelopeScene;
  ghost: number;
  /** The SB 79 envelope on the site: its height (ft), opacity, and color. */
  height: number;
  solid: number;
  collapsed: boolean;
  /** Dashed outline at the height floor, left by the Short Answer preview. */
  outline: number;
  /** Height dimension line with its labels. */
  dimension: number;
  /** Unit dots shown, as a count (fractional at the end). */
  units: number;
  bonus: number;
  lock: number;
  /** Floor area stacked, in square feet. */
  floorArea: number;
  setback: number;
  setbackGray: number;
  stamp: number;
  toggle: number;
  towers: number;
  labor: number;
  totals: number;
  previewLabel: number;
}

const ENV_BASE = (b: EnvelopeData['block']): EnvelopeView => ({
  scene: 'block', ghost: 1, height: b.localHeightFt, solid: 0, collapsed: false, outline: 0, dimension: 0,
  units: 0, bonus: 0, lock: 0, floorArea: 0, setback: 0, setbackGray: 0, stamp: 0, toggle: 0,
  towers: 0, labor: 0, totals: 0, previewLabel: 0,
});

export const envelopeViews = {
  ghost: (_p: number, b: EnvelopeData['block']): EnvelopeView => ENV_BASE(b),
  'preview-rise': (p: number, b: EnvelopeData['block']): EnvelopeView => {
    // Rise to the floor, hold, then reset to the ghost, leaving a dashed outline.
    const up = seg(p, 0, 0.45) * (1 - seg(p, 0.7, 0.95));
    return { ...ENV_BASE(b), height: lerp(b.localHeightFt, b.floorHeightFt, up), solid: up > 0 ? 1 : 0, outline: seg(p, 0.75, 1), previewLabel: up };
  },
  'height-rise': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: lerp(b.localHeightFt, b.floorHeightFt, seg(p, 0, 0.8)), solid: 1, dimension: seg(p, 0.5, 1),
  }),
  'unit-fill': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: b.floorHeightFt, solid: 0.3, units: b.unitFloor * seg(p, 0, 0.9),
  }),
  'plate-stack': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: b.floorHeightFt, solid: 0.15, floorArea: b.residentialFloorAreaSqFt * seg(p, 0, 0.9),
  }),
  'setback-cannot-preclude': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: b.floorHeightFt, solid: 1, setback: seg(p, 0, 0.45), setbackGray: seg(p, 0.55, 0.85), stamp: seg(p, 0.75, 1),
  }),
  collapse: (p: number, b: EnvelopeData['block']): EnvelopeView => {
    const fall = seg(p, 0.2, 0.7);
    return {
      ...ENV_BASE(b), height: lerp(b.floorHeightFt, b.localHeightFt, fall), solid: 1, collapsed: p >= 0.2,
      toggle: seg(p, 0, 0.2), stamp: seg(p, 0.7, 1),
    };
  },
  'bonus-locked-height': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: b.floorHeightFt, solid: 0.3, units: b.unitFloor, lock: seg(p, 0, 0.3), bonus: seg(p, 0.25, 0.9),
  }),
  'contrast-three-heights': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), scene: 'rockridge', solid: seg(p, 0, 0.4), towers: seg(p, 0.4, 1),
  }),
  'exhibit-comparison': (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), scene: 'exhibits', solid: seg(p, 0, 0.6), labor: seg(p, 0.6, 1),
  }),
  final: (p: number, b: EnvelopeData['block']): EnvelopeView => ({
    ...ENV_BASE(b), height: b.floorHeightFt, solid: 1, dimension: 1, totals: seg(p, 0.3, 1),
  }),
} satisfies Record<string, (p: number, b: EnvelopeData['block']) => EnvelopeView>;

// ---------------------------------------------------------------- checklist and timeline

export interface ChecklistView {
  /** How many cards have resolved (ticked or grayed); fractional while one settles. */
  cards: number;
  /** Fraction of the affordability squares tinted. */
  tint: number;
}

export const checklistViews = {
  'conditions-tick': (p: number, count: number): ChecklistView => ({ cards: count * seg(p, 0, 0.75), tint: seg(p, 0.7, 1) }),
} satisfies Record<string, (p: number, count: number) => ChecklistView>;

export interface TimelineView {
  /** Draw-on fraction of the approval path, the SB 35 branch, the dated axis, and the 2027 marker. */
  path: number;
  branch: number;
  axis: number;
  marker: number;
}

export const timelineViews = {
  'approval-path': (p: number): TimelineView => ({ path: seg(p, 0, 0.4), branch: seg(p, 0.3, 0.6), axis: seg(p, 0.5, 0.8), marker: seg(p, 0.8, 1) }),
} satisfies Record<string, (p: number) => TimelineView>;

/** Every state each figure implements, for the dev panel and tests. */
export const IMPLEMENTED = {
  map: Object.keys(mapViews),
  envelope: Object.keys(envelopeViews),
  checklist: Object.keys(checklistViews),
  timeline: Object.keys(timelineViews),
} as const;
