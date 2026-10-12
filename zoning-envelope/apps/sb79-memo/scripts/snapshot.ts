/**
 * Freeze the memo's data into apps/sb79-memo/data: every layer as GeoJSON
 * (EPSG:4326) with a .meta.json naming the source, query, and dates, plus a
 * manifest whose asOf date is the memo's data date.
 *
 * Run: pnpm --filter @zoning-envelope/sb79-memo snapshot   (needs pdftotext)
 */
import * as polyclip from 'polyclip-ts';
import { law, milesToFeet } from '@zoning-envelope/law';
import { layerInfo, queryAll, queryJSON, within, type Feature, type FeatureCollection, type Geometry } from './lib/arcgis.ts';
import { areaSqFt, circle, distanceFt } from './lib/geo.ts';
import { createWriter } from './lib/write.ts';
import { OPPORTUNITY_MAP_URL, opportunityAreas } from './lib/opportunity.ts';

const DATA = new URL('../data/', import.meta.url);

/** North Berkeley BART in MTC's SB 79 map. */
const STATION_ID = '904309';
/** Snapshot radius around the station (SB79_SPEC.md, Phase 1). */
const RADIUS_FT = 3000;
/** Access points that could set a band for a parcel inside the radius: radius plus the statute's half mile. */
const ACCESS_RADIUS_FT = RADIUS_FT + milesToFeet(law.bands.halfMile.tier1.value);

const MTC = 'https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services';
const SOURCES = {
  stations: `${MTC}/mtc_sb79_tod_stations/FeatureServer/1`,
  stops: `${MTC}/mtc_sb79_tod_stops/FeatureServer/1`,
  accessPoints: `${MTC}/mtc_sb79_tod_access_points/FeatureServer/1`,
  zones: `${MTC}/mtc_sb79_tod_zones/FeatureServer/1`,
  jurisdictions: `${MTC}/mtc_sb79_jurisdictions_with_pop_acs2019_2023/FeatureServer/1`,
  countyParcels: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0',
  useCodes: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Assessor_Office_Use_Codes/FeatureServer/0',
  berkeleyParcels: 'https://gis.cityofberkeley.info/arcgis/rest/services/Public/Portal_Planning/MapServer/6',
  zoning: 'https://gis.cityofberkeley.info/arcgis/rest/services/Public/Portal_Planning/MapServer/7',
  footprints: 'https://gis.cityofberkeley.info/arcgis/rest/services/Planning/Building_Safety/MapServer/7',
  counties: 'https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/California_County_Boundaries_and_Identifiers_Blue_Version_view/FeatureServer/1',
  census2020Places: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/26',
  hcdAdvisory: 'https://www.hcd.ca.gov/sites/default/files/docs/planning-and-community/sb-79-mpo-advisory.pdf',
  berkeleyStaffReport: 'https://berkeleyca.gov/sites/default/files/2026-04/2026-04-15_PC_Item%2010A_SB%2079%20and%20AB%20893.pdf',
  abagSummary: 'https://abag.ca.gov/sites/default/files/documents/2026-07/SB79-Summary-07172026.pdf',
} as const;

const out = createWriter(DATA);
const { writeLayer, writeData } = out;

const pick = (props: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, props[k] ?? null]));
const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const bySortKey = (key: (f: Feature) => string | number) => (a: Feature, b: Feature) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

