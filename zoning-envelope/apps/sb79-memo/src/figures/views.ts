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
import type { EnvelopeData } from './types';

const cache = <K, V>(make: (k: K) => V) => {
  const m = new Map<K, V>();
  return (k: K) => {
    if (!m.has(k)) m.set(k, make(k));
    return m.get(k)!;
  };
};

// ---------------------------------------------------------------- map

/**
 * Camera stops for the map's one continuous zoom, from California to a parcel.
 * Each is a viewBox in the map frame (figure-data.ts); a state moves the
 * camera from box[0] to box[1] as `zoom` runs 0..1.
 */
export type MapCamera = 'california' | 'sf' | 'berkeley' | 'rings' | 'hazards' | 'parcel';
export type MapLegend = 'counties' | 'alt' | 'sf' | 'distance' | 'zoning' | 'bart' | 'hazards' | 'rent' | 'historic' | 'opportunity' | 'pick';

export interface MapView {
  box: [MapCamera, MapCamera];
  zoom: number;
  /** California: county outlines, the urban transit counties filling in, Alameda, Orange. */
  ca: number;
  utc: number;
  /** Opacity of the counties' fill, faded as the camera leaves the state view. */
  utcAlpha: number;
  alameda: number;
  orange: number;
  /** Cities with an alternative plan HCD has ruled on, grayed, and their status labels. */
  alt: number;
  altLabels: number;
  /** San Francisco's SB 79 zones: draw-on, then grayed out under its alternative plan. */
  sfZones: number;
  sfGray: number;
  sfStamp: number;
  /** Berkeley: city line, its BART stations, the population badge, the no-exclusions stamp. */
  berkeley: number;
  bartStations: number;
  population: number;
  noExclusions: number;
  /** North Berkeley: parcels, track, station, tier, access points, zones, the measuring line. */
  parcels: number;
  rail: number;
  station: number;
  tier: number;
  accessPoints: number;
  rings: number;
  ringLabels: number;
  site: number;
  measure: number;
  /** Map-shaped requirements, one layer each. */
  zoning: number;
  zoningLabels: number;
  bart: number;
  fire: number;
  airport: number;
  rent: number;
  historic: number;
  opportunity: number;
  /** The parcels none of the layers flags, and the example lot picked from them. */
  pick: number;
  pickSite: number;
  /** The legend crossfades from legendFrom to legend as legendIn runs 0..1. */
  legend: MapLegend | null;
  legendFrom: MapLegend | null;
  legendIn: number;
}

const MAP_START: MapView = {
  box: ['california', 'california'], zoom: 1,
  ca: 0.35, utc: 0, utcAlpha: 1, alameda: 0, orange: 0, alt: 0, altLabels: 0, sfZones: 0, sfGray: 0, sfStamp: 0,
  berkeley: 0, bartStations: 0, population: 0, noExclusions: 0,
  parcels: 0, rail: 0, station: 0, tier: 0, accessPoints: 0, rings: 0, ringLabels: 0, site: 0, measure: 0,
  zoning: 0, zoningLabels: 0, bart: 0, fire: 0, airport: 0, rent: 0, historic: 0, opportunity: 0, pick: 0, pickSite: 0,
  legend: null, legendFrom: null, legendIn: 0,
};

/** Start a state from `prev`'s settled view, with a new legend that fades in. */
function mapFrom(prev: string, legend: MapLegend | null, extra: Partial<MapView> = {}): MapView {
  const v = mapMotion(prev).at(1);
  const shown = v.legendIn >= 0.5 ? v.legend : v.legendFrom;
  return legend === shown
    ? { ...v, legend, legendFrom: null, legendIn: 1, ...extra }
    : { ...v, legend, legendFrom: shown, legendIn: 0, ...extra };
}
/** Move the camera on from where `prev` left it. */
const camera = (prev: string, to: MapCamera): Partial<MapView> => ({ box: [mapMotion(prev).at(1).box[1], to], zoom: 0 });

