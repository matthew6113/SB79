import type { Point, Polygon, Ring } from './polygon.ts';

/** The point on segment a–b closest to p. */
export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return [ax + t * dx, ay + t * dy];
}

/** Shortest distance from point p to the segment a–b. */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const [cx, cy] = closestPointOnSegment(p, a, b);
  return Math.hypot(p[0] - cx, p[1] - cy);
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

/**
 * The point on a polygon's boundary nearest to p, and its distance; p itself
 * at distance 0 when p is inside. Used to draw the statute's measuring line.
 */
export function nearestPointOnPolygon(p: Point, polygon: Polygon): { point: Point; distance: number } {
  if (pointInPolygon(p, polygon)) return { point: p, distance: 0 };
  let best = { point: p, distance: Infinity };
  for (const ring of [polygon.outer, ...(polygon.holes ?? [])]) {
    for (let i = 0; i < ring.length; i++) {
      const q = closestPointOnSegment(p, ring[i]!, ring[(i + 1) % ring.length]!);
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best.distance) best = { point: q, distance: d };
    }
  }
  return best;
}
