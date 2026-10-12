/**
 * The memo script: the contract between text and animation
 * (SB79_SPEC.md, "Memo script"). Each entry is one paragraph of the memo and
 * the one figure state that paragraph plays.
 *
 * - Every <Step id> in src/content/memo.mdx appears here exactly once, in the
 *   same order, and vice versa. test/script.test.ts enforces this.
 * - States name what a figure shows. They never carry legal numbers; figures
 *   read those from @zoning-envelope/law and the dated snapshots in data/.
 * - Figures implement each state as setState(state, progress) with progress
 *   0..1, so every state plays forward and in reverse with the scroll.
 */

export const FIGURES = ['map', 'envelope', 'checklist', 'timeline'] as const;
export type FigureId = (typeof FIGURES)[number];

export interface ScriptEntry {
  /** Matches <Step id="..."> in memo.mdx; also the share-link anchor. */
  readonly id: string;
  /** The memo section, as labeled in the spec's script table. */
  readonly section: string;
  readonly figure: FigureId;
  /** The figure state this paragraph plays (built in Phase 3). */
  readonly state: string;
}

export const script = [
  { id: 'question-presented', section: 'I. Question Presented', figure: 'envelope', state: 'ghost' },
  { id: 'short-answer', section: 'II. Short Answer', figure: 'envelope', state: 'preview-rise' },
  { id: 'transit-county', section: 'III.A.1 Urban transit county', figure: 'map', state: 'transit-counties' },
  { id: 'stop-tier', section: 'III.A.2 Stop and tier', figure: 'map', state: 'station-tier' },
  { id: 'distance', section: 'III.A.3 Distance', figure: 'map', state: 'distance-rings' },
  { id: 'city-size', section: 'III.A.4 City size', figure: 'map', state: 'outer-band' },
  { id: 'zoning-class', section: 'III.A.5 Zoning class', figure: 'map', state: 'eligibility-tint' },
  { id: 'local-opt-outs', section: 'III.A.6 Local opt-outs', figure: 'map', state: 'no-exclusions' },
  { id: 'height', section: 'III.B.1 Height', figure: 'envelope', state: 'height-rise' },
  { id: 'density', section: 'III.B.2 Density', figure: 'envelope', state: 'unit-fill' },
  { id: 'residential-far', section: 'III.B.3 Residential FAR', figure: 'envelope', state: 'plate-stack' },
  { id: 'local-rules', section: 'III.B.4 Local rules that remain', figure: 'envelope', state: 'setback-cannot-preclude' },
  { id: 'conditions', section: 'III.C Conditions', figure: 'checklist', state: 'conditions-tick' },
  { id: 'counterfactual', section: 'III.C counterfactual', figure: 'envelope', state: 'collapse' },
  { id: 'density-bonus', section: 'III.D Density bonus', figure: 'envelope', state: 'bonus-locked-height' },
  { id: 'approval', section: 'III.E Approval', figure: 'timeline', state: 'approval-path' },
  { id: 'city-options', section: 'III.F How cities change it', figure: 'map', state: 'bay-area-options' },
  { id: 'other-bands', section: 'III.G The other bands', figure: 'envelope', state: 'exhibit-comparison' },
  { id: 'conclusion', section: 'IV. Conclusion', figure: 'envelope', state: 'final' },
] as const satisfies readonly ScriptEntry[];

export type StepId = (typeof script)[number]['id'];

export function scriptEntry(id: string): ScriptEntry {
  const entry = script.find((e) => e.id === id);
  if (!entry) throw new Error(`<Step id="${id}"> has no entry in src/script.ts`);
  return entry;
}