type MB = Beat<MapView>;
const MAP: Record<string, () => Motion<MapView>> = {
  california: () => motion(MAP_START, [
    { verb: 'show', to: { ca: 1 } },
  ] satisfies MB[]),
  'utc-fill': () => motion(mapFrom('california', 'counties'), [
    { verb: 'show', to: { legendIn: 1 } },
    { verb: 'fill', to: { utc: 1 }, at: '<' },
  ]),
  'transit-counties': () => motion(mapFrom('utc-fill', 'counties'), [
    { verb: 'stamp', to: { alameda: 1 } },
    { verb: 'show', to: { orange: 1 } },
  ]),
  'alt-plan-cities': () => motion(mapFrom('transit-counties', 'alt'), [
    { verb: 'show', to: { legendIn: 1, orange: 0 } },
    { verb: 'grayOut', to: { alt: 1 } },
    { verb: 'show', to: { altLabels: 1 } },
  ]),
  'sf-plan': () => motion(mapFrom('alt-plan-cities', 'sf', camera('alt-plan-cities', 'sf')), [
    { verb: 'show', to: { altLabels: 0, alameda: 0, legendIn: 1 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { utcAlpha: 0.2 }, at: '<' },
    { verb: 'draw', to: { sfZones: 1 } },
    { verb: 'grayOut', to: { sfGray: 1 } },
    { verb: 'stamp', to: { sfStamp: 1 } },
  ]),
  berkeley: () => motion(mapFrom('sf-plan', null, camera('sf-plan', 'berkeley')), [
    { verb: 'show', to: { sfStamp: 0, legendIn: 1, utc: 0 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { berkeley: 1, bartStations: 1 } },
    { verb: 'show', to: { population: 1 } },
    { verb: 'stamp', to: { noExclusions: 1 } },
  ]),
  'station-rings': () => motion(mapFrom('berkeley', 'distance', camera('berkeley', 'rings')), [
    { verb: 'show', to: { noExclusions: 0, population: 0, bartStations: 0, berkeley: 0, sfZones: 0, alt: 0 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { parcels: 1, rail: 1, station: 1 }, at: '<0.4' },
    { verb: 'stamp', to: { tier: 1 } },
    { verb: 'show', to: { accessPoints: 1, legendIn: 1 } },
    { verb: 'draw', to: { rings: 1 } },
    { verb: 'show', to: { ringLabels: 1, site: 1 } },
    { verb: 'draw', to: { measure: 1 } },
  ]),
  zoning: () => motion(mapFrom('station-rings', 'zoning'), [
    { verb: 'show', to: { tier: 0, measure: 0, legendIn: 1 } },
    { verb: 'show', to: { zoning: 1 } },
    { verb: 'show', to: { zoningLabels: 1 } },
  ]),
  'bart-land': () => motion(mapFrom('zoning', 'bart'), [
    { verb: 'show', to: { zoningLabels: 0, zoning: 0.3, legendIn: 1 } },
    { verb: 'show', to: { bart: 1 } },
  ]),
  hazards: () => motion(mapFrom('bart-land', 'hazards', camera('bart-land', 'hazards')), [
    { verb: 'show', to: { bart: 0, legendIn: 1 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'draw', to: { fire: 1 } },
    { verb: 'show', to: { airport: 1 } },
  ]),
  'rent-control': () => motion(mapFrom('hazards', 'rent', camera('hazards', 'rings')), [
    { verb: 'show', to: { fire: 0, airport: 0, legendIn: 1 } },
    { verb: 'move', to: { zoom: 1 }, at: '<' },
    { verb: 'show', to: { rent: 1 } },
  ]),
  historic: () => motion(mapFrom('rent-control', 'historic'), [
    { verb: 'show', to: { rent: 0.25, legendIn: 1 } },
    { verb: 'show', to: { historic: 1 } },
  ]),
  'high-resource': () => motion(mapFrom('historic', 'opportunity'), [
    { verb: 'show', to: { rent: 0, historic: 0.25, zoning: 0, legendIn: 1 } },
    { verb: 'show', to: { opportunity: 1 } },
  ]),
  'pick-parcel': () => motion(mapFrom('high-resource', 'pick', camera('high-resource', 'parcel')), [
    { verb: 'show', to: { opportunity: 0, historic: 0, ringLabels: 0, accessPoints: 0, legendIn: 1 } },
    { verb: 'show', to: { pick: 1 } },
    { verb: 'move', to: { zoom: 1 } },
    { verb: 'stamp', to: { pickSite: 1 } },
  ]),
};

const mapMotion = cache((state: string) => {
  const make = MAP[state];
  if (!make) throw new Error(`MapFigure has no state "${state}"`);
  return make();
});
export const mapView = (state: string, p: number) => mapMotion(state).at(p);

/**
 * Smooth zoom between two views (van Wijk and Nuij 2003, as d3.interpolateZoom
 * with rho = sqrt 2): the camera pulls back as it pans so long moves stay
 * legible. Views are [x, y, w, h] boxes; the aspect ratio blends linearly.
 */
export function smoothZoom(a: readonly [number, number, number, number], b: readonly [number, number, number, number], t: number): [number, number, number, number] {
  if (t <= 0) return [a[0], a[1], a[2], a[3]];
  if (t >= 1) return [b[0], b[1], b[2], b[3]];
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = [a[0] + a[2] / 2, a[1] + a[3] / 2, a[2]];
  const [ux1, uy1, w1] = [b[0] + b[2] / 2, b[1] + b[3] / 2, b[2]];
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  let ux: number, uy: number, w: number;
  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / rho;
    [ux, uy, w] = [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    const S = (r1 - r0) / rho;
    const s = t * S;
    const u = (w0 / (rho2 * d1)) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0));
    [ux, uy, w] = [ux0 + u * dx, uy0 + u * dy, (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0)];
  }
  const h = w * ((a[3] / a[2]) * (1 - t) + (b[3] / b[2]) * t);
  return [ux - w / 2, uy - h / 2, w, h];
}

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
  /** Project minimums: the first units emphasized, and the panel listing the conditions. */
  minUnits: number;
  minPanel: number;
  /** Affordable units tinted (0..1 of the count), and the affordability panel. */
  afford: number;
  affordPanel: number;
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
  scene, from: null, mix: 1, ghost: 1, localLabel: 0, height: b.localHeightFt, solid: 0, red: 0,
  dimension: 0, units: 0, dots: 1, bonus: 0, levels: 0, lock: 0, floorArea: 0, plates: 1, setback: 0, setbackGray: 0,
  precludeStamp: 0, minUnits: 0, minPanel: 0, afford: 0, affordPanel: 0, toggle: 0, collapseStamp: 0, rockRise: 0, towers: 0, exRise: 0, labor: 0, totals: 0,
});

