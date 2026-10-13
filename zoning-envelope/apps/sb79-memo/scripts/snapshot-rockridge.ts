/**
 * Freeze the memo's contrast site for III.D: 5727 College Ave, Oakland (the
 * Rockridge Trader Joe's), near Rockridge BART. Writes data/rockridge/.
 *
 * The memo uses this site to contrast SB 79 with the State Density Bonus Law,
 * which the pending application there relies on. It is an illustration, not
 * an opinion on that application.
 *
 * Run: pnpm --filter @zoning-envelope/sb79-memo snapshot-rockridge   (needs pdftotext)
 */
import { evaluateSite, law } from '@zoning-envelope/law';
import { layerInfo, queryAll, queryJSON, within, type Feature, type Geometry } from './lib/arcgis.ts';
import { areaSqFt, distanceFt } from './lib/geo.ts';
import { OPPORTUNITY_MAP_URL, opportunityAreas } from './lib/opportunity.ts';
import { createWriter } from './lib/write.ts';

const DATA = new URL('../data/rockridge/', import.meta.url);
const APN = '14-1266-47-1';
/** MTC features within this distance of the parcel are kept for the figure. */
const RADIUS_FT = 3000;

const MTC = 'https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services';
const OAKGIS = 'https://services.arcgis.com/9tC74aDHuml0x5Yz/arcgis/rest/services';
const SOURCES = {
  countyParcels: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0',
  stations: `${MTC}/mtc_sb79_tod_stations/FeatureServer/1`,
  accessPoints: `${MTC}/mtc_sb79_tod_access_points/FeatureServer/1`,
  zones: `${MTC}/mtc_sb79_tod_zones/FeatureServer/1`,
  jurisdictions: `${MTC}/mtc_sb79_jurisdictions_with_pop_acs2019_2023/FeatureServer/1`,
  oaklandBaseZones: `${OAKGIS}/Zoning_Group_Layers_/FeatureServer/0`,
  oaklandS8: `${OAKGIS}/Zoning_Group_Layers_/FeatureServer/7`,
  oaklandHeight: `${OAKGIS}/Height___Commercial_Corridor_Eff20241217_Ord13823/FeatureServer/0`,
  legistarMatter: 'https://webapi.legistar.com/v1/oakland/matters/36970',
  ordinanceText: 'https://oakland.legistar1.com/oakland/attachments/21ed23c1-c080-4849-bd24-0c6b4a770de6.pdf',
  ordinanceSigned: 'https://oakland.legistar1.com/oakland/attachments/7be6e13c-d823-4482-97b9-2c1a357e6a3c.pdf',
  factSheet: 'https://ubaoakland.org/projects/two-towers/',
  piedmontExedra: 'https://piedmontexedra.com/2026/07/state-laws-may-make-oaklands-rockridge-trader-joes-housing-project-hard-to-stop',
  sfYimby: 'https://sfyimby.com/2026/08/reduced-height-and-increased-retail-for-rockridge-tower-oakland.html',
} as const;

const out = createWriter(DATA);
const iso = (ms: unknown) => (typeof ms === 'number' ? new Date(ms).toISOString() : null);

