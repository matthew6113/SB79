/**
 * The pinned figure column. Hosts the three figures and routes a step to
 * its figure and state through the script table (src/script.ts):
 *
 *   setStep(stepId, progress) -> figures[entry.figure].setState(entry.state, progress)
 *
 * The scroll engine (src/scroll/engine.ts) drives setStep from the reader's
 * scroll. Where consecutive steps use different figures, the two crossfade as
 * the new step begins (scroll-linked, like everything else); captions do the
 * same. Under prefers-reduced-motion each step shows settled and the stage
 * crossfades from a snapshot of the previous view.
 *
 * window.sb79Figures exposes setStep and scrollTo; an "sb79:step" event with
 * { id, progress } also sets a step. In development a panel lists every state
 * and `?step=<id>&p=<0..1>` opens one.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FIGURES, script, scriptEntry, type FigureId } from '../script';
import type { FigureData, FigureHandle } from './types';
import { stateSeconds } from './views';
import { NEUTRAL } from './motion';
import { REDUCED_QUERY, startEngine, type Engine } from '../scroll/engine';
import { startShareLinks } from '../scroll/share';
import { still } from '../print/still';
import MapFigure from './MapFigure';
import Timeline from './Timeline';

const EnvelopeFigure = lazy(() => import('./EnvelopeFigure'));
const DevPanel = import.meta.env.DEV ? lazy(() => import('./DevPanel')) : null;

export interface Active {
  step: string;
  progress: number;
}

declare global {
  interface Window {
    sb79Figures?: {
      setStep(id: string, progress: number): void;
      scrollTo(id: string, progress?: number): void;
      steps: readonly string[];
    };
  }
}

const indexOf = (id: string) => script.findIndex((e) => e.id === id);

/** Keeps one figure's failure (no WebGL, say) from taking down the others. */
class FigureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="fig-fallback">This figure could not be drawn in this browser (it needs WebGL).</p> : this.props.children;
  }
}

