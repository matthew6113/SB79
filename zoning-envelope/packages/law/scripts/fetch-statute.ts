/**
 * Snapshot the official text of SB 79 and the bills that amend it.
 *
 * Source: the Legislature's bulk database, downloads.leginfo.legislature.ca.gov.
 * (The leginfo web pages sit behind a bot challenge; the bulk files do not.)
 * Only the needed entries of the 1.3 GB zip are read, with HTTP range requests.
 *
 * Writes packages/law/source/*.txt (plain text, one paragraph per line) and
 * source/manifest.json. These files are evidence: never edit them by hand.
 * Re-run with `pnpm --filter @zoning-envelope/law fetch-statute`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openRemoteZip, readEntry, type RemoteZip } from './zip-range.ts';

const ZIP_URL = 'https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip';
const OUT = new URL('../source/', import.meta.url);

/** Current Government Code text for SB 79's chapter and the sections it cross-references. */
const SECTIONS = [
  '65912.155', '65912.156', '65912.157', '65912.158', '65912.159', '65912.160', '65912.161', '65912.162',
  '65589.5', // Housing Accountability Act penalties, cited by § 65912.157(m)
  '65913.4', // SB 35 streamlining and labor standards, cited by §§ 65912.157(k), 65912.159
  '65915', // Density Bonus Law, cited by § 65912.157(d)
  '66300.6', // Replacement housing, cited by § 65912.157(f)
];

/** Chaptered bill texts: the enacting act and every 2026 amendment to the chapter. */
const BILLS = [
  { billId: '202520260SB79', label: 'SB 79' },
  { billId: '202520260SB722', label: 'SB 722' },
  { billId: '202520260AB2576', label: 'AB 2576' },
  { billId: '202520260SB1361', label: 'SB 1361' },
];

/** pubinfo .dat files: tab-separated, strings wrapped in backticks, NULL for null. */
function parseRows(dat: Buffer): string[][] {
  return dat
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t').map((f) => (f === 'NULL' ? '' : f.replace(/^`|`$/g, ''))));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** CAML (the Legislature's XHTML dialect) to plain text, one paragraph per line. */
function camlToText(xml: string): string {
  return xml
    .replace(/\s+/g, ' ') // source line breaks inside a paragraph are not paragraph breaks
    .replace(/<span class="EnSpace"\/>/g, ' ')
    .replace(/<\/(p|tr|table|caml:Num|caml:ActionLine|caml:Preamble|caml:BillSection)>/g, '\n')
    .replace(/<\/t[dh]>/g, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .concat('\n');
}

function tag(xml: string, name: string): string {
  return xml.match(new RegExp(`<caml:${name}>([^<]*)</caml:${name}>`))?.[1] ?? '';
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function lobText(zip: RemoteZip, lob: string): Promise<string> {
  const name = [...zip.entries.keys()].find((k) => k === lob || k.endsWith(`/${lob}`));
  if (!name) throw new Error(`Missing ${lob} in the zip`);
  return (await readEntry(zip, name)).toString('utf8');
}

async function main() {
  const zip = await openRemoteZip(ZIP_URL);
  console.log(`Opened ${ZIP_URL}: ${zip.entries.size} entries, last modified ${zip.lastModified}`);
  mkdirSync(OUT, { recursive: true });
  const files: Record<string, unknown>[] = [];

  // LAW_SECTION_TBL columns: 0 id, 1 law_code, 2 section_num, 3 op_statutes, 4 op_chapter,
  // 5 op_section, 6 effective_date, 13 history, 14 content_xml (lob), 15 active_flg, 17 trans_update.
  const lawRows = parseRows(await readEntry(zip, 'LAW_SECTION_TBL.dat'));
  for (const section of SECTIONS) {
    const rows = lawRows.filter((r) => r[1] === 'GOV' && r[2] === `${section}.` && r[15] === 'Y');
    if (rows.length !== 1) throw new Error(`Expected one active row for Gov. Code § ${section}, found ${rows.length}`);
    const row = rows[0]!;
    const body = camlToText(await lobText(zip, row[14]!));
    const text = `Government Code § ${section}\n${row[13]}\n\n${body}`;
    const file = `gov-${section}.txt`;
    writeFileSync(new URL(file, OUT), text);
    files.push({
      file, kind: 'code-section', citation: `Gov. Code § ${section}`, table: 'LAW_SECTION_TBL', rowId: row[0],
      lob: row[14], history: row[13], effectiveDate: row[6]?.slice(0, 10) || null, rowUpdated: row[17], sha256: sha256(text),
    });
    console.log(`  ${file}  ${row[13]}`);
  }

  // BILL_VERSION_TBL columns: 0 bill_version_id, 1 bill_id, 2 version_num, 3 action_date,
  // 4 action, 14 bill_xml (lob), 15 active_flg, 17 trans_update.
  const billRows = parseRows(await readEntry(zip, 'BILL_VERSION_TBL.dat'));
  for (const { billId, label } of BILLS) {
    const rows = billRows.filter((r) => r[1] === billId && r[4] === 'Chaptered');
    if (rows.length !== 1) throw new Error(`Expected one chaptered version of ${label}, found ${rows.length}`);
    const row = rows[0]!;
    const xml = await lobText(zip, row[14]!);
    const chapterYear = tag(xml, 'ChapterYear');
    const chapterNum = tag(xml, 'ChapterNum');
    const urgency = tag(xml, 'Urgency');
    const billStart = xml.indexOf('<caml:Bill ');
    if (billStart < 0 || !chapterNum) throw new Error(`${label}: could not find bill text or chapter number`);
    // Header lines carry official CAML metadata fields verbatim, so dates can be quoted from them.
    const history = [...xml.matchAll(/<caml:ActionText>([A-Z_]+)<\/caml:ActionText><caml:ActionDate>([\d-]+)<\/caml:ActionDate>/g)]
      .map((m) => `${m[1]} ${m[2]}`)
      .join(' · ');
    const text =
      `${label}, Statutes of ${chapterYear}, Chapter ${chapterNum}\n` +
      `Urgency: ${urgency}\nHistory: ${history}\nTitle: ${tag(xml, 'Title').trim()}\n\n${camlToText(xml.slice(billStart))}`;
    const file = `stats-${chapterYear}-ch${chapterNum}-${label.replace(' ', '').toLowerCase()}.txt`;
    writeFileSync(new URL(file, OUT), text);
    files.push({
      file, kind: 'chaptered-bill', citation: `Stats. ${chapterYear}, ch. ${chapterNum} (${label})`, table: 'BILL_VERSION_TBL',
      rowId: row[0], lob: row[14], chapteredDate: row[3]?.slice(0, 10), urgency: urgency === 'YES', rowUpdated: row[17], sha256: sha256(text),
    });
    console.log(`  ${file}`);
  }

  const manifest = {
    source: ZIP_URL,
    sourceLastModified: zip.lastModified,
    retrievedAt: new Date().toISOString(),
    note: 'Official California Legislative Information bulk data. Text converted from CAML to plain text, one paragraph per line. Do not edit by hand.',
    files,
  };
  writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${files.length} files and manifest.json`);
}

await main();
