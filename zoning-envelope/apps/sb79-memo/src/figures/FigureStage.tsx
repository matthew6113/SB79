/**
 * The pinned figure column. Hosts the four figures and routes a memo step to
 * its figure and state through the script table (src/script.ts):
 *
 *   setStep(stepId, progress) -> figures[entry.figure].setState(entry.state, progress)
 *
 * The Phase 4 scroll engine calls window.sb79Figures.setStep (or dispatches
 * an "sb79:step" event with { id, progress }). In development, a panel lists
 * every state and `?step=<id>&p=<0..1>` opens one directly.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FIGURES, script, scriptEntry, type FigureId } from '../script';
import type { FigureData, FigureHandle } from './types';
import MapFigure from './MapFigure';
import Checklist from './Checklist';
import Timeline from './Timeline';

const EnvelopeFigure = lazy(() => import('./EnvelopeFigure'));
const DevPanel = import.meta.env.DEV ? lazy(() => import('./DevPanel')) : null;

export interface Active {
  step: string;
  progress: number;
}

declare global {
  interface Window {
    sb79Figures?: { setStep(id: string, progress: number): void; steps: readonly string[] };
  }
}

function initial(): Active {
  const fallback = { step: script[0].id, progress: 1 };
  if (!import.meta.env.DEV || typeof location === 'undefined') return fallback;
  const q = new URLSearchParams(location.search);
  const step = q.get('step');
  if (!step || !script.some((e) => e.id === step)) return fallback;
  const p = Number(q.get('p') ?? 1);
  return { step, progress: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 1 };
}

export default function FigureStage() {
  const [data, setData] = useState<FigureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Active>(initial);
  const handles = useRef<Partial<Record<FigureId, FigureHandle>>>({});
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}figure-data.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`figure-data.json: HTTP ${r.status}`))))
      .then((d: FigureData) => setData(d))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const apply = useCallback((a: Active) => {
    const e = scriptEntry(a.step);
    handles.current[e.figure]?.setState(e.state, a.progress);
  }, []);

  /** Ref callbacks: a figure that mounts late (the 3D one loads lazily) catches up on the current step. */
  const attach = useCallback((figure: FigureId) => (h: FigureHandle | null) => {
    if (h) {
      handles.current[figure] = h;
      if (scriptEntry(activeRef.current.step).figure === figure) apply(activeRef.current);
    } else {
      delete handles.current[figure];
    }
  }, [apply]);
  const [refs] = useState(() => Object.fromEntries(FIGURES.map((f) => [f, attach(f)])) as Record<FigureId, (h: FigureHandle | null) => void>);

  useEffect(() => { if (data) apply(active); }, [data, active, apply]);

  const setStep = useCallback((id: string, progress: number) => {
    scriptEntry(id); // throws on an unknown id
    setActive({ step: id, progress: Math.min(1, Math.max(0, progress)) });
  }, []);

  useEffect(() => {
    window.sb79Figures = { setStep, steps: script.map((e) => e.id) };
    const onStep = (ev: Event) => {
      const d = (ev as CustomEvent<{ id: string; progress?: number }>).detail;
      setStep(d.id, d.progress ?? 1);
    };
    window.addEventListener('sb79:step', onStep);
    return () => {
      window.removeEventListener('sb79:step', onStep);
      delete window.sb79Figures;
    };
  }, [setStep]);

  const entry = scriptEntry(active.step);
  const caption = data?.[entry.figure].captions[entry.state];
  const show = (f: FigureId) => `figure-slot ${entry.figure === f ? 'is-active' : ''}`;

  return (
    <div className="figure-stage" data-step={entry.id} data-figure={entry.figure} data-state={entry.state} data-progress={active.progress} data-ready={Boolean(data)}>
      <div className="figure-frame">
        {error && <p className="fig-fallback">{error}</p>}
        {!data && !error && <p className="fig-fallback">Loading figures…</p>}
        {data && (
          <>
            <div className={show('map')}><MapFigure data={data.map} ref={refs.map} /></div>
            <div className={show('envelope')}>
              <Suspense fallback={<p className="fig-fallback">Loading the 3D figure…</p>}>
                <EnvelopeFigure data={data.envelope} ref={refs.envelope} />
              </Suspense>
            </div>
            <div className={show('checklist')}><Checklist data={data.checklist} ref={refs.checklist} /></div>
            <div className={show('timeline')}><Timeline data={data.timeline} ref={refs.timeline} /></div>
          </>
        )}
      </div>
      <p className="figure-caption">{caption ?? ' '}</p>
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel active={active} setStep={setStep} />
        </Suspense>
      )}
    </div>
  );
}
