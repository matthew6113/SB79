import { polygonArea, type Polygon } from './polygon.ts';

export interface FloorPlate {
  /** 0 for the ground floor. */
  readonly index: number;
  /** Elevation of the plate's floor. */
  readonly elevation: number;
  /** Floor-to-floor height of this story. */
  readonly height: number;
  /** Floor area on this plate. Equals the footprint area except on a partial top plate. */
  readonly area: number;
  /** True when the plate holds less than the full footprint because `maxFloorArea` ran out. */
  readonly partial: boolean;
}

export interface StackOptions {
  /** Floor-to-floor height of every story. A design assumption, not a legal value. */
  readonly floorToFloor: number;
  /** No story may extend above this elevation. */
  readonly maxHeight: number;
  /** Stop once the stacked plates hold this much floor area in total. */
  readonly maxFloorArea?: number;
  /** Elevation of the ground floor. Defaults to 0. */
  readonly base?: number;
}

/** Floating-point tolerance so a story that ends exactly at `maxHeight` is not dropped. */
const EPSILON = 1e-9;

/**
 * Stack floor plates of the footprint's area, one story at a time, until the
 * next story would rise above `maxHeight` or the total reaches `maxFloorArea`.
 * When the area cap is the binding limit, the top plate is partial.
 */
export function stackFloorPlates(footprint: Polygon, options: StackOptions): FloorPlate[] {
  const { floorToFloor, maxHeight, maxFloorArea = Infinity, base = 0 } = options;
  if (!Number.isFinite(floorToFloor) || floorToFloor <= 0) {
    throw new Error(`floorToFloor must be a finite number > 0, got ${floorToFloor}`);
  }
  if (!Number.isFinite(maxHeight)) throw new Error(`maxHeight must be finite, got ${maxHeight}`);
  if (Number.isNaN(maxFloorArea) || maxFloorArea < 0) {
    throw new Error(`maxFloorArea must be >= 0, got ${maxFloorArea}`);
  }

  const plateArea = polygonArea(footprint);
  const plates: FloorPlate[] = [];
  let remaining = maxFloorArea;

  for (let index = 0; remaining > EPSILON && plateArea > 0; index++) {
    const elevation = base + index * floorToFloor;
    if (elevation + floorToFloor > maxHeight + EPSILON) break;
    const area = Math.min(plateArea, remaining);
    plates.push({ index, elevation, height: floorToFloor, area, partial: area < plateArea });
    remaining -= area;
  }
  return plates;
}

/** Sum of floor area across plates. */
export function totalFloorArea(plates: readonly FloorPlate[]): number {
  return plates.reduce((sum, p) => sum + p.area, 0);
}
