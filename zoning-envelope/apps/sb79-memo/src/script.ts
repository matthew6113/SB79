/**
 * The script: the contract between text and animation (SB79_SPEC.md, "Memo
 * script"). Each entry is one paragraph of the explainer and the one figure
 * state that paragraph plays.
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
  /** The section and topic, as labeled in the spec's script table. */
  readonly section: string;
  readonly figure: FigureId;
  /** The figure state this paragraph plays (built in Phase 3). */
  readonly state: string;
}

export const script = [
  { id: 'introduction', section: 'Introduction', figure: 'envelope', state: 'ghost' },
  { id: 'key-points', section: 'Key Points', figure: 'envelope', state: 'preview-rise' },
  { id: 'transit-county', section: 'Where it applies: urban transit county', figure: 'map', state: 'transit-counties' },
  { id: 'stop-tier', section: 'Where it applies: stop and tier', figure: 'map', state: 'station-tier' },
  { id: 'distance', section: 'Where it applies: distance', figure: 'map', state: 'distance-rings' },
  { id: 'city-size', section: 'Where it applies: city size', figure: 'map', state: 'outer-band' },
  { id: 'zoning-class', section: 'Where it applies: zoning', figure: 'map', state: 'eligibility-tint' },
  { id: 'local-opt-outs', section: 'Where it applies: local changes', figure: 'map', state: 'no-exclusions' },
  { id: 'height', section: 'What the city must allow: height', figure: 'envelope', state: 'height-rise' },
  { id: 'density', section: 'What the city must allow: density', figure: 'envelope', state: 'unit-fill' },
  { id: 'residential-far', section: 'What the city must allow: residential floor area', figure: 'envelope', state: 'plate-stack' },
  { id: 'local-rules', section: 'What the city must allow: local rules that remain', figure: 'envelope', state: 'setback-cannot-preclude' },
  { id: 'conditions', section: 'What a project must do: conditions', figure: 'checklist', state: 'conditions-tick' },
  { id: 'counterfactual', section: 'What a project must do: one failed condition', figure: 'envelope', state: 'collapse' },
  { id: 'density-bonus', section: 'Density bonus', figure: 'envelope', state: 'bonus-locked-height' },
  { id: 'density-bonus-contrast', section: 'Density bonus: Rockridge, Oakland', figure: 'envelope', state: 'contrast-three-heights' },
  { id: 'approval', section: 'Approval', figure: 'timeline', state: 'approval-path' },
  { id: 'city-options', section: 'How cities change the defaults', figure: 'map', state: 'bay-area-options' },
  { id: 'other-bands', section: 'Sites nearer and farther', figure: 'envelope', state: 'exhibit-comparison' },
  { id: 'takeaways', section: 'Key Takeaways', figure: 'envelope', state: 'final' },
] as const satisfies readonly ScriptEntry[];

export type StepId = (typeof script)[number]['id'];

export function scriptEntry(id: string): ScriptEntry {
  const entry = script.find((e) => e.id === id);
  if (!entry) throw new Error(`<Step id="${id}"> has no entry in src/script.ts`);
  return entry;
}