/** Attributes of the single feature of an Oakland layer under a point. */
async function at(layer: string, point: readonly number[]) {
  const res = await queryJSON(layer, {
    geometry: `${point[0]},${point[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false',
  });
  if (res.features.length !== 1) throw new Error(`${layer}: expected one feature at the parcel, got ${res.features.length}`);
  return res.features[0]!.attributes;
}

async function main() {
  // Parcel (Alameda County assessor geometry).
  const pInfo = await layerInfo(SOURCES.countyParcels);
  const parcels = await queryAll(SOURCES.countyParcels, { where: `APN='${APN}'`, outFields: 'APN,SitusAddress,UseCode' });
  const parcel = parcels.features[0];
  if (parcels.features.length !== 1 || !parcel?.geometry) throw new Error(`Expected one parcel ${APN}`);
  const geometry = parcel.geometry as Geometry;
  if (geometry.type !== 'Polygon') throw new Error('Expected a single-polygon parcel');
  const ring = geometry.coordinates[0]!;
  // A point inside the parcel for the point-in-zone lookups (the vertex average works for this convex lot).
  const inside = ring.slice(0, -1).reduce((a, v, _, all) => [a[0]! + v[0]! / all.length, a[1]! + v[1]! / all.length], [0, 0]);
  const gisAreaSqFt = Math.round(areaSqFt(geometry));
  out.writeLayer('parcel', {
    type: 'FeatureCollection',
    features: [{ ...parcel, properties: { apn: APN, address: String(parcel.properties.SitusAddress).trim(), useCode: parcel.properties.UseCode, gisAreaSqFt } }],
  }, { source: SOURCES.countyParcels, sourceLastEdit: pInfo.dataLastEditDate ?? pInfo.lastEditDate, query: `APN='${APN}'`, notes: 'gisAreaSqFt is computed from the geometry in EPSG:2227; the county layer has no lot-size field.' });

  // MTC SB 79 map around the site.
  for (const [name, url, fields] of [
    ['tod-stations', SOURCES.stations, 'station_id,station_name'],
    ['tod-access-points', SOURCES.accessPoints, 'access_id,station_id,access_point_name,location_type,ranked_tod_tier'],
  ] as const) {
    const info = await layerInfo(url);
    const fc = await queryAll(url, { ...within(inside as [number, number], RADIUS_FT), outFields: fields });
    fc.features = fc.features
      .map((f) => {
        const p = Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
        if (name === 'tod-access-points') p.isElevator = /elevator/i.test(String(p.access_point_name));
        return { ...f, properties: p };
      })
      .sort((a, b) => String(a.properties.access_id ?? a.properties.station_id).localeCompare(String(b.properties.access_id ?? b.properties.station_id)));
    out.writeLayer(name, fc, { source: url, sourceLastEdit: info.dataLastEditDate ?? info.lastEditDate, query: `within ${RADIUS_FT} ft of parcel ${APN}` });
  }
  const zInfo = await layerInfo(SOURCES.zones);
  const zones = await queryAll(SOURCES.zones, { geometry: JSON.stringify({ rings: geometry.coordinates, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'zone_id,zone_label' });
  out.writeLayer('tod-zones', zones, { source: SOURCES.zones, sourceLastEdit: zInfo.dataLastEditDate ?? zInfo.lastEditDate, query: `zones intersecting parcel ${APN}` });

  // Oakland's own zoning, SB 79 (S-8) status, and height area at the parcel.
  const [baseInfo, s8Info, hInfo] = await Promise.all([layerInfo(SOURCES.oaklandBaseZones), layerInfo(SOURCES.oaklandS8), layerInfo(SOURCES.oaklandHeight)]);
  const base = await at(SOURCES.oaklandBaseZones, inside);
  const s8 = await at(SOURCES.oaklandS8, inside);
  const height = await at(SOURCES.oaklandHeight, inside);
  out.writeData('oakland-zoning', {
    baseZone: { zone: base.BASEZONE, ordinance: base.ORDINANCE, lastUpdate: base.LASTUPDATE, source: SOURCES.oaklandBaseZones, sourceLastEdit: baseInfo.dataLastEditDate },
    s8: {
      tier: s8.TIER, distance: s8.DISTANCE, eligible: s8.ELGBLTY, availability: s8.AVAIL, apn: s8.APN_1, address: s8.FULL_SITUSADDRESS,
      source: SOURCES.oaklandS8, sourceLastEdit: s8Info.dataLastEditDate,
      note: "Oakland's S-8 combining zone (Ord. 13875 C.M.S., effective 2026-07-01). AVAIL 'Covered' means eligible and not excluded: SB 79's standards apply.",
    },
    heightArea: { maxHeightFt: Number(height.MAXHEIGHT), effective: iso(height.EFFCTVDATE), source: SOURCES.oaklandHeight, sourceLastEdit: hInfo.dataLastEditDate },
    zoningClass: { value: 'commercial', note: 'CN-2 is a Neighborhood Commercial zone; Oakland\'s S-8 layer marks the parcel eligible (zoned residential, mixed, or commercial).' },
  }, SOURCES.oaklandS8, s8Info.dataLastEditDate);

  // Oakland's SB 79 ordinance: the Legistar record and the text that went to final passage.
  const matter = (await (await fetch(SOURCES.legistarMatter)).json()) as Record<string, unknown>;
  const history = (await (await fetch(`${SOURCES.legistarMatter}/histories`)).json()) as Record<string, unknown>[];
  out.writeData('oakland-ordinance', {
    file: matter.MatterFile, title: String(matter.MatterTitle).split('\n')[0], status: matter.MatterStatusName,
    enactmentNumber: matter.MatterEnactmentNumber, passed: String(matter.MatterPassedDate).slice(0, 10),
    history: history
      .map((h) => ({ date: String(h.MatterHistoryActionDate).slice(0, 10), action: h.MatterHistoryActionName, body: h.MatterHistoryActionBodyName }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    textSource: 'sources/oakland-sb79-ordinance-2026-03-05.txt',
    // The council's March 3 amendment: the zoning-based exclusion does not reach the Rockridge station area.
    rockridgeCarveOut: {
      section: 'Oakland Planning Code § 17.86.060.A',
      quote: 'Not including sites within one-half mile of Ashby, MacArthur, and Rockridge BART stations',
    },
    signedOrdinance: SOURCES.ordinanceSigned,
    note: 'The signed ordinance is a scan without text; the quoted text is the supplemental legislation of March 5, 2026, which carries the March 3 council amendment and went to final passage on March 16.',
  }, SOURCES.legistarMatter);
  await out.pdfText('oakland-sb79-ordinance-2026-03-05', SOURCES.ordinanceText, { first: 1, last: 14 });

  // Opportunity map (high-resource status bears on the 2027 denial presumption).
  const opp = await opportunityAreas('Alameda');
  const tract = opp.areas.find((a) => distanceFt(inside, a.geometry) === 0);
  if (!tract) throw new Error('Parcel is not inside any opportunity area');
  out.writeData('opportunity', { fips: tract.fips, category: tract.category, score: tract.score, entry: opp.entry }, OPPORTUNITY_MAP_URL, opp.lastModified);

  // Population (Oakland), as MTC used it.
  const pop = (await queryJSON(SOURCES.jurisdictions, { where: "jurisdiction='Oakland'", outFields: 'jurisdiction,total_population', returnGeometry: 'false' })).features;
  if (pop.length !== 1) throw new Error('Expected one Oakland row');
  out.writeData('population', { city: 'Oakland', mtcAcs: { value: pop[0]!.attributes.total_population, vintage: 'ACS 2019–2023 5-year' } }, SOURCES.jurisdictions);

  // The pending application, from secondary sources (the city's project file is the primary record).
  await out.htmlText('ubaoakland-fact-sheet', SOURCES.factSheet);
  await out.htmlText('piedmont-exedra-2026-07', SOURCES.piedmontExedra);
  await out.htmlText('sfyimby-2026-08', SOURCES.sfYimby);

  // What SB 79 itself would require at the site, measured the statute's way.
  const access = (await queryAll(SOURCES.accessPoints, { ...within(inside as [number, number], RADIUS_FT), outFields: 'access_id,ranked_tod_tier,access_point_name' })).features;
  const nearest = access
    .map((f: Feature) => ({ id: String(f.properties.access_id).trim(), name: String(f.properties.access_point_name), tier: f.properties.ranked_tod_tier === 'Tier 1' ? (1 as const) : (2 as const), ft: distanceFt((f.geometry as { coordinates: number[] }).coordinates, geometry) }))
    .sort((a, b) => a.ft - b.ft)[0];
  if (!nearest) throw new Error('No access point near the site');
  const asOf = out.retrievedAt.slice(0, 10);
  const ev = evaluateSite({
    urbanTransitCounty: true, tier: nearest.tier, distanceFt: nearest.ft, cityPopulation: Number(pop[0]!.attributes.total_population),
    zoningClass: 'commercial', localOptOut: s8.AVAIL === 'Covered' ? 'none' : 'exclusion', lotAreaSqFt: gisAreaSqFt,
    localHeightLimitFt: Number(height.MAXHEIGHT), highResourceArea: law.definitions.highResourceArea.value.some((v) => tract.category.toLowerCase() === `${v} resource`.replace('resource resource', 'resource')),
  }, { asOf });
  out.writeData('site', {
    apn: APN, asOf,
    nearestAccessPoint: { id: nearest.id, name: nearest.name, tier: nearest.tier, distanceFt: Math.round(nearest.ft * 10) / 10 },
    band: ev.band, outcome: ev.outcome, summary: ev.summary,
    sb79: ev.floors && {
      heightFt: ev.floors.heightFt.value, densityDuPerAcre: ev.floors.densityDuPerAcre.value, residentialFar: ev.floors.residentialFar.value,
      unitFloor: Math.round((ev.unitFloor?.value ?? 0) * 100) / 100, residentialFloorAreaSqFt: Math.round(ev.residentialFloorAreaSqFt ?? 0),
      cites: { height: ev.floors.heightFt.cite, density: ev.floors.densityDuPerAcre.cite, far: ev.floors.residentialFar.cite },
    },
    localHeightLimitFt: Number(height.MAXHEIGHT),
    denialPresumption: ev.denialPresumption,
    note: 'Generated by evaluateSite from the frozen facts above. No project facts are assumed, so conditions are not evaluated.',
  }, 'evaluateSite');

  out.writeManifest({ site: { apn: APN, address: String(parcel.properties.SitusAddress).trim(), role: 'III.D contrast site' } });
}

await main();
