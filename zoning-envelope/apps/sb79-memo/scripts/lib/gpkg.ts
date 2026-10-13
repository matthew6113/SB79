/**
 * Read polygon features from an OGC GeoPackage with Node's built-in SQLite.
 * Geometry blobs are a GeoPackage header followed by little- or big-endian WKB.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Geometry } from './arcgis.ts';

function readWkb(buf: Buffer, start: number): { geometry: Geometry; end: number } {
  let o = start;
  const le = buf[o++] === 1;
  const u32 = () => { const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); o += 4; return v; };
  const f64 = () => { const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o); o += 8; return v; };
  const type = u32() % 1000; // drop Z/M offsets
  const ring = () => Array.from({ length: u32() }, () => [f64(), f64()]);
  const polygon = () => Array.from({ length: u32() }, ring);
  if (type === 3) return { geometry: { type: 'Polygon', coordinates: polygon() }, end: o };
  if (type === 6) {
    const polys: number[][][][] = [];
    for (let n = u32(); n > 0; n--) {
      const part = readWkb(buf, o);
      if (part.geometry.type !== 'Polygon') throw new Error('MultiPolygon part is not a polygon');
      polys.push(part.geometry.coordinates);
      o = part.end;
    }
    return { geometry: { type: 'MultiPolygon', coordinates: polys }, end: o };
  }
  throw new Error(`Unsupported WKB geometry type ${type}`);
}

export function gpkgGeometry(blob: Uint8Array): Geometry {
  const buf = Buffer.from(blob);
  if (buf.toString('ascii', 0, 2) !== 'GP') throw new Error('Not a GeoPackage geometry');
  const envelopeBytes = [0, 32, 48, 48, 64][(buf[3]! >> 1) & 0b111] ?? 0;
  return readWkb(buf, 8 + envelopeBytes).geometry;
}

export function readGpkg(path: string, sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare(sql).all() as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
