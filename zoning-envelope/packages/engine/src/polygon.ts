/**
 * Planar polygons in a local, projected frame. Units are whatever the caller
 * projects into; the memo uses feet throughout.
 */
export type Point = readonly [x: number, y: number];

/** A ring of vertices. Closing the ring (repeating the first point) is optional. */
export type Ring = readonly Point[];

export interface Polygon {
  readonly outer: Ring;
  readonly holes?: readonly Ring[];
}

function assertRing(ring: Ring, label: string): void {
  const distinct = isClosed(ring) ? ring.length - 1 : ring.length;
  if (distinct < 3) {
    throw new Error(`${label} needs at least 3 distinct vertices, got ${distinct}`);
  }
  for (const [x, y] of ring) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`${label} has a non-finite coordinate`);
    }
  }
}

function isClosed(ring: Ring): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return ring.length > 1 && first !== undefined && last !== undefined &&
    first[0] === last[0] && first[1] === last[1];
}

/** Shoelace area of a ring, always non-negative regardless of winding. */
export function ringArea(ring: Ring): number {
  assertRing(ring, 'Ring');
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** Area of the outer ring minus its holes. */
export function polygonArea(polygon: Polygon): number {
  const holes = polygon.holes ?? [];
  const area = ringArea(polygon.outer) - holes.reduce((sum, h) => sum + ringArea(h), 0);
  if (area < 0) throw new Error('Holes are larger than the outer ring');
  return area;
}
