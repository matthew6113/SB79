/**
 * Projection and measurement. Distances and areas are computed in
 * EPSG:2227 (NAD83 / California zone III, US survey feet), the State Plane
 * zone for Alameda County. A US survey foot differs from an international
 * foot by 2 parts per million (0.005 ft over a half mile).
 */
import proj4 from 'proj4';
import { distancePointToPolygon, polygonArea, type Point, type Polygon } from '@zoning-envelope/engine';
import type { Geometry } from './arcgis.ts';

proj4.defs(
  'EPSG:2227',
  '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.4333333333333 +lat_2=37.0666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs',
);
const toFt = proj4('EPSG:4326', 'EPSG:2227');

export const projectFt = (lonLat: readonly number[]): Point => toFt.forward([lonLat[0]!, lonLat[1]!]) as unknown as Point;
export const unprojectFt = (xy: Point): [number, number] => toFt.inverse([xy[0], xy[1]]) as [number, number];

/** Projected polygons of a GeoJSON Polygon or MultiPolygon. */
export function polygonsFt(geometry: Geometry): Polygon[] {
  const rings = (poly: number[][][]): Polygon => ({ outer: poly[0]!.map(projectFt), holes: poly.slice(1).map((r) => r.map(projectFt)) });
  if (geometry.type === 'Polygon') return [rings(geometry.coordinates)];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map(rings);
  throw new Error(`Expected a polygon, got ${geometry.type}`);
}

export const areaSqFt = (geometry: Geometry) => polygonsFt(geometry).reduce((sum, p) => sum + polygonArea(p), 0);

/** Straight-line feet from a lon/lat point to the nearest edge of a polygon geometry (0 if inside). */
export const distanceFt = (lonLat: readonly number[], geometry: Geometry) =>
  Math.min(...polygonsFt(geometry).map((p) => distancePointToPolygon(projectFt(lonLat), p)));

export const pointDistanceFt = (a: readonly number[], b: readonly number[]) => {
  const [ax, ay] = projectFt(a);
  const [bx, by] = projectFt(b);
  return Math.hypot(ax - bx, ay - by);
};

/** A circle of `radiusFt` around a lon/lat center, as a lon/lat ring. */
export function circle(center: readonly number[], radiusFt: number, segments = 256): [number, number][] {
  const [cx, cy] = projectFt(center);
  const ring = Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments;
    return unprojectFt([cx + radiusFt * Math.cos(a), cy + radiusFt * Math.sin(a)]);
  });
  return [...ring, ring[0]!];
}

/** Round coordinates to 1e-7 degrees (about 1 cm) for compact, stable files. */
export function roundGeometry<G extends Geometry | null>(g: G): G {
  if (!g) return g;
  const r = (n: number) => Math.round(n * 1e7) / 1e7;
  const deep = (c: unknown): unknown => (typeof c === 'number' ? r(c) : (c as unknown[]).map(deep));
  return { ...g, coordinates: deep(g.coordinates) } as G;
}
