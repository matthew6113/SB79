import { describe, expect, it } from 'vitest';
import {
  distancePointToPolygon,
  pointInPolygon,
  pointToSegmentDistance,
  extrude,
  polygonArea,
  prismVolume,
  ringArea,
  stackFloorPlates,
  totalFloorArea,
  type Polygon,
} from '../src/index.ts';

// A 50 x 100 rectangle: an ordinary 5,000 sq ft lot.
const lot: Polygon = { outer: [[0, 0], [50, 0], [50, 100], [0, 100]] };

describe('polygon area', () => {
  it('measures a rectangle', () => {
    expect(polygonArea(lot)).toBe(5000);
  });

  it('ignores winding and an explicit closing vertex', () => {
    expect(ringArea([[0, 0], [0, 100], [50, 100], [50, 0], [0, 0]])).toBe(5000);
  });

  it('measures an irregular (L-shaped) parcel', () => {
    const l: Polygon = { outer: [[0, 0], [40, 0], [40, 20], [20, 20], [20, 60], [0, 60]] };
    expect(polygonArea(l)).toBe(40 * 20 + 20 * 40);
  });

  it('subtracts holes', () => {
    const withHole: Polygon = { ...lot, holes: [[[10, 10], [20, 10], [20, 20], [10, 20]]] };
    expect(polygonArea(withHole)).toBe(4900);
  });

  it('rejects degenerate rings', () => {
    expect(() => ringArea([[0, 0], [1, 1]])).toThrow();
    expect(() => ringArea([[0, 0], [1, 0], [1, 1], [0, 0]])).not.toThrow();
    expect(() => ringArea([[0, 0], [1, 0], [0, 0]])).toThrow();
    expect(() => ringArea([[0, 0], [Number.NaN, 0], [1, 1]])).toThrow();
  });
});

describe('extrude and volume', () => {
  it('extrudes a parcel to a height and measures its volume', () => {
    const prism = extrude(lot, { height: 40 });
    expect(prism.base).toBe(0);
    expect(prism.top).toBe(40);
    expect(prismVolume(prism)).toBe(200_000);
  });

  it('extrudes from a raised base', () => {
    const prism = extrude(lot, { base: 10, height: 30 });
    expect(prism.top).toBe(40);
    expect(prismVolume(prism)).toBe(150_000);
  });

  it('rejects negative or non-finite heights', () => {
    expect(() => extrude(lot, { height: -1 })).toThrow();
    expect(() => extrude(lot, { height: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe('stackFloorPlates', () => {
  it('stacks full stories up to the height limit', () => {
    const plates = stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 45 });
    expect(plates.map((p) => p.elevation)).toEqual([0, 10, 20, 30]);
    expect(plates.every((p) => p.area === 5000 && !p.partial)).toBe(true);
  });

  it('keeps a story that ends exactly at the height limit', () => {
    expect(stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 40 })).toHaveLength(4);
    expect(stackFloorPlates(lot, { floorToFloor: 0.1, maxHeight: 0.3 })).toHaveLength(3);
  });

  it('stops when the floor-area cap is reached, leaving a partial top plate', () => {
    const plates = stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 100, maxFloorArea: 12_500 });
    expect(plates.map((p) => p.area)).toEqual([5000, 5000, 2500]);
    expect(plates.at(-1)?.partial).toBe(true);
    expect(totalFloorArea(plates)).toBe(12_500);
  });

  it('lets height bind before the area cap', () => {
    const plates = stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 20, maxFloorArea: 1e9 });
    expect(totalFloorArea(plates)).toBe(10_000);
  });

  it('returns no plates when nothing fits', () => {
    expect(stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 5 })).toEqual([]);
    expect(stackFloorPlates(lot, { floorToFloor: 10, maxHeight: 50, maxFloorArea: 0 })).toEqual([]);
  });

  it('rejects a non-positive floor-to-floor height', () => {
    expect(() => stackFloorPlates(lot, { floorToFloor: 0, maxHeight: 50 })).toThrow();
  });
});

describe('distance from a parcel edge', () => {
  it('measures to the nearest edge, not a vertex or the centroid', () => {
    expect(distancePointToPolygon([25, 130], lot)).toBe(30); // straight above the top edge
    expect(distancePointToPolygon([80, 50], lot)).toBe(30); // beside the right edge
  });

  it('measures to the nearest vertex when the point is off a corner', () => {
    expect(distancePointToPolygon([53, 104], lot)).toBe(5); // 3-4-5 from (50, 100)
  });

  it('is zero inside the parcel and on its edge', () => {
    expect(distancePointToPolygon([10, 10], lot)).toBe(0);
    expect(distancePointToPolygon([50, 50], lot)).toBe(0);
  });

  it('treats a point inside a hole as outside the parcel', () => {
    const withHole: Polygon = { ...lot, holes: [[[10, 10], [40, 10], [40, 40], [10, 40]]] };
    expect(pointInPolygon([25, 25], withHole)).toBe(false);
    expect(distancePointToPolygon([25, 25], withHole)).toBe(15);
  });

  it('handles a degenerate segment', () => {
    expect(pointToSegmentDistance([3, 4], [0, 0], [0, 0])).toBe(5);
  });
});