export default function FigureStage() {
  const [data, setData] = useState<FigureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Active>({ step: script[0].id, progress: 0 });
  const [reduced, setReduced] = useState(false);
  const handles = useRef<Partial<Record<FigureId, FigureHandle>>>({});
  const slots = useRef<Partial<Record<FigureId, HTMLDivElement | null>>>({});
  const fade = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}figure-data.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`figure-data.json: HTTP ${r.status}`))))
      .then((d: FigureData) => setData(d))
      .catch((e: unknown) => setError(String(e)));
    const mq = matchMedia(REDUCED_QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /** Seconds of motion per step, for the engine and the crossfades. */
  const [seconds, setSeconds] = useState<number[]>([]);
  useEffect(() => {
    if (!data) return;
    const ctx = { block: data.envelope.block };
    setSeconds(script.map((e) => stateSeconds(e.figure, e.state, ctx)));
  }, [data]);

  const apply = useCallback((a: Active) => {
    const i = indexOf(a.step);
    const e = script[i]!;
    // Crossing into a new figure: the outgoing one holds its previous step, settled.
    const prev = script[i - 1];
    if (prev && prev.figure !== e.figure) handles.current[prev.figure]?.setState(prev.state, 1);
    handles.current[e.figure]?.setState(e.state, a.progress);
  }, []);

  /** Ref callbacks: a figure that mounts late (the 3D one loads lazily) catches up on the current step. */
  const attach = useCallback((figure: FigureId) => (h: FigureHandle | null) => {
    if (h) {
      handles.current[figure] = h;
      const i = indexOf(activeRef.current.step);
      if (script[i]!.figure === figure || script[i - 1]?.figure === figure) apply(activeRef.current);
    } else {
      delete handles.current[figure];
    }
  }, [apply]);
  const [refs] = useState(() => Object.fromEntries(FIGURES.map((f) => [f, attach(f)])) as Record<FigureId, (h: FigureHandle | null) => void>);

  useEffect(() => { if (data) apply(active); }, [data, active, apply]);

  const setStep = useCallback((id: string, progress: number) => {
    scriptEntry(id); // throws on an unknown id
    const p = Math.min(1, Math.max(0, progress));
    const prev = activeRef.current;
    if (reducedRef.current && prev.step !== id && fade.current) {
      // Reduced motion: crossfade from a still of what was showing.
      const from = slots.current[scriptEntry(prev.step).figure];
      if (from) {
        const copy = still(from, 'fade', { canvasAsImage: false });
        copy.classList.add('is-active');
        fade.current.replaceChildren(copy);
        copy.style.opacity = '1';
        requestAnimationFrame(() => requestAnimationFrame(() => { copy.style.opacity = '0'; }));
        copy.addEventListener('transitionend', () => copy.remove(), { once: true });
        // If the transition never ends (a hidden tab, a stalled compositor), the still must not linger.
        setTimeout(() => copy.remove(), 1000);
      }
    }
    if (prev.step !== id || prev.progress !== p) setActive({ step: id, progress: p });
  }, []);

  // Start the scroll engine once the figure data (and so every step's timing) is known.
  useEffect(() => {
    if (!data || seconds.length !== script.length) return;
    const steps = script.map((e, i) => {
      const el = document.querySelector<HTMLElement>(`[data-step="${e.id}"]`);
      if (!el) throw new Error(`<Step id="${e.id}"> is not on the page`);
      return { id: e.id, el, seconds: seconds[i]! };
    });
    const eng = startEngine(steps, (i, p) => setStep(script[i]!.id, p));
    engine.current = eng;
    // Share links: #<step id> opens the memo at that paragraph, settled.
    const stopShare = startShareLinks((id) => eng.scrollTo(id, 1, { reveal: true }));
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      const step = q.get('step');
      if (step && script.some((e) => e.id === step)) eng.scrollTo(step, Math.min(1, Math.max(0, Number(q.get('p') ?? 1)) || 0));
    }
    return () => { stopShare(); eng.destroy(); engine.current = null; };
  }, [data, seconds, setStep]);

  const scrollTo = useCallback((id: string, progress = 1) => {
    if (engine.current) engine.current.scrollTo(id, progress);
    else setStep(id, progress);
  }, [setStep]);

  useEffect(() => {
    window.sb79Figures = { setStep, scrollTo, steps: script.map((e) => e.id) };
    const onStep = (ev: Event) => {
      const d = (ev as CustomEvent<{ id: string; progress?: number }>).detail;
      setStep(d.id, d.progress ?? 1);
    };
    window.addEventListener('sb79:step', onStep);
    return () => {
      window.removeEventListener('sb79:step', onStep);
      delete window.sb79Figures;
    };
  }, [setStep, scrollTo]);

  // Crossfade window at the start of a step: the neutral "show" duration, in step progress.
  const i = indexOf(active.step);
  const entry = script[i]!;
  const prev = script[i - 1];
  const w = reduced || !seconds[i] ? 1 : Math.min(1, (active.progress * seconds[i]!) / NEUTRAL.show.seconds);
  const opacityOf = (f: FigureId) =>
    f === entry.figure ? (prev && prev.figure !== f ? w : 1) : prev && prev.figure === f && entry.figure !== f ? 1 - w : 0;
  const caption = data?.[entry.figure].captions[entry.state];
  const prevCaption = prev && data?.[prev.figure].captions[prev.state];

  const slot = (f: FigureId, child: ReactNode) => {
    const o = opacityOf(f);
    return (
      <div ref={(el) => { slots.current[f] = el; }} className={`figure-slot ${o > 0 ? 'is-active' : ''}`} style={{ opacity: o }} aria-hidden={f !== entry.figure}>
        {child}
      </div>
    );
  };

  return (
    <div
      className={`figure-stage ${reduced ? 'is-reduced' : ''}`}
      data-step={entry.id} data-figure={entry.figure} data-state={entry.state} data-progress={active.progress.toFixed(3)} data-ready={Boolean(data)}
    >
      <div className="figure-frame">
        {error && <p className="fig-fallback">{error}</p>}
        {!data && !error && <p className="fig-fallback">Loading figures…</p>}
        {data && (
          <>
            {slot('map', <MapFigure data={data.map} ref={refs.map} />)}
            {slot('envelope', (
              <FigureBoundary>
                <Suspense fallback={<p className="fig-fallback">Loading the 3D figure…</p>}>
                  <EnvelopeFigure data={data.envelope} ref={refs.envelope} />
                </Suspense>
              </FigureBoundary>
            ))}
            {slot('timeline', <Timeline data={data.timeline} ref={refs.timeline} />)}
          </>
        )}
        <div ref={fade} className="figure-fade" aria-hidden />
      </div>
      <div className="figure-caption">
        {prevCaption && prevCaption !== caption && w < 1 && <p style={{ opacity: 1 - w }}>{prevCaption}</p>}
        <p style={{ opacity: prevCaption && prevCaption !== caption ? w : 1 }}>{caption ?? ' '}</p>
      </div>
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel active={active} setStep={setStep} scrollTo={scrollTo} />
        </Suspense>
      )}
    </div>
  );
}
