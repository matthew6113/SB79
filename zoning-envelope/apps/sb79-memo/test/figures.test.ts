import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { polygonArea } from '@zoning-envelope/engine';
import { FIGURES, script } from '../src/script';
import { IMPLEMENTED, checklistView, envelopeView, mapView, stateSeconds, timelineView, type EnvelopeView, type MapView } from '../src/figures/views';
import { GRAMMAR, motion } from '../src/figures/motion';
import { SETTLE, stepAt, targetTime } from '../src/scroll/engine';
import { buildFigureData } from '../src/figures/figure-data';
import { A, B, C, L, contrast, data as memoData } from '../src/memo-data';

const fig = buildFigureData();
const block = fig.envelope.block;
const statuses = fig.checklist.cards.map((c) => c.status);
/** Any figure's view at progress p, as a plain record. */
const viewOf = (figure: string, state: string, p: number): Record<string, unknown> =>
  figure === 'map' ? { ...mapView(state, p) }
  : figure === 'envelope' ? { ...envelopeView(state, p, block) }
  : figure === 'checklist' ? { ...checklistView(state, p, statuses) }
  : { ...timelineView(state, p) };
const PS = [0, 0.05, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.97, 1];

describe('figure states', () => {
  it('implements every script state, and no state the script does not use', () => {
    for (const f of FIGURES) {
      const used = [...new Set(script.filter((e) => e.figure === f).map((e) => e.state))].sort();
      expect([...IMPLEMENTED[f]].sort(), f).toEqual(used);
    }
  });

  it('gives every state a caption', () => {
    for (const e of script) expect(fig[e.figure].captions[e.state], e.id).toBeTruthy();
  });

  // Every value is finite, and every opacity or draw-on fraction stays in 0..1.
  it('keeps every view value finite and in range at any progress', () => {
    const counts = ['height', 'units', 'floorArea'];
    for (const e of script) {
      for (const p of PS) {
        const v = viewOf(e.figure, e.state, p);
        for (const [k, x] of Object.entries(v)) {
          const xs = Array.isArray(x) && typeof x[0] === 'number' ? (x as number[]) : typeof x === 'number' ? [x] : [];
          for (const n of xs) {
            expect(Number.isFinite(n), `${e.state}@${p}.${k}`).toBe(true);
            if (!counts.includes(k)) expect(n >= -1e-9 && n <= 1 + 1e-9, `${e.state}@${p}.${k} = ${n}`).toBe(true);
          }
        }
      }
    }
  });

  it('settles at progress 1 on the values the memo states', () => {
    const at1 = (s: string) => envelopeView(s, 1, block);
    expect(at1('ghost').height).toBe(B.localHeightFt);
    expect(at1('height-rise').height).toBe(B.floors.heightFt);
    expect(at1('unit-fill').units).toBeCloseTo(B.unitFloor, 9);
    expect(at1('plate-stack').floorArea).toBeCloseTo(B.residentialFloorAreaSqFt, 6);
    expect(at1('collapse')).toMatchObject({ height: B.localHeightFt, red: 1 });
    expect(at1('bonus-locked-height')).toMatchObject({ height: B.floors.heightFt, red: 0 });
    expect(at1('preview-rise').height).toBe(B.localHeightFt); // the preview resets
    expect(at1('contrast-three-heights')).toMatchObject({ scene: 'rockridge', mix: 1, rockRise: 1, towers: 1 });
    expect(at1('final')).toMatchObject({ scene: 'block', mix: 1, height: B.floors.heightFt, totals: 1 });
  });
});

