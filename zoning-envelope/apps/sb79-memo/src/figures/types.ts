/**
 * The figure data contract: what src/figures/figure-data.ts computes at build
 * time and the figure islands read. Every label that shows a number is built
 * there from @zoning-envelope/law and data/; the figures only place it.
 *
 * Frames:
 * - Map, local: feet in EPSG:2227 relative to Exhibit B's center, SVG axes
 *   (x east, y south). viewBoxes are [x, y, width, height].
 * - Map, California: d3 conic equal-area, fitted to CALIFORNIA_SIZE.
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

export interface MapData {
  california: {
    size: [number, number];
    counties: { name: string; d: string; utc: boolean; openIssue: boolean }[];
    labels: { alameda: Label; orange: Label };
    legend: { utc: string; openIssue: string };
  };
  local: {
    views: { station: Box; rings: Box; city: Box; bayArea: Box };
    parcels: { eligible: string; bart: string; notQualifying: string; outside: string };
    sites: { key: 'A' | 'B' | 'C'; d: string; at: XY; label: string }[];
    zones: { adjacent: string; quarter: string; half: string };
    ringLabels: Label[];
    rail: string;
    stations: { name: string; at: XY; primary: boolean }[];
    accessPoints: { at: XY; elevator: boolean; primary: boolean }[];
    measure: { from: XY; to: XY; label: string };
    tierStamp: Label;
    population: { at: XY; title: string; lines: string[] };
    eligibility: { eligible: string; bart: string; notQualifying: string; outside: string };
    /** County land (shoreline) under the city and Bay Area views. */
    land: string;
    berkeley: { d: string; label: Label; stamp: Label };
    jurisdictions: { name: string; d: string; status: 'defaults' | 'exclusions' | 'alternative-plan' | null }[];
    bayLabels: Label[];
    bayLegend: { defaults: string; exclusions: string; alternativePlan: string };
  };
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
  captions: Record<string, string>;
}

export type CardStatus = 'tick' | 'gray' | 'fail';

export interface ChecklistData {
  title: string;
  cards: { id: string; title: string; text: string; cite: string; status: CardStatus; note?: string }[];
  affordability: {
    title: string;
    rows: { label: string; percent: number; deeper?: { label: string; percent: number } }[];
    note: string;
  };
  captions: Record<string, string>;
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
  checklist: ChecklistData;
  timeline: TimelineData;
}
