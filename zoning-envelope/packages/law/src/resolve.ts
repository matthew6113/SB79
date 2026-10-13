/**
 * The law in force on a date. Leaves carry optional from/to dates; versioned
 * provisions list each wording by date. lawAsOf picks what applied that day.
 */
import rawLaw from '../sb79.json' with { type: 'json' };
import { sb79Schema, type CitedLeaf, type Sb79Law } from './schema.ts';

export const law: Sb79Law = sb79Schema.parse(rawLaw);

type Resolved<T> = T extends { versions: Array<infer L> }
  ? L | undefined
  : T extends { value: unknown; cite: string }
    ? T
    : T extends readonly unknown[]
      ? T
      : T extends object
        ? { [K in keyof T]: Resolved<T[K]> }
        : T;

export type LawAsOf = Resolved<Sb79Law> & { readonly asOf: string };

const isLeaf = (x: unknown): x is CitedLeaf =>
  typeof x === 'object' && x !== null && 'value' in x && 'cite' in x && 'quote' in x;

/** True when a leaf is in force on the date (ISO dates compare as strings). */
export const inForce = (leaf: CitedLeaf, asOf: string) =>
  (leaf.from === undefined || leaf.from <= asOf) && (leaf.to === undefined || asOf < leaf.to);

function resolveNode(node: unknown, asOf: string): unknown {
  if (isLeaf(node)) return inForce(node, asOf) ? node : undefined;
  if (typeof node === 'object' && node !== null && 'versions' in node) {
    const current = (node as { versions: CitedLeaf[] }).versions.filter((v) => inForce(v, asOf));
    if (current.length > 1) throw new Error(`Overlapping versions in force on ${asOf}: ${current.map((v) => v.cite).join(', ')}`);
    return current[0];
  }
  if (Array.isArray(node) || typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveNode(v, asOf)]));
}

/** The provisions in force on `asOf` (YYYY-MM-DD). Throws before SB 79 took effect. */
export function lawAsOf(asOf: string): LawAsOf {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be YYYY-MM-DD, got ${asOf}`);
  if (asOf < law.acts.sb79.effective.value) {
    throw new Error(`SB 79 took effect ${law.acts.sb79.effective.value} (${law.acts.sb79.effective.cite}); ${asOf} is earlier`);
  }
  return { ...(resolveNode(law, asOf) as Resolved<Sb79Law>), asOf };
}

/** A provision that must be in force; throws with its name otherwise. */
export function need<L>(leaf: L | undefined, name: string, asOf: string): L {
  if (leaf === undefined) throw new Error(`${name} is not in force on ${asOf}`);
  return leaf;
}