type EB = Beat<EnvelopeView>;
const ENVELOPE: Record<string, (b: Block, after: (s: string) => EnvelopeView) => Motion<EnvelopeView>> = {
  ghost: (b) => motion({ ...envStart(b), ghost: 0 }, [
    { verb: 'show', to: { ghost: 1, localLabel: 1 } },
  ]),
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
  minimums: (_b, after) => motion(after('setback-cannot-preclude'), [
    { verb: 'show', to: { setback: 0, setbackGray: 0, precludeStamp: 0, solid: 0.3, dots: 1, levels: 1 } },
    { verb: 'fill', to: { minUnits: 1 } },
    { verb: 'show', to: { minPanel: 1 } },
  ] satisfies EB[]),
  'affordable-units': (_b, after) => motion(after('minimums'), [
    { verb: 'show', to: { minUnits: 0, minPanel: 0, affordPanel: 1 } },
    { verb: 'fill', to: { afford: 1 } },
  ]),
  collapse: (b, after) => motion(after('affordable-units'), [
    { verb: 'show', to: { afford: 0, affordPanel: 0, dots: 0, levels: 0, solid: 1 } },
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

// ---------------------------------------------------------------- timeline

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
  timeline: Object.keys(TIMELINE),
} as const;

/** Natural length in seconds of a state's motion. */
export function stateSeconds(figure: keyof typeof IMPLEMENTED, state: string, ctx: { block: Block }): number {
  switch (figure) {
    case 'map': return mapMotion(state).duration;
    case 'envelope': return envelopeMotion(state, ctx.block).duration;
    case 'timeline': return timelineMotion(state).duration;
  }
}
