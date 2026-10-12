import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../sb79.json' with { type: 'json' };
import { sb79Schema, type CitedLeaf } from '../src/schema.ts';
import { normalize, quoteStates, readSource, textAt } from '../src/statute-text.ts';

const manifest = JSON.parse(readFileSync(new URL('../source/manifest.json', import.meta.url), 'utf8')) as {
  files: { file: string; sha256: string }[];
};

/** Every cited leaf in sb79.json with its JSON path. */
function leaves(node: unknown, path = ''): [string, CitedLeaf][] {
  if (typeof node !== 'object' || node === null) return [];
  if ('cite' in node && 'quote' in node) return [[path, node as CitedLeaf]];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const all = leaves(raw);

describe('sb79.json', () => {
  it('matches the schema', () => {
    expect(() => sb79Schema.parse(raw)).not.toThrow();
    expect(all.length).toBeGreaterThan(90);
  });

  it('has no number outside a cited leaf', () => {
    const bare: string[] = [];
    const walk = (node: unknown, path: string, insideLeaf: boolean) => {
      if (typeof node === 'number' && !insideLeaf) bare.push(path);
      if (typeof node !== 'object' || node === null) return;
      const leaf = insideLeaf || ('cite' in node && 'quote' in node);
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, leaf);
    };
    walk(raw, '$', false);
    expect(bare).toEqual([]);
  });
});

describe('every quote is verbatim at its pinpoint', () => {
  it.each(all)('%s', (_path, leaf) => {
    const at = textAt(leaf.source, leaf.cite);
    expect(at, `${leaf.cite} not found in ${leaf.source}`).toBeDefined();
    expect(at).toContain(normalize(leaf.quote));
    if (!leaf.derivation) expect(quoteStates(leaf.quote, leaf.value), `quote does not state ${String(leaf.value)}`).toBe(true);
  });
});

describe('dates the text implies', () => {
  const derived = all.filter(([, l]) => l.derivation);
  it.each(derived)('%s follows Cal. Const. art. IV, § 8(c)(1)', (_path, leaf) => {
    const { enacted, urgency, billSource } = leaf.derivation!;
    // The bill's own metadata must agree with the derivation's inputs.
    const header = readSource(billSource).split('\n').slice(0, 3).join('\n');
    expect(header).toContain(`Urgency: ${urgency ? 'YES' : 'NO'}`);
    expect(header).toContain(`APPROVED ${enacted}`);
    // January 1 next following a 90-day period from enactment.
    const day90 = new Date(`${enacted}T00:00:00Z`);
    day90.setUTCDate(day90.getUTCDate() + 90);
    expect(leaf.value).toBe(`${day90.getUTCFullYear() + 1}-01-01`);
  });
});

describe('versions', () => {
  const versioned = (node: unknown, path = ''): [string, CitedLeaf[]][] => {
    if (typeof node !== 'object' || node === null) return [];
    if ('versions' in node) return [[path, (node as { versions: CitedLeaf[] }).versions]];
    return Object.entries(node).flatMap(([k, v]) => versioned(v, path ? `${path}.${k}` : k));
  };
  it.each(versioned(raw))('%s: each version starts where the last ended', (_path, versions) => {
    for (let i = 1; i < versions.length; i++) expect(versions[i]!.from).toBe(versions[i - 1]!.to);
    expect(versions.at(-1)!.to).toBeUndefined();
  });
  it('2027 changes start on the amending acts\' effective date', () => {
    const effective = new Set([raw.acts.ab2576.effective.value, raw.acts.sb1361.effective.value]);
    const starts = all.map(([, l]) => l.from).filter((f): f is string => !!f && f > raw.acts.sb722.effective.value);
    for (const f of starts) expect(effective).toContain(f);
  });
});

describe('source snapshots', () => {
  it.each(manifest.files)('$file matches its manifest hash', ({ file, sha256 }) => {
    expect(createHash('sha256').update(readSource(file)).digest('hex')).toBe(sha256);
  });
  it('every leaf cites a file in the manifest', () => {
    const files = new Set(manifest.files.map((f) => f.file));
    for (const [, leaf] of all) expect(files).toContain(leaf.source);
  });
});