async function mtc(center: readonly [number, number]) {
  const radius = within(center, ACCESS_RADIUS_FT);
  const info = await layerInfo(SOURCES.stations);
  const stations = await queryAll(SOURCES.stations, { ...radius, outFields: 'station_id,station_name,location_type,manually_added' });
  stations.features = stations.features
    .map((f) => ({ ...f, properties: { ...f.properties, station_id: trim(f.properties.station_id) } }))
    .sort(bySortKey((f) => String(f.properties.station_id)));
  writeLayer('tod-stations', stations, {
    source: SOURCES.stations, sourceLastEdit: info.dataLastEditDate ?? info.lastEditDate, query: `within ${ACCESS_RADIUS_FT} ft of station ${STATION_ID}`,
    notes: 'station_id trimmed (some source values carry a leading space).',
  });

  for (const [name, url, fields, idKey] of [
    ['tod-stops', SOURCES.stops, 'stop_id,station_id,stop_name,agency_name,route_short_name,route_type,tod_tier', 'stop_id'],
    ['tod-access-points', SOURCES.accessPoints, 'access_id,station_id,access_point_name,location_type,ranked_tod_tier', 'access_id'],
  ] as const) {
    const layer = await layerInfo(url);
    const fc = await queryAll(url, { ...radius, outFields: fields });
    fc.features = fc.features
      .map((f) => {
        const p = Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, trim(v)]));
        // The source has no elevator field; MTC names elevator entrances in access_point_name.
        if (name === 'tod-access-points') p.isElevator = /elevator/i.test(String(p.access_point_name));
        return { ...f, properties: p };
      })
      .sort(bySortKey((f) => String(f.properties[idKey])));
    writeLayer(name, fc, {
      source: url, sourceLastEdit: layer.dataLastEditDate ?? layer.lastEditDate, query: `within ${ACCESS_RADIUS_FT} ft of station ${STATION_ID}`,
      notes: name === 'tod-access-points' ? 'isElevator is derived: true when access_point_name contains "elevator" (MTC publishes no elevator field).' : 'Values trimmed.',
    });
  }

  const zinfo = await layerInfo(SOURCES.zones);
  const zones = await queryAll(SOURCES.zones, { ...within(center, RADIUS_FT), outFields: 'zone_id,zone_label' });
  zones.features.sort(bySortKey((f) => String(f.properties.zone_label)));
  writeLayer('tod-zones', zones, {
    source: SOURCES.zones, sourceLastEdit: zinfo.dataLastEditDate ?? zinfo.lastEditDate, query: `intersecting ${RADIUS_FT} ft of station ${STATION_ID}`,
    notes: 'MTC zones are non-overlapping rings dissolved by label across the region; they carry no station id. Geometry is the full regional polygon.',
  });
}

function ownerClass(owner: unknown, useCode: unknown): 'BART' | 'City of Berkeley' | 'other public' | 'private' {
  const o = String(owner ?? '').toUpperCase();
  if (o.includes('RAPID TRANSIT')) return 'BART';
  if (o.includes('CITY OF BERKELEY')) return 'City of Berkeley';
  // Assessor use code 0300 is "Exempt Public Agency".
  if (String(useCode) === '0300' || /STATE OF CALIFORNIA|UNIFIED SCHOOL|REGENTS|MUNICIPAL UTILITY|COUNTY OF ALAMEDA|UNITED STATES|HOUSING AUTHORITY/.test(o)) return 'other public';
  return 'private';
}

async function parcels(center: readonly [number, number]) {
  const radius = within(center, RADIUS_FT);
  const cInfo = await layerInfo(SOURCES.countyParcels);
  const county = await queryAll(SOURCES.countyParcels, { ...radius, outFields: 'APN,SitusAddress,UseCode' });
  const berkeley = await queryAll(SOURCES.berkeleyParcels, {
    ...radius, outFields: 'APN,PARCELID,OwnersName,UseCode,LotSize,Units,YearBuilt,Stories,BuildingAr', returnGeometry: 'false',
  });
  const byApn = new Map(berkeley.features.map((f) => [String(f.properties.APN), f.properties]));
  const latestRecorded = (await queryJSON(SOURCES.berkeleyParcels, {
    where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'LastEditedDate', outStatisticFieldName: 'maxDate' }]),
  })).features[0]?.attributes.maxDate as number | undefined;

  let joined = 0;
  const features = county.features
    .filter((f) => f.geometry)
    .map((f) => {
      const apn = String(f.properties.APN);
      const b = byApn.get(apn);
      if (b) joined++;
      return {
        ...f,
        properties: {
          apn,
          address: trim(f.properties.SitusAddress),
          useCode: f.properties.UseCode,
          ownerClass: b ? ownerClass(b.OwnersName, b.UseCode) : null,
          assessorLotSizeSqFt: b?.LotSize ?? null,
          gisAreaSqFt: Math.round(areaSqFt(f.geometry as Geometry)),
          units: b?.Units ?? null,
          yearBuilt: b?.YearBuilt ?? null,
          stories: b?.Stories ?? null,
          buildingAreaSqFt: b?.BuildingAr ?? null,
          berkeleyParcelId: b?.PARCELID ?? null,
        },
      };
    })
    .sort(bySortKey((f) => String(f.properties.apn)));
  writeLayer('parcels', { type: 'FeatureCollection', features }, {
    source: SOURCES.countyParcels,
    joinedSource: SOURCES.berkeleyParcels,
    sourceLastEdit: cInfo.dataLastEditDate ?? cInfo.lastEditDate,
    joinedSourceLatestRecordedDocument: latestRecorded ? new Date(latestRecorded).toISOString() : null,
    query: `within ${RADIUS_FT} ft of station ${STATION_ID}`,
    joinedByApn: `${joined} of ${features.length}`,
    notes:
      'Geometry, APN, address and use code from the Alameda County assessor layer; lot size, units, year built, stories and building area ' +
      'from the City of Berkeley parcel layer (synchronized annually to the county roll), joined by APN. Owner names are not stored: ' +
      'ownerClass is derived from them (BART, City of Berkeley, other public, private). gisAreaSqFt is computed from the geometry in EPSG:2227.',
  });
  return berkeley;
}

