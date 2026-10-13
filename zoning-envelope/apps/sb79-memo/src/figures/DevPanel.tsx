/**
 * Development only (FigureStage loads it when import.meta.env.DEV): every
 * state in src/script.ts, in memo order. A click scrolls to that paragraph
 * with its state settled (progress 1), through the scroll engine; the slider
 * scrubs progress without scrolling. Keys: "[" and "]" step back and forward.
 */
import { useEffect, useState } from 'react';
import { script } from '../script';
import { IMPLEMENTED } from './views';
import type { Active } from './FigureStage';

export default function DevPanel({ active, setStep, scrollTo }: {
  active: Active;
  setStep: (id: string, progress: number) => void;
  scrollTo: (id: string, progress?: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const index = script.findIndex((e) => e.id === active.step);

  const jump = (i: number) => {
    const e = script[(i + script.length) % script.length]!;
    scrollTo(e.id, 1);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      if (ev.key === ']') jump(index + 1);
      if (ev.key === '[') jump(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <aside className={`dev-panel ${open ? '' : 'is-closed'}`} aria-label="Figure states (development)">
      <header>
        <strong>Figure states</strong>
        <button type="button" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
      </header>
      {open && (
        <>
          <ol>
            {script.map((e, i) => {
              const ok = (IMPLEMENTED[e.figure] as readonly string[]).includes(e.state);
              return (
                <li key={e.id}>
                  <button type="button" data-dev-step={e.id} aria-current={i === index ? 'step' : undefined} onClick={() => jump(i)} className={ok ? '' : 'is-missing'}>
                    <span className="dev-section">{e.section}</span>
                    <code>{e.figure} · {e.state}{ok ? '' : ' (missing)'}</code>
                  </button>
                </li>
              );
            })}
          </ol>
          <label className="dev-progress">
            progress <output>{active.progress.toFixed(2)}</output>
            <input type="range" min={0} max={1} step={0.01} value={active.progress} onChange={(ev) => setStep(active.step, Number(ev.target.value))} />
          </label>
        </>
      )}
    </aside>
  );
}
