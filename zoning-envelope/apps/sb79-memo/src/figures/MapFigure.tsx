/**
 * Map figure (2D, SVG). California counties, the North Berkeley block, the
 * city, and the Bay Area. Paths are drawn with d3-geo at build time
 * (figure-data.ts); this component places layers and sets their opacity and
 * draw-on progress from the view for the current state.
 *
 * Local scenes share one SVG in feet; a state picks a viewBox. Text, marks,
 * and stroke widths are sized in screen pixels via `u` (feet per pixel).
 */
import { useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import type { FigureHandle, Label, MapData, XY } from './types';
import { mapViews, type MapView } from './views';
import { useSize } from './hooks';

interface Props {
  data: MapData;
  ref?: Ref<FigureHandle>;
}

const views = mapViews as Record<string, (p: number) => MapView>;

export default function MapFigure({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'transit-counties', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (!views[s]) throw new Error(`MapFigure has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const view = views[state]!(progress);
  const wrap = useRef<HTMLDivElement>(null);
  const size = useSize(wrap);

  return (
    <div ref={wrap} className="map-figure" data-state={state}>
      <California data={data.california} view={view} size={size} />
      <Local data={data.local} view={view} size={size} />
      <Legend data={data} view={view} />
      {view.population > 0 && (
        <div className="fig-badge" style={{ opacity: view.population }}>
          <strong>{data.local.population.title}</strong>
          {data.local.population.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

type Size = { width: number; height: number };
/** Feet (or viewBox units) per screen pixel for a viewBox shown with "meet". */
const perPx = (w: number, h: number, size: Size) => (size.width && size.height ? Math.max(w / size.width, h / size.height) : w / 600);

function Text({ at, u, size = 12, children, anchor = 'middle', weight, className, dy = 0, opacity = 1 }: {
  at: XY; u: number; size?: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; weight?: number; className?: string; dy?: number; opacity?: number;
}) {
  return (
    <text
      x={at[0]} y={at[1] + dy * u} fontSize={size * u} textAnchor={anchor} fontWeight={weight}
      strokeWidth={3 * u} className={`fig-text ${className ?? ''}`} opacity={opacity}
    >
      {children}
    </text>
  );
}

/** A seal-like label that settles onto the figure (motion grammar: stamp). */
function Stamp({ label, u, t, tone = 'accent' }: { label: Label; u: number; t: number; tone?: 'accent' | 'collapse' }) {
  if (t <= 0) return null;
  const fs = 15, sub = 10.5;
  const w = Math.max(label.text.length * fs * 0.62, (label.sub?.length ?? 0) * sub * 0.56) + 22;
  const h = label.sub ? 46 : 30;
  const s = 1 + 0.35 * (1 - t);
  return (
    <g transform={`translate(${label.at[0]} ${label.at[1]}) scale(${u * s}) rotate(-4)`} opacity={t} className={`fig-stamp fig-stamp-${tone}`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} />
      <rect x={-w / 2 + 3} y={-h / 2 + 3} width={w - 6} height={h - 6} rx={2} className="fig-stamp-inner" />
      <text y={label.sub ? -4 : 5} fontSize={fs} textAnchor="middle" className="fig-stamp-text">{label.text}</text>
      {label.sub && <text y={13} fontSize={sub} textAnchor="middle" className="fig-stamp-sub">{label.sub}</text>}
    </g>
  );
}

function California({ data, view, size }: { data: MapData['california']; view: MapView; size: Size }) {
  const on = view.scene === 'california';
  const [w, h] = data.size;
  const u = perPx(w, h, size);
  return (
    <svg className="map-layer" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>
      <g className="ca-counties">
        {data.counties.map((c) => (
          <path key={c.name} d={c.d} className="ca-county" />
        ))}
      </g>
      <g opacity={view.utc}>
        {data.counties.filter((c) => c.utc).map((c) => <path key={c.name} d={c.d} className="ca-utc" />)}
      </g>
      {data.counties.filter((c) => c.name === data.labels.alameda.text).map((c) => (
        <path key="alameda" d={c.d} className="ca-alameda" strokeWidth={2.5} opacity={view.alameda} />
      ))}
      <g opacity={view.orange}>
        {data.counties.filter((c) => c.openIssue).map((c) => <path key={c.name} d={c.d} className="ca-open-issue" strokeWidth={1.6} strokeDasharray="4 3" />)}
        <line x1={data.labels.orange.at[0]} y1={data.labels.orange.at[1]} x2={data.labels.orange.at[0] + 60} y2={data.labels.orange.at[1] + 22} className="fig-leader" strokeWidth={1} />
        <Text at={[data.labels.orange.at[0] + 64, data.labels.orange.at[1] + 26]} u={u} anchor="start" className="fig-text-soft">{`${data.labels.orange.text}: ${data.labels.orange.sub}`}</Text>
      </g>
      <g opacity={view.alameda}>
        <line x1={data.labels.alameda.at[0]} y1={data.labels.alameda.at[1]} x2={data.labels.alameda.at[0] - 90} y2={data.labels.alameda.at[1] + 40} className="fig-leader" strokeWidth={1} />
        <Text at={[data.labels.alameda.at[0] - 94, data.labels.alameda.at[1] + 44]} u={u} anchor="end" weight={600} size={13}>{data.labels.alameda.text}</Text>
      </g>
    </svg>
  );
}

function Local({ data, view, size }: { data: MapData['local']; view: MapView; size: Size }) {
  const on = view.scene === 'local';
  const box = data.views[view.box];
  const u = perPx(box[2], box[3], size);
  const ap = data.accessPoints;
  const draw = (t: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - t });
  const [mx, my] = [(data.measure.from[0] + data.measure.to[0]) / 2, (data.measure.from[1] + data.measure.to[1]) / 2];
  return (
    <svg className="map-layer" viewBox={box.join(' ')} preserveAspectRatio="xMidYMid meet" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>
      <defs>
        <pattern id="map-hatch" width={6 * u} height={6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6 * u} className="fig-hatch" strokeWidth={1.6} />
        </pattern>
        <pattern id="map-dots" width={6 * u} height={6 * u} patternUnits="userSpaceOnUse">
          <circle cx={3 * u} cy={3 * u} r={1.3 * u} className="fig-dot" />
        </pattern>
      </defs>

      {/* Land (county shoreline) under the city and Bay Area views */}
      <path d={data.land} className="map-land" opacity={Math.max(view.berkeley, view.bay)} />

      {/* Bay Area jurisdictions, clipped to land */}
      <g opacity={view.bay}>
        {data.jurisdictions.map((j) => (
          <path
            key={j.name} d={j.d} className={`bay-city bay-${j.status ?? 'none'}`}
            style={j.status === 'exclusions' ? { fill: 'url(#map-hatch)' } : j.status === 'alternative-plan' ? { fill: 'url(#map-dots)' } : undefined}
          />
        ))}
        {data.bayLabels.map((l) => <Text key={l.text} at={l.at} u={u} size={13} weight={600}>{l.text}</Text>)}
      </g>

      {/* Parcels, then the eligibility tint over them */}
      <g opacity={view.parcels}>
        <path d={`${data.parcels.eligible}${data.parcels.bart}${data.parcels.notQualifying}${data.parcels.outside}`} className="map-parcel" />
        <g opacity={view.tint}>
          <path d={data.parcels.eligible} className="map-eligible" />
          <path d={data.parcels.notQualifying} className="map-not-qualifying" />
          <path d={data.parcels.bart} className="map-eligible" />
          <path d={data.parcels.bart} fill="url(#map-hatch)" className="map-bart" />
        </g>
      </g>

      {/* Berkeley, at city scale */}
      <g opacity={view.berkeley}>
        <path d={data.berkeley.d} className="map-city" strokeWidth={1.6} />
      </g>

      {/* MTC's zones */}
      <path d={data.zones.half} className="map-outer-fill" opacity={view.outerFill} fillRule="evenodd" />
      <g opacity={view.rings > 0 ? 1 : 0}>
        <path d={data.zones.adjacent} className="map-ring" strokeWidth={1.4} {...draw(view.rings)} />
        <path d={data.zones.quarter} className="map-ring" strokeWidth={1.4} {...draw(view.rings)} />
        <path d={data.zones.half} className="map-ring" strokeWidth={1.4} {...draw(view.rings)} />
      </g>
      <g opacity={view.ringLabels}>
        {data.ringLabels.map((l) => <Text key={l.text} at={l.at} u={u} size={12} dy={4} anchor="end" className="fig-text-accent" weight={600}>{`${l.text} `}</Text>)}
      </g>

      {/* Tracks and stations */}
      <path d={data.rail} className="map-rail" strokeWidth={1.8} strokeDasharray="5 3" opacity={view.rail} />
      <g opacity={view.stations}>
        {data.stations.map((s) => (
          <g key={s.name}>
            <circle cx={s.at[0]} cy={s.at[1]} r={(s.primary ? 7 : 5) * u} className="map-station" strokeWidth={1.6} />
            <Text at={s.at} u={u} anchor="end" dy={-10} size={s.primary ? 13 : 11} weight={s.primary ? 600 : 400} className={s.primary ? '' : 'fig-text-soft'}>{`${s.name} BART`}</Text>
          </g>
        ))}
      </g>
      <Stamp label={data.tierStamp} u={u} t={view.tier} />

      {/* Access points: filled, or hollow for an elevator entrance */}
      <g opacity={view.accessPoints}>
        {ap.map((a, i) => (
          <rect
            key={i} x={a.at[0] - 3.5 * u} y={a.at[1] - 3.5 * u} width={7 * u} height={7 * u}
            className={a.elevator ? 'map-ap map-ap-elevator' : 'map-ap'} strokeWidth={1.4} opacity={a.primary ? 1 : 0.55}
            transform={`rotate(45 ${a.at[0]} ${a.at[1]})`}
          />
        ))}
      </g>

      {/* Exhibit sites */}
      <g opacity={view.site}>
        {data.sites.map((s) => (
          <g key={s.key}>
            <path d={s.d} className={s.key === 'B' ? 'map-site map-site-b' : 'map-site'} strokeWidth={s.key === 'B' ? 2 : 1.3} />
            <Text at={s.at} u={u} size={s.key === 'B' ? 13 : 11} dy={-12} weight={600}>{s.label}</Text>
          </g>
        ))}
      </g>

      {/* The measuring line, parcel edge to access point */}
      <g opacity={view.measure > 0 ? 1 : 0}>
        <line x1={data.measure.from[0]} y1={data.measure.from[1]} x2={data.measure.to[0]} y2={data.measure.to[1]} className="map-measure" strokeWidth={1.6} {...draw(view.measure)} />
        <circle cx={data.measure.from[0]} cy={data.measure.from[1]} r={2.5 * u} className="map-measure-end" />
        <Text at={[mx, my]} u={u} size={12} anchor="start" dy={4} weight={600} opacity={view.measure < 1 ? 0 : 1}>{`  ${data.measure.label}`}</Text>
      </g>

      <Stamp label={data.berkeley.stamp} u={u} t={view.stamp} />
    </svg>
  );
}

function Swatch({ className, pattern }: { className: string; pattern?: 'hatch' | 'dots' }) {
  const id = useId();
  return (
    <svg width="14" height="14" className="fig-swatch" aria-hidden>
      {pattern === 'hatch' && (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="fig-hatch" strokeWidth="1.4" />
        </pattern>
      )}
      {pattern === 'dots' && (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" className="fig-dot" />
        </pattern>
      )}
      <rect x="1" y="1" width="12" height="12" className={className} />
      {pattern && <rect x="1" y="1" width="12" height="12" fill={`url(#${id})`} className="fig-swatch-pattern" />}
    </svg>
  );
}

function Legend({ data, view }: { data: MapData; view: MapView }) {
  const l = data.local;
  if (view.legend === 'counties') {
    return (
      <ul className="fig-legend" style={{ opacity: Math.max(view.utc, 0.001) }}>
        <li><Swatch className="ca-utc" />{data.california.legend.utc}</li>
        <li style={{ opacity: view.orange }}><Swatch className="ca-open-issue legend-dashed" />{data.california.legend.openIssue}</li>
      </ul>
    );
  }
  if (view.legend === 'distance') {
    return (
      <ul className="fig-legend">
        <li style={{ opacity: view.accessPoints }}><span className="legend-ap" />Station entrance (MTC)</li>
        <li style={{ opacity: view.accessPoints }}><span className="legend-ap legend-ap-elevator" />Elevator entrance</li>
        <li style={{ opacity: view.rings }}><span className="legend-ring" />MTC SB 79 zones</li>
      </ul>
    );
  }
  if (view.legend === 'eligibility') {
    return (
      <ul className="fig-legend" style={{ opacity: Math.max(view.tint, 0.001) }}>
        <li><Swatch className="map-eligible" />{l.eligibility.eligible}</li>
        <li><Swatch className="map-not-qualifying" />{l.eligibility.notQualifying}</li>
        <li><Swatch className="map-eligible" pattern="hatch" />{l.eligibility.bart}</li>
        <li><Swatch className="map-parcel" />{l.eligibility.outside}</li>
      </ul>
    );
  }
  if (view.legend === 'bay') {
    return (
      <ul className="fig-legend" style={{ opacity: Math.max(view.bay, 0.001) }}>
        <li><Swatch className="bay-defaults" />{l.bayLegend.defaults}</li>
        <li><Swatch className="bay-swatch-blank" pattern="hatch" />{l.bayLegend.exclusions}</li>
        <li><Swatch className="bay-swatch-blank" pattern="dots" />{l.bayLegend.alternativePlan}</li>
      </ul>
    );
  }
  return null;
}
