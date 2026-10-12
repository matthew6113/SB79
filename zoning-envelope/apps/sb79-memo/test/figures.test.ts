import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { polygonArea } from '@zoning-envelope/engine';
import { FIGURES, script } from '../src/script';
import { IMPLEMENTED, checklistViews, envelopeViews, mapViews, timelineViews } from '../src/figures/views';
import { buildFigureData } from '../src/figures/figure-data';
import { A, B, C, L, contrast, data as memoData } from '../src/memo-data';

const fig = buildFigureData();

describe('figure states (Phase 3)', () => {
  it('implements every script state, and no state the script does not use', () => {
    for (const f of FIGURES) {
      const used = [...new Set(script.filter((e) => e.figure === f).map((e) => e.state))].sort();
      expect([...IMPLEMENTED[f]].sort(), f).toEqual(used);
    }
  });

  it('gives every state a caption', () => {
    for (const e of script) expect(fig[e.figure].captions[e.state], e.id).toBeTruthy();
  });

  // Views are pure functions of progress: every value is finite and every
  // opacity or draw-on fraction stays in 0..1, from progress 0 to 1.
  const check = (name: string, view: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(view)) {
      if (typeof v !== 'number') continue;
      expect(Number.isFinite(v), `${name}.${k}`).toBe(true);
      if (!['height', 'units', 'floorArea'].includes(k)) expect(v >= 0 && v <= 1, `${name}.${k} = ${v}`).toBe(true);
    }
  };
  const ps = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  it('keeps every view value finite and in range at any progress', () => {
    for (const [s, v] of Object.entries(mapViews)) for (const p of ps) check(`map ${s}@${p}`, v(p) as never);
    for (const [s, v] of Object.entries(envelopeViews)) for (const p of ps) check(`envelope ${s}@${p}`, v(p, fig.envelope.block) as never);
    for (const [s, v] of Object.entries(checklistViews)) for (const p of ps) check(`checklist ${s}@${p}`, { ...v(p, 1) });
    for (const [s, v] of Object.entries(timelineViews)) for (const p of ps) check(`timeline ${s}@${p}`, v(p) as never);
  });

  it('settles at progress 1 on the values the memo states', () => {
    const b = fig.envelope.block;
    expect(envelopeViews.ghost(1, b).height).toBe(B.localHeightFt);
    expect(envelopeViews['height-rise'](1, b).height).toBe(B.floors.heightFt);
    expect(envelopeViews['unit-fill'](1, b).units).toBeCloseTo(B.unitFloor, 9);
    expect(envelopeViews['plate-stack'](1, b).floorArea).toBeCloseTo(B.residentialFloorAreaSqFt, 6);
    expect(envelopeViews.collapse(1, b)).toMatchObject({ height: B.localHeightFt, collapsed: true });
    expect(envelopeViews['bonus-locked-height'](1, b).height).toBe(B.floors.heightFt);
    expect(envelopeViews['preview-rise'](1, b).height).toBe(B.localHeightFt); // the preview resets
  });
});

describe('figure data', () => {
  const b = fig.envelope.block;

  it('takes the 3D heights from the law and the snapshots', () => {
    expect(b.localHeightFt).toBe(B.localHeightFt);
    expect(b.floorHeightFt).toBe(B.floors.heightFt);
    expect(fig.envelope.laborFt).toBe(L.labor.buildingHeightOverFt.value);
    expect(fig.envelope.exhibits.map((e) => [e.key, e.localHeightFt, e.floorHeightFt])).toEqual(
      [A, B, C].map((x) => [x.key, x.localHeightFt, x.floors.heightFt]),
    );
    expect(fig.envelope.rockridge).toMatchObject({ localHeightFt: contrast.localHeightFt, floorHeightFt: contrast.sb79HeightFt });
    expect(fig.envelope.rockridge.towers.map((t) => t.heightFt)).toEqual(contrast.towerHeightsFt);
  });

  it('stacks floor plates that hold exactly the residential floor area, under the height floor', () => {
    const total = b.plateAreas.reduce((s, a) => s + a, 0);
    expect(total).toBeCloseTo(B.residentialFloorAreaSqFt, 6);
    b.plates.forEach((p, i) => {
      expect(polygonArea({ outer: p.ring }) / b.plateAreas[i]!).toBeCloseTo(1, 2);
      expect(p.elevation + p.thickness).toBeLessThanOrEqual(B.floors.heightFt);
    });
  });

  it('draws one dot per unit of the unit floor, the last one fractional, all under the height floor', () => {
    expect(b.dots).toHaveLength(Math.ceil(B.unitFloor));
    for (const [, , z] of [...b.dots, ...b.bonusDots]) expect(z).toBeLessThan(B.floors.heightFt);
  });

  it("draws the measuring line from Exhibit B's nearest edge to its nearest access point", () => {
    const { from, to } = fig.map.local.measure;
    // Map coordinates are rounded to whole feet, so allow for rounding at both ends.
    expect(Math.hypot(to[0] - from[0], to[1] - from[1])).toBeCloseTo(B.distanceFt, -0.5);
  });

  it('draws every exhibit, MTC zone, and parcel group', () => {
    const m = fig.map.local;
    expect(m.sites.map((s) => s.key)).toEqual(['A', 'B', 'C']);
    for (const d of [...m.sites.map((s) => s.d), m.zones.adjacent, m.zones.quarter, m.zones.half, m.parcels.eligible, m.rail, m.berkeley.d, m.land]) {
      expect(d.length).toBeGreaterThan(10);
    }
  });

  it('maps the three Bay Area cities to their recorded SB 79 positions', () => {
    const status = Object.fromEntries(fig.map.local.jurisdictions.filter((j) => j.status).map((j) => [j.name, j.status]));
    expect(status).toEqual({
      Berkeley: memoData.localOptions.berkeley.status,
      Oakland: memoData.localOptions.oakland.status,
      'San Francisco': memoData.localOptions.sanFrancisco.status,
    });
  });

  it('marks HCD\'s urban transit counties and Orange as the open issue', () => {
    const ca = fig.map.california.counties;
    expect(ca.filter((c) => c.utc).map((c) => c.name).sort()).toEqual([...memoData.counties.counties].sort());
    expect(ca.filter((c) => c.openIssue).map((c) => c.name)).toEqual([memoData.counties.openIssue.county]);
  });
});

// Rule 1 (CLAUDE.md) for figures: components place labels from figure-data.ts
// and render no numbers of their own. Rendered JSX text (and string literals
// placed as JSX children) may not contain digits, bill names aside. Numbers in
// code (layout, geometry) are not rendered text and are not checked.
describe('figure components', () => {
  const dir = new URL('../src/figures/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  const names = (t: string) => t.replace(/\b(?:SB|AB) \d+\b/g, '').replace(/\b3D\b/g, '');

  it('render no hand-typed numbers', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const sf = ts.createSourceFile(f, readFileSync(new URL(f, dir), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        const rendered =
          ts.isJsxText(n) ? n.text
          : ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression)) && !ts.isJsxAttribute(n.parent)
            ? n.expression.text
            : null;
        if (rendered && /\d/.test(names(rendered))) offenders.push(`${f}: ${rendered.trim()}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(offenders).toEqual([]);
  });
});
