/**
 * Checklist figure. The project conditions as cards that tick, fail, or turn
 * gray, plus the affordability split as squares (one per percent of units).
 * Card text and statuses come from figure-data.ts.
 */
import { memo, useImperativeHandle, useState, type Ref } from 'react';
import type { ChecklistData, FigureHandle } from './types';
import { checklistView } from './views';
import { num } from '../format';

interface Props {
  data: ChecklistData;
  ref?: Ref<FigureHandle>;
}

const MARK = { tick: '✓', fail: '✕', gray: '–', pending: '' } as const;

function Checklist({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'conditions-tick', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (s !== 'conditions-tick') throw new Error(`Checklist has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const view = checklistView(state, progress, data.cards.map((c) => c.status));
  const a = data.affordability;

  return (
    <div className="checklist-figure" data-state={state}>
      <p className="fig-title">{data.title}</p>
      <ol className="cl-cards">
        {data.cards.map((c, i) => {
          // Tick (stamp), gray out, or fail: the card resolves as t runs 0..1.
          const t = view.cards[i] ?? 0;
          const status = t > 0 ? c.status : 'pending';
          return (
            <li key={c.id} className={`cl-card cl-${status}`} data-status={t >= 1 ? c.status : 'pending'} style={{ ['--t' as string]: t }}>
              <span className="cl-mark" aria-label={status} style={{ opacity: status === 'pending' ? 1 : t, transform: c.status === 'tick' ? `scale(${1 + 0.35 * (1 - t)})` : undefined }}>{MARK[status]}</span>
              <div className="cl-body">
                <strong>{c.title}</strong>
                <span>{c.text}</span>
                {c.note && status !== 'pending' && <span className="cl-note">{c.note}</span>}
              </div>
              <cite>{c.cite}</cite>
            </li>
          );
        })}
      </ol>
      <div className="cl-afford">
        <p className="fig-subtitle">{a.title}</p>
        {a.rows.map((r) => (
          <div key={r.label} className="cl-row">
            <span className="cl-row-label">{r.label}</span>
            <Squares percent={r.percent} deeper={r.deeper?.percent ?? 0} t={view.tint} />
            <span className="cl-row-pct">{num(r.percent)}%</span>
          </div>
        ))}
        <p className="cl-note">
          {a.note}
          {a.rows.filter((r) => r.deeper).map((r) => ` Darker: ${r.deeper!.label}, ${num(r.deeper!.percent)}% of units.`)}
        </p>
      </div>
    </div>
  );
}

/** One hundred squares, one per percent of units; the first `percent` tint as `t` runs 0..1. */
function Squares({ percent, deeper, t }: { percent: number; deeper: number; t: number }) {
  const lit = Math.round(percent * t);
  return (
    <svg className="cl-squares" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 100 }, (_, i) => {
        const col = Math.floor(i / 2), row = i % 2;
        const cls = i < Math.round(deeper * t) ? 'sq sq-deep' : i < lit ? 'sq sq-on' : 'sq';
        return <rect key={i} x={col * 2 + 0.15} y={row * 5 + 0.4} width={1.7} height={4.2} className={cls} />;
      })}
    </svg>
  );
}

/** Re-renders only for its own state: the stage updates on every frame of every figure. */
export default memo(Checklist);