async function zoning(center: readonly [number, number]) {
  const radiusRing = circle(center, RADIUS_FT);
  const fc = await queryAll(SOURCES.zoning, { ...within(center, RADIUS_FT), outFields: 'ZONECLASS,ZONEDESC,LASTUPDATE' });
  const clipped = fc.features.flatMap((f) => {
    const geom = f.geometry as Geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : (geom as { coordinates: number[][][][] }).coordinates;
    const out = polyclip.intersection(polys as never, [radiusRing] as never) as unknown as number[][][][];
    if (!out.length) return [];
    return [{
      ...f,
      geometry: { type: 'MultiPolygon' as const, coordinates: out },
      properties: {
        district: f.properties.ZONECLASS,
        description: f.properties.ZONEDESC,
        lastUpdate: typeof f.properties.LASTUPDATE === 'number' ? new Date(f.properties.LASTUPDATE).toISOString().slice(0, 10) : null,
      },
    }];
  }).sort(bySortKey((f) => String(f.properties.district)));
  const lastUpdate = clipped.map((f) => String(f.properties.lastUpdate ?? '')).sort().at(-1) || null;
  writeLayer('zoning', { type: 'FeatureCollection', features: clipped }, {
    source: SOURCES.zoning, sourceLastEdit: lastUpdate, query: `districts intersecting ${RADIUS_FT} ft of station ${STATION_ID}, clipped to that circle`,
    notes: 'The source HEIGHT field is 0 for every district; local height limits come from berkeley-zoning-standards.json.',
  });
}

async function footprints(center: readonly [number, number], berkeleyParcels: FeatureCollection) {
  const stories = new Map(berkeleyParcels.features.map((f) => [String(f.properties.PARCELID), f.properties.Stories]));
  const fc = await queryAll(SOURCES.footprints, { ...within(center, RADIUS_FT), outFields: 'outline_id,PARCELID' });
  fc.features = fc.features
    .filter((f) => f.geometry)
    .map((f) => ({
      ...f,
      properties: {
        outlineId: f.properties.outline_id,
        berkeleyParcelId: f.properties.PARCELID,
        parcelStories: stories.get(String(f.properties.PARCELID)) ?? null,
        areaSqFt: Math.round(areaSqFt(f.geometry as Geometry)),
      },
    }))
    .sort(bySortKey((f) => Number(f.properties.outlineId)));
  writeLayer('footprints', fc, {
    source: SOURCES.footprints, sourceLastEdit: null, query: `within ${RADIUS_FT} ft of station ${STATION_ID}`,
    notes: 'The source has no height or date fields. parcelStories is the assessor story count of the parcel the outline sits on (context only).',
  });
}

async function counties() {
  const info = await layerInfo(SOURCES.counties);
  const fc = await queryAll(SOURCES.counties, { where: '1=1', outFields: 'CENSUS_GEOID,CDT_NAME_SHORT', maxAllowableOffset: 0.002 }, 20);
  fc.features = fc.features
    .map((f) => ({ ...f, properties: { geoid: f.properties.CENSUS_GEOID, name: f.properties.CDT_NAME_SHORT } }))
    .sort(bySortKey((f) => String(f.properties.geoid)));
  writeLayer('counties', fc, {
    source: SOURCES.counties, sourceLastEdit: info.dataLastEditDate ?? info.lastEditDate, query: 'all counties, simplified (maxAllowableOffset 0.002 degrees)',
  });
}

