/**
 * Timeline figure. The approval path with its optional SB 35 branch, then the
 * dated axis from SB 79's signing to the denial-presumption marker. Text and
 * dates come from figure-data.ts.
 */
import { useImperativeHandle, useState, type Ref } from 'react';
import type { FigureHandle, TimelineData } from './types';
import { timelineViews, type TimelineView } from './views';
import { shortDate } from '../format';

interface Props {
  data: TimelineData;
  ref?: Ref<FigureHandle>;
}

const views = timelineViews as Record<string, (p: number) => TimelineView>;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export default function Timeline({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'approval-path', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (!views[s]) throw new Error(`Timeline has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const v = views[state]!(progress);
  const path = data.path;
  const step = (i: number, n: number) => Math.min(1, Math.max(0, v.path * n - i));

  // Axis positions, with labels stacked into rows so close dates do not collide.
  const [d0, d1] = [day(data.start), day(data.end)];
  const rows: number[] = [];
  const events = data.events.map((e) => {
    const x = (100 * (day(e.date) - d0)) / (d1 - d0);
    let row = rows.findIndex((last) => x - last > 26);
    if (row < 0) row = rows.length;
    rows[row] = x;
    return { ...e, x, row };
  });

  return (
    <div className="timeline-figure" data-state={state}>
      <div className="tl-flow">
        <div className="tl-node tl-app" style={{ opacity: step(0, 4) }}>{path.application}</div>
        <div className="tl-links">
          <span className="tl-link" style={{ transform: `scaleY(${step(1, 4)})` }} />
          <span className="tl-elbow" style={{ clipPath: `inset(0 ${(1 - v.branch) * 100}% 0 0)` }} />
        </div>
        <div className="tl-row">
          <div className="tl-node" style={{ opacity: step(1, 4) }}>
            <strong>{path.local.title}</strong>
            <small>{path.local.sub}</small>
          </div>
          <div className="tl-node tl-branch" style={{ opacity: v.branch }}>
            <strong>{path.sb35.title}</strong>
            <small>{path.sb35.sub}</small>
          </div>
        </div>
        <div className="tl-links"><span className="tl-link" style={{ transform: `scaleY(${step(2, 4)})` }} /></div>
        <div className="tl-row">
          <div className="tl-node tl-haa" style={{ opacity: step(2, 4) }}>
            <strong>{path.haa.title}</strong>
            <small>{path.haa.sub}</small>
          </div>
          <div className="tl-node tl-presumption" style={{ opacity: v.marker, transform: `rotate(-1.5deg) scale(${1 + 0.25 * (1 - v.marker)})` }}>
            <strong>{path.presumption.title}</strong>
            <small>{path.presumption.sub}</small>
            <small className="tl-site">{path.site}</small>
          </div>
        </div>
      </div>

      <div className="tl-axis" style={{ ['--rows' as string]: rows.length }}>
        <span className="tl-axis-line" style={{ transform: `scaleX(${v.axis})` }} />
        {events.map((e) => {
          const shown = e.kind === 'presumption' ? v.marker : v.axis >= e.x / 100 ? 1 : 0;
          return (
            <div key={e.date} className={`tl-event tl-${e.kind}`} style={{ left: `${e.x}%`, opacity: shown, ['--row' as string]: e.row }}>
              <span className="tl-tick" />
              <span className="tl-event-text">
                <strong>{shortDate(e.date)}</strong>
                {e.label}
                {e.sub && <small>{e.sub}</small>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
