import type { Point, Polygon, Ring } from './polygon.ts';

/** Shortest distance from point p to the segment a–b. */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Even-odd ray cast. Points exactly on an edge may land either way; distance is 0 there regardless. */
function insideRing(p: Point, ring: Ring): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when p lies inside the outer ring and outside every hole. */
export function pointInPolygon(p: Point, polygon: Polygon): boolean {
  return insideRing(p, polygon.outer) && !(polygon.holes ?? []).some((h) => insideRing(p, h));
}

function ringDistance(p: Point, ring: Ring): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    best = Math.min(best, pointToSegmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return best;
}

/**
 * Straight-line distance from a point to the nearest edge of a polygon, or 0
 * when the point is inside it. SB 79 measures from the parcel's nearest edge
 * to a pedestrian access point (Gov. Code § 65912.157(b)).
 */
export function distancePointToPolygon(p: Point, polygon: Polygon): number {
  if (pointInPolygon(p, polygon)) return 0;
  return Math.min(ringDistance(p, polygon.outer), ...(polygon.holes ?? []).map((h) => ringDistance(p, h)));
}
