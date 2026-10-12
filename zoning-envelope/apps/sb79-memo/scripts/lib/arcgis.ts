/** Small ArcGIS REST client: layer info, id queries, and batched GeoJSON queries. */

export type Params = Record<string, string | number>;
export interface Feature { type: 'Feature'; id?: number | string; geometry: Geometry | null; properties: Record<string, unknown> }
export interface FeatureCollection { type: 'FeatureCollection'; features: Feature[] }
export type Geometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

async function request(url: string, params: Params, attempt = 0): Promise<unknown> {
  const body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  try {
    // POST keeps long objectIds lists out of the URL.
    const res = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text) throw new Error('empty response');
    const json = JSON.parse(text) as { error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    return json;
  } catch (err) {
    if (attempt >= 4) throw new Error(`${url}: ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return request(url, params, attempt + 1);
  }
}

export interface LayerInfo { name: string; lastEditDate: string | null; dataLastEditDate: string | null; maxRecordCount: number | null }

export async function layerInfo(layerUrl: string): Promise<LayerInfo> {
  const info = (await request(layerUrl, { f: 'json' })) as {
    name: string; maxRecordCount?: number; editingInfo?: { lastEditDate?: number; dataLastEditDate?: number };
  };
  const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);
  return {
    name: info.name,
    lastEditDate: iso(info.editingInfo?.lastEditDate),
    dataLastEditDate: iso(info.editingInfo?.dataLastEditDate),
    maxRecordCount: info.maxRecordCount ?? null,
  };
}

export async function queryJSON(layerUrl: string, params: Params): Promise<{ features: { attributes: Record<string, unknown> }[] }> {
  return (await request(`${layerUrl}/query`, { f: 'json', ...params })) as { features: { attributes: Record<string, unknown> }[] };
}

/** All features matching `params`, fetched by object id in batches (servers cap and page unevenly). */
export async function queryAll(layerUrl: string, params: Params, batch = 400): Promise<FeatureCollection> {
  const ids = ((await request(`${layerUrl}/query`, { ...params, returnIdsOnly: 'true', f: 'json' })) as { objectIds: number[] | null })
    .objectIds ?? [];
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const features: Feature[] = [];
  for (let i = 0; i < sorted.length; i += batch) {
    const fc = (await request(`${layerUrl}/query`, {
      objectIds: sorted.slice(i, i + batch).join(','),
      outFields: params.outFields ?? '*',
      outSR: 4326,
      f: 'geojson',
      ...(params.maxAllowableOffset ? { maxAllowableOffset: params.maxAllowableOffset } : {}),
      ...(params.returnGeometry !== undefined ? { returnGeometry: params.returnGeometry } : {}),
    })) as FeatureCollection;
    features.push(...fc.features);
  }
  if (features.length !== sorted.length) throw new Error(`${layerUrl}: expected ${sorted.length} features, got ${features.length}`);
  return { type: 'FeatureCollection', features };
}

/** Spatial filter: features within `radiusFt` of a lon/lat point. */
export const within = (lonLat: readonly [number, number], radiusFt: number): Params => ({
  geometry: `${lonLat[0]},${lonLat[1]}`,
  geometryType: 'esriGeometryPoint',
  inSR: 4326,
  spatialRel: 'esriSpatialRelIntersects',
  distance: radiusFt,
  units: 'esriSRUnit_Foot',
});
