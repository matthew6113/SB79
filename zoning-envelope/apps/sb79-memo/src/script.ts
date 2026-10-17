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

export const FIGURES = ['map', 'envelope', 'timeline'] as const;
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
  { id: 'introduction', section: 'Introduction', figure: 'map', state: 'california' },
  { id: 'key-points', section: 'Key Points', figure: 'map', state: 'utc-fill' },
  { id: 'transit-county', section: 'Where it applies: urban transit counties', figure: 'map', state: 'transit-counties' },
  { id: 'alternative-plans', section: 'Changing the defaults: alternative plans', figure: 'map', state: 'alt-plan-cities' },
  { id: 'san-francisco', section: 'Changing the defaults: San Francisco', figure: 'map', state: 'sf-plan' },
  { id: 'berkeley', section: 'In Berkeley: the city', figure: 'map', state: 'berkeley' },
  { id: 'station', section: 'In Berkeley: the station and its bands', figure: 'map', state: 'station-rings' },
  { id: 'zoning-class', section: 'In Berkeley: zoning', figure: 'map', state: 'zoning' },
  { id: 'bart-land', section: 'In Berkeley: BART’s land', figure: 'map', state: 'bart-land' },
  { id: 'hazards', section: 'In Berkeley: fire and airport', figure: 'map', state: 'hazards' },
  { id: 'rent-control', section: 'In Berkeley: rent control', figure: 'map', state: 'rent-control' },
  { id: 'historic', section: 'In Berkeley: landmarks', figure: 'map', state: 'historic' },
  { id: 'high-resource', section: 'In Berkeley: the opportunity map', figure: 'map', state: 'high-resource' },
  { id: 'pick-parcel', section: 'The example lot', figure: 'map', state: 'pick-parcel' },
  { id: 'today', section: 'What the city must allow: today', figure: 'envelope', state: 'ghost' },
  { id: 'height', section: 'What the city must allow: height', figure: 'envelope', state: 'height-rise' },
  { id: 'density', section: 'What the city must allow: density', figure: 'envelope', state: 'unit-fill' },
  { id: 'residential-far', section: 'What the city must allow: residential floor area', figure: 'envelope', state: 'plate-stack' },
  { id: 'local-rules', section: 'What the city must allow: local rules that remain', figure: 'envelope', state: 'setback-cannot-preclude' },
  { id: 'minimums', section: 'What a project must do: minimums', figure: 'envelope', state: 'minimums' },
  { id: 'affordability', section: 'What a project must do: affordable units', figure: 'envelope', state: 'affordable-units' },
  { id: 'counterfactual', section: 'What a project must do: one failed condition', figure: 'envelope', state: 'collapse' },
  { id: 'density-bonus', section: 'Density bonus', figure: 'envelope', state: 'bonus-locked-height' },
  { id: 'density-bonus-contrast', section: 'Density bonus: Rockridge, Oakland', figure: 'envelope', state: 'contrast-three-heights' },
  { id: 'approval', section: 'Approval', figure: 'timeline', state: 'approval-path' },
  { id: 'other-bands', section: 'Sites nearer and farther', figure: 'envelope', state: 'exhibit-comparison' },
  { id: 'takeaways', section: 'Key Takeaways', figure: 'envelope', state: 'final' },
] as const satisfies readonly ScriptEntry[];

export type StepId = (typeof script)[number]['id'];

export function scriptEntry(id: string): ScriptEntry {
  const entry = script.find((e) => e.id === id);
  if (!entry) throw new Error(`<Step id="${id}"> has no entry in src/script.ts`);
  return entry;
}
