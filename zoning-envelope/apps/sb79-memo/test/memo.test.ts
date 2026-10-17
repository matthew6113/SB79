import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Rule 1 (CLAUDE.md): no hand-typed legal numbers in the memo. Every number,
// whether digits or words, must be an MDX expression over memo-data.
const raw = readFileSync(new URL('../src/content/memo.mdx', import.meta.url), 'utf8');

/** Remove MDX comments, imports, JSX tags, {expressions}, and footnote labels. */
function prose(src: string): string {
  let s = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^import .*$/gm, '');
  s = s.replace(/<[^<>]*?(\{[^}]*\}[^<>]*?)*>/g, ' '); // JSX tags, including attribute expressions
  let out = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0) out += ch;
  }
  return out.replace(/\[\^[\w-]+\]:?/g, ' ');
}

const text = prose(raw);
// Names that contain digits but are not values.
const allowed = text.replace(/\b(?:SB|AB) \d+\b/g, '').replace(/\bTier [12]\b/g, '');

describe('memo.mdx', () => {
  it('has no hand-typed digits', () => {
    expect(allowed.match(/.{0,30}\d.{0,30}/g) ?? []).toEqual([]);
  });

  it('has no hand-typed number words', () => {
    const words = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|quarter|half|eighth)\b/gi;
    expect(allowed.match(new RegExp(`.{0,25}${words.source}.{0,25}`, 'gi')) ?? []).toEqual([]);
  });

  it('keeps the standing line under the header, then the AI line', () => {
    const head = readFileSync(new URL('../src/components/Letterhead.astro', import.meta.url), 'utf8');
    const lines = [...head.matchAll(/<p class="disclaimer[^"]*">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
    expect(lines).toEqual([
      'For general information only. Not legal advice. Facts and law as of {dated}.', // SB79_SPEC.md, verbatim
      expect.stringMatching(/^AI was used to research and draft this explainer .*it may make mistakes\./),
    ]);
    expect(head.indexOf('class="disclaimer"')).toBeGreaterThan(head.indexOf('class="letterhead-byline"'));
  });

  it('ends with the not-legal-advice and AI disclaimer, after the last paragraph', () => {
    const start = raw.indexOf('<div class="foot-disclaimer"');
    expect(start).toBeGreaterThan(raw.lastIndexOf('</Step>'));
    const disclaimer = raw.slice(start, raw.indexOf('</div>', start));
    expect(disclaimer).toMatch(/\*\*Not legal advice\.\*\*/);
    expect(disclaimer).toMatch(/attorney-client relationship/);
    expect(disclaimer).toMatch(/AI was used to research and draft it .*it may make mistakes/);
  });

  it('cites every paragraph to a footnote or a statute', () => {
    const steps = [...raw.matchAll(/<Step id="([^"]+)">([\s\S]*?)<\/Step>/g)];
    const uncited = steps.filter(([, , body]) => !/\[\^[\w-]+\]|<Law /.test(body!)).map(([, id]) => id);
    expect(uncited).toEqual([]);
  });
});