async function opportunity(center: readonly [number, number]) {
  const { areas, entry, lastModified } = await opportunityAreas('Alameda');
  const features: Feature[] = areas
    .filter((a) => distanceFt(center, a.geometry) <= RADIUS_FT)
    .map((a) => ({ type: 'Feature' as const, geometry: a.geometry, properties: { fips: a.fips, fipsBlockGroup: a.fipsBlockGroup, category: a.category, score: a.score } }))
    .sort(bySortKey((f) => String(f.properties.fips) + String(f.properties.fipsBlockGroup ?? '')));
  writeLayer('opportunity-areas', { type: 'FeatureCollection', features }, {
    source: OPPORTUNITY_MAP_URL, sourceLastEdit: lastModified, sourceEntry: entry,
    query: `Alameda County areas within ${RADIUS_FT} ft of station ${STATION_ID}`,
    notes: '2026 CTCAC/HCD Opportunity Map (official GeoPackage). Gov. Code § 65912.156(f) treats Highest and High Resource as high-resource areas.',
  });
}

async function useCodes(parcelsFc: string[]) {
  const rows = (await queryJSON(SOURCES.useCodes, { where: '1=1', outFields: 'Use_Code,Use_Code_Common_Name', returnGeometry: 'false' })).features;
  // The table drops leading zeros ("300" is use code "0300").
  const names = new Map(rows.map((r) => [String(r.attributes.Use_Code).padStart(4, '0'), String(r.attributes.Use_Code_Common_Name).trim()]));
  const used = [...new Set(parcelsFc)].sort();
  writeData('use-codes', { codes: Object.fromEntries(used.map((c) => [c, names.get(c) ?? null])) }, SOURCES.useCodes);
}

async function population() {
  const mtcPop = (await queryJSON(SOURCES.jurisdictions, { where: "jurisdiction='Berkeley'", outFields: 'jurisdiction,total_population', returnGeometry: 'false' })).features;
  const census = (await queryJSON(SOURCES.census2020Places, { where: "GEOID='0606000'", outFields: 'NAME,POP100', returnGeometry: 'false' })).features;
  if (mtcPop.length !== 1 || census.length !== 1) throw new Error('Expected one Berkeley row in each population source');
  const mtcInfo = await layerInfo(SOURCES.jurisdictions);
  writeData('population', {
    city: 'Berkeley',
    shown: 'mtcAcs',
    mtcAcs: {
      value: mtcPop[0]!.attributes.total_population, vintage: 'ACS 2019–2023 5-year', source: SOURCES.jurisdictions,
      note: 'The figure MTC used to decide which cities get the 1/4–1/2 mile band on its SB 79 map (presumed valid, Gov. Code § 65912.160(f)).',
    },
    census2020: { value: census[0]!.attributes.POP100, vintage: '2020 Census (P.L. 94-171), POP100', source: SOURCES.census2020Places },
    note: 'The statute does not say which population figure applies. Matthew chose the MTC figure for the memo (2026-10-12).',
  }, SOURCES.jurisdictions, mtcInfo.dataLastEditDate ?? mtcInfo.lastEditDate);
}

async function main() {
  const station = await queryAll(SOURCES.stations, { where: `station_id LIKE '%${STATION_ID}'`, outFields: 'station_id,station_name' });
  const center = station.features[0]?.geometry;
  if (station.features.length !== 1 || center?.type !== 'Point') throw new Error(`Expected one station ${STATION_ID}`);
  const c = [center.coordinates[0]!, center.coordinates[1]!] as const;
  console.log(`Center: ${station.features[0]!.properties.station_name} at ${c.join(', ')}`);

  await mtc(c);
  const berkeleyParcels = await parcels(c);
  await useCodes(berkeleyParcels.features.map((f) => String(f.properties.UseCode)));
  await zoning(c);
  await footprints(c, berkeleyParcels);
  await counties();
  await opportunity(c);
  await population();
  await out.pdfText('hcd-sb79-mpo-advisory', SOURCES.hcdAdvisory);
  await out.pdfText('berkeley-pc-2026-04-15-staff-report', SOURCES.berkeleyStaffReport);
  await out.pdfText('abag-sb79-summary-2026-07-17', SOURCES.abagSummary);

  out.writeManifest({ center: { stationId: STATION_ID, lonLat: c }, radiusFt: RADIUS_FT, accessRadiusFt: ACCESS_RADIUS_FT });
}

await main();