describe('motion grammar (Phase 4)', () => {
  it('uses the spec timings: draw 0.8 s, rise 1.2 s, stamp 0.3 s', () => {
    expect(GRAMMAR.draw.seconds).toBe(0.8);
    expect(GRAMMAR.rise.seconds).toBe(1.2);
    expect(GRAMMAR.stamp.seconds).toBe(0.3);
    for (const [verb, g] of Object.entries(GRAMMAR)) {
      const m = motion({ x: 0 }, [{ verb: verb as keyof typeof GRAMMAR, to: { x: 1 } }]);
      expect(m.duration, verb).toBeCloseTo(g.seconds, 9);
      expect(m.at(0).x).toBe(0);
      expect(m.at(1).x).toBe(1);
    }
  });

  it('rises eased and collapses accelerating', () => {
    const rise = motion({ h: 0 }, [{ verb: 'rise', to: { h: 1 } }]);
    const fall = motion({ h: 1 }, [{ verb: 'collapse', to: { h: 0 } }]);
    expect(rise.at(0.1).h).toBeLessThan(0.1); // eased in
    expect(rise.at(0.9).h).toBeGreaterThan(0.9); // eased out
    expect(fall.at(0.5).h).toBeGreaterThan(0.5); // drops slowly, then fast
  });

  it('gives every step a motion of positive length', () => {
    for (const e of script) expect(stateSeconds(e.figure, e.state, { block, statuses }), e.id).toBeGreaterThan(0);
  });

  // A view depends only on progress: seeking forward, backward, or at random gives the same view.
  it('plays the same backward as forward', () => {
    for (const e of script) {
      const forward = PS.map((p) => JSON.stringify(viewOf(e.figure, e.state, p)));
      const backward = [...PS].reverse().map((p) => JSON.stringify(viewOf(e.figure, e.state, p))).reverse();
      const shuffled = [5, 0, 10, 3, 8, 1, 9, 2, 7, 4, 6].map((k) => [k, JSON.stringify(viewOf(e.figure, e.state, PS[k]!))] as const);
      expect(backward, e.id).toEqual(forward);
      for (const [k, v] of shuffled) expect(v, `${e.id}@${PS[k]}`).toBe(forward[k]);
    }
  });

  // Where consecutive paragraphs share a figure, the next state starts exactly
  // where the last one settled, so nothing jumps at a paragraph boundary.
  const mapLook = (v: MapView) => {
    const { box, zoom, legend, legendFrom, legendIn, ...rest } = v;
    return { ...rest, box: zoom >= 1 ? box[1] : zoom <= 0 ? box[0] : `${box.join('>')}@${zoom}`, legend: legendIn >= 1 ? legend : legendIn <= 0 ? legendFrom : 'mixed' };
  };
  const envLook = (v: EnvelopeView): Record<string, unknown> => {
    if (v.from && v.mix === 0) return envLook(v.from);
    const { from, mix, ...rest } = v;
    const look: Record<string, unknown> = { ...rest };
    // No dots or plates showing looks the same however many are counted.
    if (v.dots === 0 || v.units === 0) { delete look.units; delete look.dots; }
    if (v.plates === 0 || v.floorArea === 0) { delete look.floorArea; delete look.plates; }
    return look;
  };
  it('starts each state where the previous paragraph left the same figure', () => {
    const pairs = script.slice(1).map((e, i) => [script[i]!, e] as const).filter(([a, b]) => a.figure === b.figure);
    expect(pairs.length).toBeGreaterThan(8);
    for (const [a, b] of pairs) {
      if (a.figure === 'map') expect(mapLook(mapView(b.state, 0)), `${a.id} -> ${b.id}`).toEqual(mapLook(mapView(a.state, 1)));
      if (a.figure === 'envelope') expect(envLook(envelopeView(b.state, 0, block)), `${a.id} -> ${b.id}`).toEqual(envLook(envelopeView(a.state, 1, block)));
    }
  });
});

describe('scroll engine clock', () => {
  const seconds = [2, 1, 3];
  const starts = [0, 2, 3];
  it('maps scroll progress to the clock, finishing a step at SETTLE and holding after', () => {
    expect(targetTime(starts, seconds, 1, 0)).toBe(2);
    expect(targetTime(starts, seconds, 1, SETTLE / 2)).toBeCloseTo(2.5, 9);
    expect(targetTime(starts, seconds, 1, SETTLE)).toBe(3);
    expect(targetTime(starts, seconds, 1, 1)).toBe(3);
  });
  it('shows the earlier step, settled, at a boundary', () => {
    expect(stepAt(starts, seconds, 0)).toEqual([0, 0]);
    expect(stepAt(starts, seconds, 2)).toEqual([0, 1]);
    expect(stepAt(starts, seconds, 2.5)).toEqual([1, 0.5]);
    expect(stepAt(starts, seconds, 6)).toEqual([2, 1]);
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
  const dirs = ['../src/figures/'].map((d) => new URL(d, import.meta.url));
  const files = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => new URL(f, dir)));
  const names = (t: string) => t.replace(/\b(?:SB|AB) \d+\b/g, '').replace(/\b3D\b/g, '');

  it('render no hand-typed numbers', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const sf = ts.createSourceFile(f.pathname, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        const rendered =
          ts.isJsxText(n) ? n.text
          : ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression)) && !ts.isJsxAttribute(n.parent)
            ? n.expression.text
            : null;
        if (rendered && /\d/.test(names(rendered))) offenders.push(`${f.pathname.split('/src/')[1]}: ${rendered.trim()}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(offenders).toEqual([]);
  });
});
