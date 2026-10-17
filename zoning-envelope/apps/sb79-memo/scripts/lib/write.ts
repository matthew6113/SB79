/** Writers for frozen snapshots: GeoJSON layers, JSON data, and source-document text, plus a manifest. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FeatureCollection } from './arcgis.ts';
import { roundGeometry } from './geo.ts';

/** fetch with retries and backoff (2s, 4s, 8s, 16s); some document hosts fail intermittently. */
async function fetchOk(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url);
  if (res.ok) return res;
  if (attempt >= 4) throw new Error(`${url}: HTTP ${res.status}`);
  await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  return fetchOk(url, attempt + 1);
}

export interface ManifestEntry { file: string; source: string; sourceLastEdit: string | null; count?: number }

export function createWriter(dir: URL) {
  const retrievedAt = new Date().toISOString();
  const manifest: ManifestEntry[] = [];
  mkdirSync(new URL('sources/', dir), { recursive: true });
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const isoOrNull = (d: string | null) => (d ? new Date(d).toISOString() : null);

  function writeSourceText(name: string, url: string, text: string, meta: Record<string, unknown>, lastModified: string | null) {
    writeFileSync(new URL(`sources/${name}.txt`, dir), text);
    writeFileSync(new URL(`sources/${name}.meta.json`, dir), json({ source: url, retrievedAt, lastModified, ...meta }));
    manifest.push({ file: `sources/${name}.txt`, source: url, sourceLastEdit: isoOrNull(lastModified) });
    console.log(`  sources/${name}.txt`);
  }

  return {
    retrievedAt,
    manifest,

    writeLayer(name: string, fc: FeatureCollection, meta: Record<string, unknown>) {
      const features = fc.features.map((f) => ({ type: 'Feature' as const, geometry: roundGeometry(f.geometry), properties: f.properties }));
      writeFileSync(new URL(`${name}.geojson`, dir), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
      writeFileSync(new URL(`${name}.meta.json`, dir), json({ retrievedAt, count: features.length, ...meta }));
      manifest.push({ file: `${name}.geojson`, source: String(meta.source), sourceLastEdit: (meta.sourceLastEdit as string | null) ?? null, count: features.length });
      console.log(`  ${name}: ${features.length} features`);
    },

    writeData(name: string, data: object, source: string, sourceLastEdit: string | null = null) {
      writeFileSync(new URL(`${name}.json`, dir), json({ retrievedAt, ...data }));
      manifest.push({ file: `${name}.json`, source, sourceLastEdit });
      console.log(`  ${name}.json`);
    },

    /**
     * Keep a PDF's text (pdftotext -layout, optionally a page range) and its hash.
     * When the host cannot be reached and SB79_DOCS_DIR holds `<name>.pdf` (a copy
     * downloaded by hand), that copy is used and the meta says so.
     */
    async pdfText(name: string, url: string, pages?: { first: number; last: number }) {
      let pdf: Buffer, lastModified: string | null = null, via: Record<string, unknown> = {};
      try {
        const res = await fetchOk(url);
        pdf = Buffer.from(await res.arrayBuffer());
        lastModified = res.headers.get('last-modified');
      } catch (err) {
        const local = process.env.SB79_DOCS_DIR && join(process.env.SB79_DOCS_DIR, `${name}.pdf`);
        if (!local || !existsSync(local)) throw err;
        pdf = readFileSync(local);
        via = { retrievedVia: `local copy of the document (fetching it failed: ${(err as Error).message})` };
        console.log(`  ${name}: using the local copy (${(err as Error).message})`);
      }
      const tmp = mkdtempSync(join(tmpdir(), 'sb79-pdf-'));
      try {
        const path = join(tmp, 'doc.pdf');
        writeFileSync(path, pdf);
        const range = pages ? ['-f', String(pages.first), '-l', String(pages.last)] : [];
        const text = execFileSync('pdftotext', ['-layout', ...range, path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        writeSourceText(name, url, text, { pdfSha256: createHash('sha256').update(pdf).digest('hex'), extractedWith: 'pdftotext -layout', ...(pages ? { pages } : {}), ...via }, lastModified);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },

    /** Keep a web page's visible text (scripts, styles, and tags removed). */
    async htmlText(name: string, url: string) {
      const res = await fetchOk(url);
      const html = await res.text();
      const text = html
        .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
          e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
            : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' } as Record<string, string>)[e.toLowerCase()] ?? m)
        .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
      writeSourceText(name, url, text, { htmlSha256: createHash('sha256').update(html).digest('hex'), extractedWith: 'tags stripped' }, res.headers.get('last-modified'));
    },

    writeManifest(extra: Record<string, unknown>) {
      writeFileSync(new URL('manifest.json', dir), json({ asOf: retrievedAt.slice(0, 10), retrievedAt, ...extra, files: manifest }));
      console.log(`Wrote manifest.json (asOf ${retrievedAt.slice(0, 10)})`);
    },
  };
}
