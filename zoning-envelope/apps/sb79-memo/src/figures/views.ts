/**
 * What each figure shows in each script state, as a function of progress
 * (0..1). Every state is a motion (src/figures/motion.ts): a timeline of
 * grammar verbs over a view object, so the timings and eases are the motion
 * grammar's and nothing else.
 *
 * Continuity: where two consecutive paragraphs use the same figure, the later
 * state starts from the earlier one's settled view (`after(...)`), so the
 * figure never jumps at a paragraph boundary, forward or back.
 * test/figures.test.ts checks this for every such pair in src/script.ts.
 *
 * Views carry no legal numbers: heights and counts come from the figure data
 * (built from sb79.json and data/) passed in.
 */
import { motion, type Beat, type Motion } from './motion';
import type { CardStatus, EnvelopeData } from './types';

const cache = <K, V>(make: (k: K) => V) => {
  const m = new Map<K, V>();
  return (k: K) => {
    if (!m.has(k)) m.set(k, make(k));
    return m.get(k)!;
  };
};

// ---------------------------------------------------------------- map

export type MapBox = 'station' | 'rings' | 'city' | 'bayArea';
export type MapLegend = 'counties' | 'distance' | 'eligibility' | 'bay';

export interface MapView {
  /** Opacity of the California scene and of the local (feet) scene. */
  ca: number;
  local: number;
  /** The local viewBox moves from box[0] to box[1] as zoom runs 0..1. */
  box: [MapBox, MapBox];
  zoom: number;
  utc: number;
  alameda: number;
  orange: number;
  parcels: number;
  tint: number;
  gray: number;
  rail: number;
  stations: number;
  tier: number;
  accessPoints: number;
  /** Rings: draw-on fraction, and opacity. */
  rings: number;
  ringsAlpha: number;
  ringLabels: number;
  site: number;
  measure: number;
  outerFill: number;
  population: number;
  berkeley: number;
  stamp: number;
  bay: number;
  /** The legend crossfades from legendFrom to legend as legendIn runs 0..1. */
  legend: MapLegend | null;
  legendFrom: MapLegend | null;
  legendIn: number;
}

const MAP_START: MapView = {
  ca: 1, local: 0, box: ['station', 'station'], zoom: 1,
  utc: 0, alameda: 0, orange: 0,
  parcels: 1, tint: 0, gray: 0, rail: 0, stations: 0, tier: 0, accessPoints: 0, rings: 0, ringsAlpha: 1, ringLabels: 0,
  site: 0, measure: 0, outerFill: 0, population: 0, berkeley: 0, stamp: 0, bay: 0,
  legend: 'counties', legendFrom: null, legendIn: 0,
};

/** Start a state from `prev`'s settled view, with a new legend that fades in. */
function mapFrom(prev: string, legend: MapLegend | null, extra: Partial<MapView> = {}): MapView {
  const v = mapMotion(prev).at(1);
  const shown = v.legendIn >= 0.5 ? v.legend : v.legendFrom;
  return legend === shown
    ? { ...v, legend, legendFrom: null, legendIn: 1, ...extra }
    : { ...v, legend, legendFrom: shown, legendIn: 0, ...extra };
}

