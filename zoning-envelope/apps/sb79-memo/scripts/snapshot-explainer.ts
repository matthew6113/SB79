/**
 * Freeze the layers and documents the explainer's map adds beyond North
 * Berkeley (writes data/explainer/): San Francisco's SB 79 zones for the
 * alternative-plan zoom, BART's stations and AB 2923 parcels, the Beverly
 * Hills boundary, and the agency documents the text cites.
 *
 * Curated files in data/explainer/ (alternative-plans.json, hazards.json,
 * landmarks.json, rent-control.json, law-firm-memos.json) are written by hand
 * from these documents and from live queries whose URLs they record;
 * test/data.test.ts checks their quotes against sources/.
 *
 * Run: pnpm --filter @zoning-envelope/sb79-memo snapshot-explainer   (needs pdftotext)
 * Documents on hosts this script cannot reach can be supplied as
 * SB79_DOCS_DIR/<name>.pdf; their meta then says a local copy was used.
 */
import { layerInfo, queryAll, type FeatureCollection } from './lib/arcgis.ts';
import { pointDistanceFt } from './lib/geo.ts';
import { createWriter } from './lib/write.ts';
import manifest from '../data/manifest.json' with { type: 'json' };

const DATA = new URL('../data/explainer/', import.meta.url);
const STATION = manifest.center.lonLat as [number, number];
/** BART parcels kept within this distance of North Berkeley station (the main snapshot's radius). */
const RADIUS_FT = manifest.radiusFt;

const SFGIS = 'https://services.arcgis.com/Zs2aNLFN00jrS4gG/arcgis/rest/services';
const BART = 'https://services.arcgis.com/sqS7RNuF1BQinj5N/arcgis/rest/services/BART_AB_2923_Public_Service_20230201/FeatureServer';
const SOURCES = {
  sfZones: `${SFGIS}/SB79_Access_Points_and_Radii/FeatureServer/3`,
  bartStations: `${BART}/0`,
  bartParcels: `${BART}/3`,
  places: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Populated_Places/FeatureServer/0',
  hcdBeverlyHills: 'https://beverlyhills.org/DocumentCenter/View/15917',
  sfOrdinance: 'https://media.api.sf.gov/documents/o0082-26.pdf',
  sfExecSummary: 'https://citypln-m-extnl.sfgov.org/Commissions/CPC/3_19_2026/Commission%20Packet/2026-001412PCA.pdf',
  berkeleyRso: 'https://rentboard.berkeleyca.gov/sites/default/files/documents/Rent%20Stabilization%20Ordinance_BMC%20Chapter%2013.76.pdf',
} as const;

const out = createWriter(DATA);
const lastEdit = async (url: string) => {
  const i = await layerInfo(url);
  return i.dataLastEditDate ?? i.lastEditDate;
};
const trim = (fc: FeatureCollection, keep: string[]): FeatureCollection => ({
  ...fc,
  features: fc.features.map((f) => ({ ...f, properties: Object.fromEntries(keep.map((k) => [k, typeof f.properties[k] === 'string' ? (f.properties[k] as string).trim() : f.properties[k] ?? null])) })),
});

async function main() {
  // San Francisco's SB 79 zones: its copy of MTC's dissolved zones, clipped to the city.
  out.writeLayer('sf-tod-zones', trim(await queryAll(SOURCES.sfZones, { where: '1=1', maxAllowableOffset: 0.0001 }), ['zone_label']), {
    source: SOURCES.sfZones, sourceLastEdit: await lastEdit(SOURCES.sfZones), query: 'all zones, simplified (maxAllowableOffset 0.0001 degrees)',
    notes: 'San Francisco Planning\'s copy of MTC\'s SB 79 zones, one dissolved polygon per tier and band, within the city.',
  });

  // BART stations (all), for the Berkeley view's three stations.
  out.writeLayer('bart-stations', trim(await queryAll(SOURCES.bartStations, { where: '1=1' }), ['Station']), {
    source: SOURCES.bartStations, sourceLastEdit: await lastEdit(SOURCES.bartStations), query: 'all stations',
  });

  // BART's AB 2923 parcels near North Berkeley. The service applies `distance`
  // in the wrong unit, so the filter is an envelope plus a distance check here.
  const pad = 0.012;
  const env = { geometry: `${STATION[0] - pad},${STATION[1] - pad},${STATION[0] + pad},${STATION[1] + pad}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };
  const parcels = await queryAll(SOURCES.bartParcels, { ...env, outFields: '*' });
  const near = parcels.features.filter((f) => {
    const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] } | null;
    if (!g) return false;
    const rings = g.type === 'Polygon' ? (g.coordinates as number[][][]) : (g.coordinates as number[][][][]).flat();
    return rings.some((r) => r.some((p) => pointDistanceFt(p, STATION) <= RADIUS_FT));
  });
  const keys = Object.keys(near[0]?.properties ?? {});
  const pick = (want: RegExp) => keys.find((k) => want.test(k));
  const fields = { apn: pick(/^APN/i), station: pick(/STATION/i), acres: pick(/^ACRE/i), eligible: pick(/AB2923_Parcel|AB_?2923/i) };
  out.writeLayer('bart-ab2923-parcels', {
    type: 'FeatureCollection',
    features: near.map((f) => ({ ...f, properties: { apn: f.properties[fields.apn!] ?? null, station: f.properties[fields.station!] ?? null, acres: f.properties[fields.acres!] ?? null, ab2923: f.properties[fields.eligible!] ?? null } })),
  }, {
    source: SOURCES.bartParcels, sourceLastEdit: await lastEdit(SOURCES.bartParcels),
    query: `envelope ±${pad} degrees around station ${manifest.center.stationId}, then any vertex within ${RADIUS_FT} ft`, fieldsUsed: fields,
  });

  // Beverly Hills, for the California view's alternative-plan cities.
  out.writeLayer('beverly-hills', trim(await queryAll(SOURCES.places, { where: "NAME='Beverly Hills' AND ST='CA'", maxAllowableOffset: 0.0005 }), ['NAME', 'ST', 'PLACEFIPS']), {
    source: SOURCES.places, sourceLastEdit: await lastEdit(SOURCES.places), query: "NAME='Beverly Hills' AND ST='CA', simplified (maxAllowableOffset 0.0005 degrees)",
    notes: 'Esri Living Atlas, U.S. Census populated places.',
  });

  // Documents the text cites.
  await out.pdfText('hcd-beverly-hills-review-2026-05-08', SOURCES.hcdBeverlyHills);
  await out.pdfText('sf-ordinance-082-26', SOURCES.sfOrdinance);
  await out.pdfText('sfplanning-sb79-exec-summary-2026-03-19', SOURCES.sfExecSummary);
  await out.pdfText('berkeley-rso-bmc-13.76', SOURCES.berkeleyRso);

  out.writeManifest({ center: manifest.center, radiusFt: RADIUS_FT });
}

await main();
