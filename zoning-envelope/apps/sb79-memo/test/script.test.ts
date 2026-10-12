import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIGURES, script } from '../src/script';

// Rule 2 (CLAUDE.md): every paragraph in memo.mdx maps to exactly one figure
// state in src/script.ts, and every script entry has exactly one paragraph.
// MDX comments ({/* ... */}) are stripped first: a commented-out Step is not a paragraph.
const memo = readFileSync(new URL('../src/content/memo.mdx', import.meta.url), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const stepIds = [...memo.matchAll(/<Step\s+id="([^"]+)"/g)].map((m) => m[1]);
const scriptIds = script.map((e) => e.id);

describe('memo script contract', () => {
  it('only uses the <Step id="..."> form, so every Step is counted', () => {
    expect(memo.match(/<Step\b/g)?.length ?? 0).toBe(stepIds.length);
  });

  it('has unique ids on both sides', () => {
    expect(new Set(stepIds).size).toBe(stepIds.length);
    expect(new Set(scriptIds).size).toBe(scriptIds.length);
  });

  it('pairs each memo paragraph with one script entry, in the same order', () => {
    expect(stepIds).toEqual(scriptIds);
  });

  it('assigns every entry to a known figure', () => {
    for (const entry of script) expect(FIGURES).toContain(entry.figure);
  });
});
