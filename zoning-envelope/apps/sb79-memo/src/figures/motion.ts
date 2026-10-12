/**
 * The motion grammar (SB79_SPEC.md, "Figures and animation"): each verb means
 * one legal idea, every time, and moves one way.
 *
 * | Verb     | Legal meaning              | Motion                                          |
 * | draw     | A measurement or test      | lines and rings trace on, 0.8 s                 |
 * | rise     | An entitlement granted     | envelope or plates lift from the ghost, 1.2 s   |
 * | fill     | A quantity counted         | dots or plates appear in sequence with a counter|
 * | stamp    | A legal conclusion         | a seal-like label settles on, 0.3 s             |
 * | grayOut  | Preempted or inapplicable  | color drains to the ghost tone                  |
 * | collapse | Eligibility lost           | envelope drops back to the ghost, in red        |
 *
 * The spec times draw, rise, and stamp; fill, grayOut, and collapse carry
 * durations chosen here. Two neutral transitions carry no legal meaning:
 * `show` (things appear or clear) and `move` (the view pans or zooms).
 *
 * A state's motion is a paused GSAP timeline over a plain view object. Its
 * durations are seconds of natural playback; the scroll engine moves the
 * playhead with the reader's scroll, never faster than this natural speed
 * (src/scroll/engine.ts). Seeking the timeline is deterministic, so a view is
 * a pure function of progress and plays the same backward as forward.
 */
import { gsap } from 'gsap';

export const GRAMMAR = {
  draw: { seconds: 0.8, ease: 'power1.inOut' },
  rise: { seconds: 1.2, ease: 'power2.inOut' },
  fill: { seconds: 1.2, ease: 'none' },
  stamp: { seconds: 0.3, ease: 'power2.out' },
  grayOut: { seconds: 0.6, ease: 'power1.out' },
  collapse: { seconds: 0.8, ease: 'power3.in' },
} as const;

export const NEUTRAL = {
  show: { seconds: 0.4, ease: 'power1.inOut' },
  move: { seconds: 1.0, ease: 'power2.inOut' },
  hold: { seconds: 0.6, ease: 'none' },
} as const;

export type Verb = keyof typeof GRAMMAR | keyof typeof NEUTRAL;
const VERBS: Record<Verb, { seconds: number; ease: string }> = { ...GRAMMAR, ...NEUTRAL };

type NumericKeys<V> = { [K in keyof V]: V[K] extends number ? K : never }[keyof V];

export interface Beat<V> {
  verb: Verb;
  /** End values of numeric view fields. */
  to?: Partial<Pick<V, NumericKeys<V>>>;
  /** GSAP position: "<" with the previous beat, "+=0.2" after a gap; default is after the previous beat. */
  at?: string | number;
}

export interface Motion<V> {
  /** Natural length in seconds. */
  readonly duration: number;
  /** The view at progress p (0..1). */
  at(p: number): V;
}

/** A state's motion: `start` is its view at progress 0, changed by `beats` in order. */
export function motion<V extends object>(start: V, beats: Beat<V>[]): Motion<V> {
  const work = { ...start } as Record<string, unknown>;
  const tl = gsap.timeline({ paused: true });
  for (const b of beats) {
    const v = VERBS[b.verb];
    if (!v) throw new Error(`Unknown motion verb "${b.verb}"`);
    tl.to(b.verb === 'hold' ? {} : work, { ...(b.to ?? {}), duration: v.seconds, ease: v.ease, immediateRender: false }, b.at);
  }
  // Record every tween's start values in timeline order, then rewind.
  tl.progress(1, true).progress(0, true);
  const duration = tl.duration();
  // GSAP rounds tweened values to six decimals; the settled view keeps the exact values.
  const settled = Object.assign({ ...start }, ...beats.map((b) => b.to ?? {})) as V;
  return {
    duration,
    at(p: number) {
      if (p <= 0) return { ...start };
      if (p >= 1) return { ...settled };
      tl.progress(p, true);
      // GSAP keeps its own cache on the target object; it is not part of the view.
      const { _gsap, ...view } = work;
      return view as V;
    },
  };
}

/** Linear interpolation, for figures that blend two views. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