type MB = Beat<MapView>;
const MAP: Record<string, () => Motion<MapView>> = {
  'transit-counties': () => motion(MAP_START, [
    { verb: 'show', to: { legendIn: 1 } },
    { verb: 'fill', to: { utc: 1 }, at: '<' },
    { verb: 'stamp', to: { alameda: 1 } },
    { verb: 'show', to: { orange: 1 } },
  ] satisfies MB[]),
  'station-tier': () => motion(mapFrom('transit-counties', null, { box: ['station', 'station'], zoom: 1 }), [
    { verb: 'show', to: { ca: 0, local: 1, legendIn: 1 } },
    { verb: 'show', to: { rail: 1 } },
    { verb: 'show', to: { stations: 1 }, at: '<0.2' },
    { verb: 'stamp', to: { tier: 1 } },
  ]),
  'distance-rings': () => motion(mapFrom('station-tier', 'distance', { box: ['station', 'rings'], zoom: 0 }), [
    { verb: 'show', to: { tier: 0 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { accessPoints: 1, legendIn: 1 } },
    { verb: 'draw', to: { rings: 1 } },
    { verb: 'show', to: { ringLabels: 1, site: 1 } },
    { verb: 'draw', to: { measure: 1 } },
  ]),
  'outer-band': () => motion(mapFrom('distance-rings', 'distance', { box: ['rings', 'rings'] }), [
    { verb: 'stamp', to: { population: 1 } },
    { verb: 'show', to: { outerFill: 1 } },
  ]),
  'eligibility-tint': () => motion(mapFrom('outer-band', 'eligibility'), [
    { verb: 'show', to: { outerFill: 0, population: 0, measure: 0, legendIn: 1 } },
    { verb: 'show', to: { tint: 1 } },
    { verb: 'grayOut', to: { gray: 1 }, at: '<0.2' },
  ]),
  'no-exclusions': () => motion(mapFrom('eligibility-tint', null, { box: ['rings', 'city'], zoom: 0 }), [
    { verb: 'show', to: { legendIn: 1, ringLabels: 0, accessPoints: 0, stations: 0, site: 0, ringsAlpha: 0.5 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { berkeley: 1 } },
    { verb: 'stamp', to: { stamp: 1 } },
  ]),
  'bay-area-options': () => motion(mapFrom('no-exclusions', 'bay', { box: ['city', 'bayArea'], zoom: 0 }), [
    { verb: 'show', to: { stamp: 0, parcels: 0, ringsAlpha: 0, rail: 0 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { bay: 1, legendIn: 1 } },
  ]),
};

const mapMotion = cache((state: string) => {
  const make = MAP[state];
  if (!make) throw new Error(`MapFigure has no state "${state}"`);
  return make();
});
export const mapView = (state: string, p: number) => mapMotion(state).at(p);

// ---------------------------------------------------------------- envelope

export type EnvelopeScene = 'block' | 'rockridge' | 'exhibits';

export interface EnvelopeView {
  scene: EnvelopeScene;
  /** A dissolve from another scene: its settled view fades out as `mix` runs 0..1. */
  from: EnvelopeView | null;
  mix: number;
  ghost: number;
  localLabel: number;
  /** The SB 79 envelope: height (ft), opacity, and how far its color has turned to red. */
  height: number;
  solid: number;
  red: number;
  outline: number;
  previewLabel: number;
  dimension: number;
  /** Unit dots shown (a count, fractional at the end) and their opacity. */
  units: number;
  dots: number;
  bonus: number;
  levels: number;
  lock: number;
  /** Floor area stacked (sq ft) and the plates' opacity. */
  floorArea: number;
  plates: number;
  setback: number;
  setbackGray: number;
  precludeStamp: number;
  toggle: number;
  collapseStamp: number;
  rockRise: number;
  towers: number;
  exRise: number;
  labor: number;
  totals: number;
}

type Block = EnvelopeData['block'];
const envStart = (b: Block, scene: EnvelopeScene = 'block'): EnvelopeView => ({
  scene, from: null, mix: 1, ghost: 1, localLabel: 0, height: b.localHeightFt, solid: 0, red: 0, outline: 0, previewLabel: 0,
  dimension: 0, units: 0, dots: 1, bonus: 0, levels: 0, lock: 0, floorArea: 0, plates: 1, setback: 0, setbackGray: 0,
  precludeStamp: 0, toggle: 0, collapseStamp: 0, rockRise: 0, towers: 0, exRise: 0, labor: 0, totals: 0,
});

type EB = Beat<EnvelopeView>;
const ENVELOPE: Record<string, (b: Block, after: (s: string) => EnvelopeView) => Motion<EnvelopeView>> = {
  ghost: (b) => motion({ ...envStart(b), ghost: 0 }, [
    { verb: 'show', to: { ghost: 1, localLabel: 1 } },
  ]),
  'preview-rise': (b, after) => motion(after('ghost'), [
    { verb: 'rise', to: { height: b.floorHeightFt, solid: 1, previewLabel: 1 } },
    { verb: 'show', to: { localLabel: 0 }, at: '<' },
    { verb: 'hold' },
    { verb: 'rise', to: { height: b.localHeightFt, solid: 0, previewLabel: 0 } },
    { verb: 'show', to: { outline: 1 } },
  ] satisfies EB[]),
  'height-rise': (b) => motion({ ...envStart(b), localLabel: 1 }, [
    { verb: 'rise', to: { height: b.floorHeightFt, solid: 1 } },
    { verb: 'draw', to: { dimension: 1 } },
  ]),
  'unit-fill': (b, after) => motion(after('height-rise'), [
    { verb: 'show', to: { solid: 0.3, dimension: 0, localLabel: 0, levels: 1 } },
    { verb: 'fill', to: { units: b.unitFloor } },
  ]),
  'plate-stack': (b, after) => motion(after('unit-fill'), [
    { verb: 'show', to: { dots: 0, levels: 0, solid: 0.15 } },
    { verb: 'fill', to: { floorArea: b.residentialFloorAreaSqFt } },
  ]),
  'setback-cannot-preclude': (_b, after) => motion(after('plate-stack'), [
    { verb: 'show', to: { plates: 0, solid: 1 } },
    { verb: 'draw', to: { setback: 1 } },
    { verb: 'grayOut', to: { setbackGray: 1 } },
    { verb: 'stamp', to: { precludeStamp: 1 } },
  ]),
  collapse: (b) => motion({ ...envStart(b), height: b.floorHeightFt, solid: 1 }, [
    { verb: 'show', to: { toggle: 1 } },
    { verb: 'show', to: { red: 1 } },
    { verb: 'collapse', to: { height: b.localHeightFt } },
    { verb: 'stamp', to: { collapseStamp: 1 } },
  ]),
  'bonus-locked-height': (b, after) => motion({ ...after('collapse'), units: b.unitFloor, dots: 0 }, [
    { verb: 'show', to: { toggle: 0, collapseStamp: 0, red: 0 } },
    { verb: 'rise', to: { height: b.floorHeightFt } },
    { verb: 'show', to: { solid: 0.3, levels: 1, dots: 1 } },
    { verb: 'stamp', to: { lock: 1 } },
    { verb: 'fill', to: { bonus: 1 } },
  ]),
  'contrast-three-heights': (b, after) => motion({ ...envStart(b, 'rockridge'), from: after('bonus-locked-height'), mix: 0 }, [
    { verb: 'move', to: { mix: 1 } },
    { verb: 'rise', to: { rockRise: 1 } },
    { verb: 'draw', to: { towers: 1 } },
  ]),
  'exhibit-comparison': (b) => motion(envStart(b, 'exhibits'), [
    { verb: 'rise', to: { exRise: 1 } },
    { verb: 'draw', to: { labor: 1 } },
  ]),
  final: (b, after) => motion({ ...envStart(b), from: after('exhibit-comparison'), mix: 0, height: b.floorHeightFt, solid: 1, dimension: 1, localLabel: 1 }, [
    { verb: 'move', to: { mix: 1 } },
    { verb: 'stamp', to: { totals: 1 } },
  ]),
};

const envelopeMotions = new WeakMap<Block, Map<string, Motion<EnvelopeView>>>();
function envelopeMotion(state: string, b: Block): Motion<EnvelopeView> {
  let m = envelopeMotions.get(b);
  if (!m) envelopeMotions.set(b, (m = new Map()));
  let mo = m.get(state);
  if (!mo) {
    const make = ENVELOPE[state];
    if (!make) throw new Error(`EnvelopeFigure has no state "${state}"`);
    mo = make(b, (s) => envelopeMotion(s, b).at(1));
    m.set(state, mo);
  }
  return mo;
}
export const envelopeView = (state: string, p: number, b: Block) => envelopeMotion(state, b).at(p);

// ---------------------------------------------------------------- checklist and timeline

export interface ChecklistView {
  /** Each card's resolution (tick, gray, or fail), 0..1, in card order. */
  cards: number[];
  /** Fraction of the affordability squares tinted. */
  tint: number;
}

const CARD_VERB: Record<CardStatus, 'stamp' | 'grayOut' | 'collapse'> = { tick: 'stamp', gray: 'grayOut', fail: 'collapse' };

const checklistMotion = cache((key: string) => {
  const statuses = key.split(',') as CardStatus[];
  const start: Record<string, number> = { tint: 0 };
  statuses.forEach((_, i) => (start[`c${i}`] = 0));
  return motion(start, [
    ...statuses.map((s, i) => ({ verb: CARD_VERB[s], to: { [`c${i}`]: 1 } })),
    { verb: 'fill', to: { tint: 1 } },
  ]);
});

export function checklistView(state: string, p: number, statuses: CardStatus[]): ChecklistView {
  if (state !== 'conditions-tick') throw new Error(`Checklist has no state "${state}"`);
  const v = checklistMotion(statuses.join(',')).at(p);
  return { cards: statuses.map((_, i) => v[`c${i}`]!), tint: v.tint! };
}

export interface TimelineView {
  /** Draw-on fraction of the approval path, the SB 35 branch, and the dated axis; the presumption marker's stamp. */
  path: number;
  branch: number;
  axis: number;
  marker: number;
}

const TIMELINE: Record<string, () => Motion<TimelineView>> = {
  'approval-path': () => motion({ path: 0, branch: 0, axis: 0, marker: 0 }, [
    { verb: 'draw', to: { path: 1 } },
    { verb: 'draw', to: { branch: 1 } },
    { verb: 'draw', to: { axis: 1 } },
    { verb: 'stamp', to: { marker: 1 } },
  ]),
};
const timelineMotion = cache((state: string) => {
  const make = TIMELINE[state];
  if (!make) throw new Error(`Timeline has no state "${state}"`);
  return make();
});
export const timelineView = (state: string, p: number) => timelineMotion(state).at(p);

// ---------------------------------------------------------------- registry

/** Every state each figure implements, for the dev panel and tests. */
export const IMPLEMENTED = {
  map: Object.keys(MAP),
  envelope: Object.keys(ENVELOPE),
  checklist: ['conditions-tick'],
  timeline: Object.keys(TIMELINE),
} as const;

/** Natural length in seconds of a state's motion. */
export function stateSeconds(figure: keyof typeof IMPLEMENTED, state: string, ctx: { block: Block; statuses: CardStatus[] }): number {
  switch (figure) {
    case 'map': return mapMotion(state).duration;
    case 'envelope': return envelopeMotion(state, ctx.block).duration;
    case 'checklist': return checklistMotion(ctx.statuses.join(',')).duration;
    case 'timeline': return timelineMotion(state).duration;
  }
}
