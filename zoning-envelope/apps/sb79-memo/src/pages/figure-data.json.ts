/**
 * The figures' data, built once at build time from @zoning-envelope/law,
 * memo-data, and the frozen snapshots in data/. Served as /figure-data.json
 * and fetched by FigureStage.
 */
import type { APIRoute } from 'astro';
import { buildFigureData } from '../figures/figure-data';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildFigureData()), { headers: { 'content-type': 'application/json' } });
