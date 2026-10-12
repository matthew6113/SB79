import { polygonArea, type Polygon } from './polygon';

/** A vertical prism: a footprint swept straight up from `base` to `top`. */
export interface Prism {
  readonly footprint: Polygon;
  readonly base: number;
  readonly top: number;
}

export interface ExtrudeOptions {
  /** Height of the prism above its base. */
  readonly height: number;
  /** Elevation of the bottom face. Defaults to 0 (grade). */
  readonly base?: number;
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0, got ${value}`);
  }
}

/** Extrude a parcel polygon to a height. */
export function extrude(footprint: Polygon, { height, base = 0 }: ExtrudeOptions): Prism {
  assertNonNegative(height, 'height');
  if (!Number.isFinite(base)) throw new Error(`base must be finite, got ${base}`);
  polygonArea(footprint); // validates the footprint
  return { footprint, base, top: base + height };
}

/** Volume of a prism: footprint area times height. */
export function prismVolume(prism: Prism): number {
  return polygonArea(prism.footprint) * (prism.top - prism.base);
}
