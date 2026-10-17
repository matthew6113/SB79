/**
 * The figure data contract: what src/figures/figure-data.ts computes at build
 * time and the figure islands read. Every label that shows a number is built
 * there from @zoning-envelope/law and data/; the figures only place it.
 *
 * Frames:
 * - Map: one frame from California to a parcel: feet in EPSG:2227 relative to
 *   Exhibit B's center, SVG axes (x east, y south). viewBoxes are
 *   [x, y, width, height].
 * - Envelope: feet relative to the scene's site center, x east, y north;
 *   heights in feet.
 */

export type XY = [number, number];
export type Box = [x: number, y: number, w: number, h: number];

export interface FigureHandle {
  /** Show `state` at `progress` (0..1). Progress 1 is the state's settled look. */
  setState(state: string, progress: number): void;
}

export interface Label {
  at: XY;
  text: string;
  sub?: string;
}

export interface LegendItem {
  /** Swatch style: a CSS class for the fill, and an optional pattern. */
  swatch: string;
  pattern?: 'hatch' | 'dots' | 'cross';
  text: string;
}

export interface MapData {
  /** Camera stops (viewBoxes) for the continuous zoom. */
  views: { california: Box; sf: Box; berkeley: Box; rings: Box; hazards: Box; parcel: Box };
  california: {
    counties: { name: string; d: string; utc: boolean; openIssue: boolean }[];
    labels: { alameda: Label; orange: Label };
  };
  /** Cities whose alternative plans HCD has ruled on. */
  altPlans: { name: string; d: string; at: XY }[];
  sf: { zones: { tier: 1 | 2; band: string; d: string }[]; stamp: Label };
  berkeley: { d: string; stamp: Label; stations: { name: string; at: XY }[] };
  population: { title: string; lines: string[] };
  parcels: string;
  rail: string;
  station: { name: string; at: XY };
  accessPoints: { at: XY; elevator: boolean; primary: boolean }[];
  zones: { adjacent: string; quarter: string; half: string };
  ringLabels: Label[];
  tierStamp: Label;
  site: { d: string; at: XY; label: string };
  measure: { from: XY; to: XY; label: string };
  zoning: { district: string; cls: 'residential' | 'mixed' | 'commercial' | 'other'; d: string; label: Label }[];
  bart: { d: string; label: Label };
  hazards: { fire: { at: XY; r: number; label: string }; airport: { from: XY; to: XY; label: string } };
  rent: { estimate: string; unknown: string };
  historic: { landmark: string; merit: string };
  opportunity: { highest: string; high: string; other: string };
  pick: { clear: string; flagged: string; label: Label };
  legends: Record<string, LegendItem[]>;
  captions: Record<string, string>;
}

export interface Solid {
  ring: XY[];
  height: number;
}

export interface Plate {
  ring: XY[];
  elevation: number;
  thickness: number;
}

export interface EnvelopeData {
  block: {
    site: XY[];
    context: Solid[];
    ground: XY[][];
    localHeightFt: number;
    floorHeightFt: number;
    plates: Plate[];
    plateAreas: number[];
    residentialFloorAreaSqFt: number;
    unitFloor: number;
    /** Story lines inside the envelope (illustrative story height). */
    levels: number[];
    dots: [x: number, y: number, z: number][];
    /** Units the project minimum names, emphasized among the dots. */
    minUnits: number;
    /** Affordable units tinted among the dots at the unit floor (Berkeley's share, rounded up). */
    affordable: number;
    bonusDots: [x: number, y: number, z: number][];
    setback: { slab: XY[]; line: [XY, XY]; depth: number };
    /** Unit vector from the street into the lot, for the camera. */
    inward: XY;
  };
  rockridge: {
    site: XY[];
    localHeightFt: number;
    floorHeightFt: number;
    towers: { at: XY; heightFt: number }[];
    inward: XY;
  };
  exhibits: {
    key: 'A' | 'B' | 'C';
    ring: XY[];
    center: XY;
    localHeightFt: number;
    floorHeightFt: number;
    label: string;
    sub: string;
  }[];
  laborFt: number;
  labels: Record<string, string>;
  /** HTML panels for the project-minimum and affordability beats. */
  panels: { minimums: Panel; affordable: Panel };
  captions: Record<string, string>;
}

export interface Panel {
  title: string;
  rows: { text: string; cite?: string; strong?: boolean }[];
}

export interface TimelineData {
  start: string;
  end: string;
  events: { date: string; label: string; sub?: string; kind: 'law' | 'memo' | 'presumption' }[];
  path: {
    application: string;
    local: { title: string; sub: string };
    haa: { title: string; sub: string };
    sb35: { title: string; sub: string };
    presumption: { title: string; sub: string };
    site: string;
  };
  captions: Record<string, string>;
}

export interface FigureData {
  asOf: string;
  map: MapData;
  envelope: EnvelopeData;
  timeline: TimelineData;
}
