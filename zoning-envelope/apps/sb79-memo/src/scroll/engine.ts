/**
 * The scroll engine (SB79_SPEC.md, "Scroll engine"; CLAUDE.md rule 3).
 *
 * One GSAP ScrollTrigger per <Step> observes the paragraph as it crosses a
 * focus line and reports its scroll progress (0..1). That progress sets a
 * target on one global clock, in seconds of the motion grammar: step i owns
 * [start_i, start_i + seconds_i]. A playhead follows the target at natural
 * speed, so each verb plays at its stated timing when the reader scrolls
 * briskly and slower when they scroll slowly; it never trails by more than
 * MAX_LAG_S. The playhead's position picks the step and its progress, and
 * apply(i, p) sends them to the figures. Everything is a function of scroll
 * position: scrolling back plays the same motion in reverse.
 *
 * Under prefers-reduced-motion there is no playhead: each step shows its
 * settled view, and the stage crossfades between them.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** The focus line, as a share of viewport height from the top. On phones the figure fills the top 45%. */
export const FOCUS = { desktop: 0.55, phone: 0.72 } as const;
export const PHONE_QUERY = '(max-width: 760px)';
export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** A step's motion completes once this share of its scroll span has passed the focus line; the rest holds the settled view. */
export const SETTLE = 0.65;
/** The playhead never trails the scroll by more than this many seconds. */
export const MAX_LAG_S = 1.0;

export interface EngineStep {
  id: string;
  el: HTMLElement;
  /** Natural length of the step's motion, in seconds (views.stateSeconds). */
  seconds: number;
}

export interface Engine {
  /**
   * Scroll so step `id` shows at `progress` (1: settled, mid-hold), without
   * playing the steps between. With `reveal`, a long paragraph stops short of
   * settled if that keeps its first line in view (share links).
   */
  scrollTo(id: string, progress?: number, opts?: { reveal?: boolean }): void;
  destroy(): void;
}

/** Clock time for step i at scroll progress ps. */
export function targetTime(starts: number[], seconds: number[], i: number, ps: number) {
  return starts[i]! + Math.min(1, Math.max(0, ps) / SETTLE) * seconds[i]!;
}

/** The step and its progress at clock time t. At a boundary the earlier step shows, settled. */
export function stepAt(starts: number[], seconds: number[], t: number): [number, number] {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1]! < t) i++;
  return [i, Math.min(1, Math.max(0, (t - starts[i]!) / seconds[i]!))];
}

export function startEngine(steps: EngineStep[], apply: (i: number, p: number) => void): Engine {
  const seconds = steps.map((s) => Math.max(s.seconds, 0.01));
  const starts = seconds.reduce<number[]>((acc, _, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + seconds[i - 1]!], []);
  const total = starts[starts.length - 1]! + seconds[seconds.length - 1]!;
  const head = { t: 0 };
  let reduced = false;
  let shown = -1;
  let triggers: ScrollTrigger[] = [];

  const render = () => {
    const [i, p] = stepAt(starts, seconds, head.t);
    apply(i, p);
  };
  const jump = (t: number) => {
    gsap.killTweensOf(head);
    head.t = t;
    render();
  };
  const follow = (t: number) => {
    const gap = Math.abs(t - head.t);
    if (gap < 1e-4) return;
    gsap.to(head, { t, duration: Math.min(gap, MAX_LAG_S), ease: 'none', overwrite: true, onUpdate: render });
  };
  const onScroll = (i: number, ps: number) => {
    if (reduced) {
      if (i !== shown) apply(i, 1);
      shown = i;
      return;
    }
    follow(targetTime(starts, seconds, i, ps));
  };

  /** Where the scroll is now, without playing toward it. */
  const sync = () => {
    const active = triggers.findIndex((st) => st.isActive);
    if (active >= 0) {
      const ps = triggers[active]!.progress;
      if (reduced) { shown = active; apply(active, 1); } else jump(targetTime(starts, seconds, active, ps));
      return;
    }
    const before = triggers[0] && window.scrollY < triggers[0].start;
    if (reduced) { shown = before ? 0 : steps.length - 1; apply(shown, 1); } else jump(before ? 0 : total);
  };

  const mm = gsap.matchMedia();
  // GSAP runs this when any condition matches, so `always` keeps it running on desktops with motion on;
  // it re-runs, rebuilding the triggers, whenever the phone or reduced-motion condition changes.
  mm.add({ always: '(min-width: 0px)', phone: PHONE_QUERY, reduce: REDUCED_QUERY }, (ctx) => {
    const { phone, reduce } = ctx.conditions as { phone: boolean; reduce: boolean };
    reduced = reduce;
    const focus = `${(phone ? FOCUS.phone : FOCUS.desktop) * 100}%`;
    triggers = steps.map((s, i) => {
      const next = steps[i + 1];
      return ScrollTrigger.create({
        trigger: s.el,
        start: `top ${focus}`,
        endTrigger: next?.el ?? s.el,
        end: next ? `top ${focus}` : `bottom ${focus}`,
        // Only the active step sets the target: a long jump updates every trigger it passes.
        onUpdate: (self) => { if (self.isActive) onScroll(i, self.progress); },
        onToggle: (self) => { if (self.isActive) onScroll(i, self.progress); },
        ...(i === 0 ? { onLeaveBack: () => onScroll(0, 0) } : {}),
        ...(next ? {} : { onLeave: () => onScroll(i, 1) }),
      });
    });
    ScrollTrigger.refresh();
    sync();
    return () => { triggers = []; };
  });

  return {
    scrollTo(id, progress = 1, opts = {}) {
      const i = steps.findIndex((s) => s.id === id);
      const st = triggers[i];
      if (!st) throw new Error(`No step "${id}"`);
      // Settled: the middle of the hold; otherwise the scroll point that plays to `progress`.
      let ps = progress >= 1 ? (1 + SETTLE) / 2 : progress * SETTLE;
      if (opts.reveal) {
        // Keep the paragraph's first line on screen: below the pinned figure on phones, near the top otherwise.
        const phone = matchMedia(PHONE_QUERY).matches;
        const room = ((phone ? FOCUS.phone : FOCUS.desktop) - (phone ? 0.47 : 0.08)) * innerHeight;
        ps = Math.min(ps, Math.max(0, room / Math.max(1, st.end - st.start)));
      }
      window.scrollTo({ top: st.start + ps * (st.end - st.start), behavior: 'instant' });
      if (reduced) { shown = i; apply(i, 1); } else jump(targetTime(starts, seconds, i, ps));
    },
    destroy() {
      gsap.killTweensOf(head);
      mm.revert();
    },
  };
}
