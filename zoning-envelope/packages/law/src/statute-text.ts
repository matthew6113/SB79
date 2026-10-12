/**
 * Read the statute snapshots in ../source and locate text by pinpoint cite,
 * so tests can prove every quote in sb79.json sits in the subdivision it cites.
 * Node-only (reads files); not exported from the package index.
 */
import { readFileSync } from 'node:fs';

const SOURCE_DIR = new URL('../source/', import.meta.url);

/** Collapse whitespace so quotes match regardless of line wrapping. */
export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

export function readSource(file: string): string {
  return readFileSync(new URL(file, SOURCE_DIR), 'utf8');
}

// Subdivision label kinds, outermost first: (a) (1) (A) (i) (I) (ia) (Ia).
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
const KINDS = [
  { first: 'a', next: (l: string) => (/^[a-z]$/.test(l) ? String.fromCharCode(l.charCodeAt(0) + 1) : null) },
  { first: '1', next: (l: string) => (/^\d+$/.test(l) ? String(Number(l) + 1) : null) },
  { first: 'A', next: (l: string) => (/^[A-Z]$/.test(l) ? String.fromCharCode(l.charCodeAt(0) + 1) : null) },
  { first: 'i', next: (l: string) => ROMANS[ROMANS.indexOf(l) + 1] ?? null },
  { first: 'I', next: (l: string) => ROMANS[ROMANS.indexOf(l.toLowerCase()) + 1]?.toUpperCase() ?? null },
  { first: 'ia', next: (l: string) => (/^[ivx]+[a-z]$/.test(l) ? l.slice(0, -1) + String.fromCharCode(l.charCodeAt(l.length - 1) + 1) : null) },
  { first: 'Ia', next: (l: string) => (/^[IVX]+[a-z]$/.test(l) ? l.slice(0, -1) + String.fromCharCode(l.charCodeAt(l.length - 1) + 1) : null) },
] as const;

/**
 * Depths a label could belong at, given the labels currently open: it either
 * continues that depth's sequence or starts it under an open parent.
 * "(i)" after "(h)" is ambiguous (subdivision (i) or a first clause), as is
 * "(I)" after "(H)". Statutes start a list after a paragraph ending in a
 * colon, so then deeper readings are tried first; otherwise shallower ones.
 */
function candidateDepths(label: string, open: readonly string[], startsList: boolean): number[] {
  const valid: number[] = [];
  for (let d = 0; d < KINDS.length; d++) {
    const current = open[d];
    const continues = current !== undefined && KINDS[d]!.next(current) === label;
    const starts = label === KINDS[d]!.first && (d === 0 || open[d - 1] !== undefined);
    if (continues || starts) valid.push(d);
  }
  return startsList ? valid.reverse() : valid;
}

const LABEL = /^\(([0-9A-Za-z]{1,5})\)\s?/;

function splitLabels(line: string): string[] {
  const labels: string[] = [];
  for (let m = line.match(LABEL), rest = line; m; rest = rest.slice(m[0].length), m = rest.match(LABEL)) labels.push(m[1]!);
  return labels;
}

/**
 * Assign every line its open label stack. Depth-first with backtracking: an
 * ambiguous label takes its preferred reading, and if a later label cannot be
 * placed, the parse returns to the last ambiguity and tries the other reading.
 */
function labelStacks(lines: readonly string[]): string[][] {
  const labels = lines.map(splitLabels);
  const stacks: string[][] = new Array(lines.length);

  const placeLine = (i: number, k: number, open: string[]): boolean => {
    if (k === labels[i]!.length) {
      stacks[i] = open;
      return walk(i + 1, open);
    }
    const startsList = k > 0 || (i > 0 && /:\s*$/.test(lines[i - 1]!));
    for (const d of candidateDepths(labels[i]![k]!, open, startsList)) {
      if (placeLine(i, k + 1, [...open.slice(0, d), labels[i]![k]!])) return true;
    }
    return false;
  };
  const walk = (i: number, open: string[]): boolean => (i === lines.length ? true : placeLine(i, 0, open));

  if (!walk(0, [])) throw new Error('Could not parse subdivision labels');
  return stacks;
}

/** Split statute text (one paragraph per line) into every subdivision path with its text. */
export function subdivisions(sectionText: string): Map<string, string> {
  const lines = sectionText.split('\n');
  const stacks = labelStacks(lines);
  const out = new Map<string, string[]>();
  lines.forEach((line, i) => {
    const open = stacks[i]!;
    for (let d = 1; d <= open.length; d++) {
      const path = open.slice(0, d).map((l) => `(${l})`).join('');
      if (!out.has(path)) out.set(path, []);
      out.get(path)!.push(line);
    }
  });
  return new Map([...out].map(([k, v]) => [k, normalize(v.join(' '))]));
}

/**
 * The text of one code section inside a source file. Code-section snapshots
 * hold one section after a two-line header; chaptered bills hold the amended
 * section after a line like "65912.157." (the first occurrence is used).
 */
export function sectionText(file: string, section: string): string {
  const lines = readSource(file).split('\n');
  if (file.startsWith('gov-')) return lines.slice(3).join('\n');
  const start = lines.indexOf(`${section}.`);
  if (start < 0) throw new Error(`${file} does not contain Gov. Code § ${section}`);
  const end = lines.findIndex((l, i) => i > start && /^SEC\. [\d.]+\.$/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/** Parse "Gov. Code § 65912.157(a)(3)(A)" into section and path. */
export function parseGovCite(cite: string): { section: string; path: string } | null {
  const m = cite.match(/^Gov\. Code § (\d+(?:\.\d+)?)((?:\([0-9A-Za-z]{1,5}\))*)$/);
  return m ? { section: m[1]!, path: m[2]! } : null;
}

/** The text a pinpoint cite refers to, or undefined if the path does not exist. */
export function textAt(file: string, cite: string): string | undefined {
  const parsed = parseGovCite(cite);
  if (!parsed) return normalize(readSource(file));
  const text = sectionText(file, parsed.section);
  return parsed.path ? subdivisions(text).get(parsed.path) : normalize(text);
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  'one-quarter': 0.25, 'one-half': 0.5,
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** True when the quote itself states the value (digits, number words, or a date). */
export function quoteStates(quote: string, value: unknown): boolean {
  if (typeof value === 'number') {
    const digits = [...quote.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
    const words = [...quote.toLowerCase().matchAll(/\b(one-quarter|one-half|one|two|three|four|five|six|seven|eight|nine|ten)\b/g)]
      .map((m) => NUMBER_WORDS[m[1]!]);
    return [...digits, ...words].includes(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, mo, d] = value.split('-').map(Number) as [number, number, number];
    return quote.includes(value) || quote.includes(`${MONTHS[mo - 1]} ${d}, ${y}`);
  }
  return true;
}
