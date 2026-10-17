/**
 * Map figure (2D, SVG): one continuous zoom from California to a parcel. Every
 * layer is drawn at build time (figure-data.ts) in one frame, feet in
 * EPSG:2227; a state moves the camera between viewBoxes (smoothZoom) and sets
 * each layer's opacity or draw-on progress from the view.
 *
 * Text, marks, and some stroke widths are sized in screen pixels via `u`
 * (frame units per pixel), so they read the same at every zoom.
 */
import { memo, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import type { FigureHandle, Label, LegendItem, MapData, XY } from './types';
import { IMPLEMENTED, mapView, smoothZoom, type MapLegend, type MapView } from './views';
import { useSize } from './hooks';
import { num } from '../format';

interface Props {
  data: MapData;
  ref?: Ref<FigureHandle>;
}

function MapFigure({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'california', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (!(IMPLEMENTED.map as readonly string[]).includes(s)) throw new Error(`MapFigure has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const view = mapView(state, progress);
  const wrap = useRef<HTMLDivElement>(null);
  const size = useSize(wrap);

  return (
    <div ref={wrap} className="map-figure" data-state={state}>
      <World data={data} view={view} size={size} />
      {view.legendFrom && view.legendIn < 1 && <Legend data={data} view={view} which={view.legendFrom} opacity={1 - view.legendIn} />}
      {view.legend && view.legendIn > 0 && <Legend data={data} view={view} which={view.legend} opacity={view.legendIn} />}
      {view.population > 0 && (
        <div className="fig-badge" style={{ opacity: view.population }}>
          <strong>{data.population.title}</strong>
          {data.population.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

type Size = { width: number; height: number };
/** Frame units per screen pixel for a viewBox shown with "meet". */
const perPx = (w: number, h: number, size: Size) => (size.width && size.height ? Math.max(w / size.width, h / size.height) : w / 600);
const layer = (opacity: number) => ({ opacity, visibility: opacity > 0.001 ? ('visible' as const) : ('hidden' as const) });
/** Draw: trace on. pathLength-based dashes need user-space strokes (see .map-draw in figures.css). */
const draw = (t: number) => ({ pathLength: 1, strokeDasharray: '1 1', strokeDashoffset: 1 - t });

/**
 * Text in screen pixels, placed in the frame. The scale transform keeps the
 * font size small: browsers cap very large font sizes, and at California's
 * scale a 12 px label would be tens of thousands of frame units tall.
 */
function Text({ at, u, size = 12, children, anchor = 'middle', weight, className, dy = 0, dx = 0, opacity = 1 }: {
  at: XY; u: number; size?: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; weight?: number; className?: string; dy?: number; dx?: number; opacity?: number;
}) {
  return (
    <text
      transform={`translate(${at[0]} ${at[1]}) scale(${u})`} x={dx} y={dy} fontSize={size} textAnchor={anchor} fontWeight={weight}
      strokeWidth={3} className={`fig-text ${className ?? ''}`} opacity={opacity}
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

/** A label off to one side, with a leader line, in screen pixels. */
function Callout({ at, u, dx, dy, text, sub, opacity, anchor }: { at: XY; u: number; dx: number; dy: number; text: string; sub?: string; opacity: number; anchor: 'start' | 'end' }) {
  if (opacity <= 0) return null;
  const end: XY = [at[0] + dx * u, at[1] + dy * u];
  return (
    <g opacity={opacity}>
      <line x1={at[0]} y1={at[1]} x2={end[0]} y2={end[1]} className="fig-leader" strokeWidth={1} />
      <Text at={end} u={u} anchor={anchor} dx={anchor === 'end' ? -4 : 4} dy={4} size={12} weight={600}>{text}</Text>
      {sub && <Text at={end} u={u} anchor={anchor} dx={anchor === 'end' ? -4 : 4} dy={19} size={10.5} className="fig-text-soft">{sub}</Text>}
    </g>
  );
}

function World({ data, view, size }: { data: MapData; view: MapView; size: Size }) {
  const box = smoothZoom(data.views[view.box[0]], data.views[view.box[1]], view.zoom);
  const u = perPx(box[2], box[3], size);
  const ids = { hatch: useId(), dots: useId(), cross: useId() };
  const ca = data.california;
  const utc = ca.counties.filter((c) => c.utc);
  const [mx, my] = [(data.measure.from[0] + data.measure.to[0]) / 2, (data.measure.from[1] + data.measure.to[1]) / 2];
  const hz = data.hazards;

  return (
    <svg className="map-layer" viewBox={box.join(' ')} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={ids.hatch} width={6 * u} height={6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6 * u} className="fig-hatch" strokeWidth={1.6} />
        </pattern>
        <pattern id={ids.dots} width={6 * u} height={6 * u} patternUnits="userSpaceOnUse">
          <circle cx={3 * u} cy={3 * u} r={1.2 * u} className="fig-dot" />
        </pattern>
        <pattern id={ids.cross} width={6 * u} height={6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6 * u} className="fig-hatch-ink" strokeWidth={1.2} />
          <line x1={0} y1={0} x2={6 * u} y2={0} className="fig-hatch-ink" strokeWidth={1.2} />
        </pattern>
      </defs>

      {/* California: counties, the urban transit counties filling in one by one */}
      <g style={layer(view.ca)}>
        {ca.counties.map((c) => <path key={c.name} d={c.d} className="ca-county" />)}
        {utc.map((c, i) => {
          const t = Math.min(1, Math.max(0, view.utc * utc.length - i));
          return t > 0 && <path key={c.name} d={c.d} className="ca-utc" opacity={t * view.utcAlpha} />;
        })}
        {ca.counties.filter((c) => c.name === ca.labels.alameda.text).map((c) => (
          <path key="alameda" d={c.d} className="ca-alameda" strokeWidth={2.5} opacity={view.alameda} />
        ))}
        <g opacity={view.orange}>
          {ca.counties.filter((c) => c.openIssue).map((c) => <path key={c.name} d={c.d} className="ca-open-issue" strokeWidth={1.6} strokeDasharray="4 3" />)}
        </g>
      </g>
      <Callout at={ca.labels.alameda.at} u={u} dx={-90} dy={40} text={ca.labels.alameda.text} opacity={view.alameda * (1 - view.altLabels)} anchor="end" />
      <Callout at={ca.labels.orange.at} u={u} dx={60} dy={26} text={`${ca.labels.orange.text}: ${ca.labels.orange.sub}`} opacity={view.orange} anchor="start" />

      {/* Cities with an alternative plan HCD has ruled on: grayed */}
      <g style={layer(view.alt)}>
        {data.altPlans.map((a) => <path key={a.name} d={a.d} className="map-alt" />)}
      </g>
      {data.altPlans.map((a, i) => (
        <g key={a.name} opacity={view.altLabels}>
          <circle cx={a.at[0]} cy={a.at[1]} r={9 * u} className="map-alt-ring" strokeWidth={1.4} />
          <Callout at={a.at} u={u} dx={-70} dy={i === 0 ? -40 : 40} text={a.name} opacity={1} anchor="end" />
        </g>
      ))}

      {/* San Francisco's SB 79 zones, drawn, then grayed under its alternative plan */}
      <g style={layer(view.sfZones)}>
        {data.sf.zones.map((z) => (
          <path key={`${z.tier}${z.band}`} d={z.d} className={`map-draw sf-tier${z.tier}`} strokeWidth={1.3 * u} fill="none" {...draw(view.sfZones)} />
        ))}
        {data.sf.zones.filter((z) => z.band === 'Half Mile').map((z) => (
          <path key={`fill${z.tier}`} d={z.d} className="sf-zone-fill" opacity={view.sfGray} />
        ))}
      </g>

      {/* Berkeley and its BART stations */}
      <g style={layer(view.berkeley)}>
        <path d={data.berkeley.d} className="map-city" strokeWidth={1.6} />
      </g>
      <g style={layer(view.bartStations)}>
        {data.berkeley.stations.map((s) => (
          <g key={s.name}>
            <circle cx={s.at[0]} cy={s.at[1]} r={5 * u} className="map-station" strokeWidth={1.6} />
            <Text at={s.at} u={u} anchor="start" dx={9} dy={4} size={11}>{`${s.name} BART`}</Text>
          </g>
        ))}
      </g>

      {/* North Berkeley: the parcel fabric and each map-shaped requirement */}
      <g style={layer(view.parcels)}>
        <path d={data.parcels} className="map-parcel" />
      </g>
      <g style={layer(view.opportunity)}>
        <path d={data.opportunity.highest} className="opp-highest" />
        <path d={data.opportunity.high} className="opp-high" />
        <path d={data.opportunity.other} className="opp-other" />
      </g>
      <g style={layer(view.zoning)}>
        {data.zoning.map((z) => (
          <path key={z.district} d={z.d} className={`zone-${z.cls}`} style={z.cls === 'commercial' ? { fill: `url(#${ids.dots})` } : undefined} />
        ))}
        {data.zoning.filter((z) => z.cls === 'commercial').map((z) => <path key={`base${z.district}`} d={z.d} className="zone-commercial-base" />)}
      </g>
      <g style={layer(view.zoningLabels)}>
        {data.zoning.map((z) => (
          <g key={z.district}>
            <Text at={z.label.at} u={u} size={12} weight={700}>{z.label.text}</Text>
            <Text at={z.label.at} u={u} size={10.5} dy={13} className="fig-text-soft">{z.label.sub}</Text>
          </g>
        ))}
      </g>
      <g style={layer(view.bart)}>
        <path d={data.bart.d} className="map-bart-land" />
        <path d={data.bart.d} fill={`url(#${ids.hatch})`} className="map-bart-hatch" />
        <Callout at={data.bart.label.at} u={u} dx={110} dy={-70} text={data.bart.label.text} sub={data.bart.label.sub} opacity={1} anchor="start" />
      </g>
      <g style={layer(view.rent)}>
        <path d={data.rent.unknown} className="map-rent-unknown" />
        <path d={data.rent.estimate} className="map-rent" />
        <path d={data.rent.estimate} fill={`url(#${ids.cross})`} className="map-rent-cross" />
      </g>
      <g style={layer(view.historic)}>
        <path d={data.historic.merit} className="map-merit" />
        <path d={data.historic.landmark} className="map-landmark" />
      </g>
      <g style={layer(view.pick)}>
        <path d={data.pick.flagged} className="map-flagged" />
        <path d={data.pick.clear} className="map-clear" />
      </g>

      {/* MTC's zones, the track, the station, access points, the example lot, the measuring line */}
      <g opacity={view.rings > 0 ? 1 : 0}>
        <path d={data.zones.adjacent} className="map-ring map-draw" strokeWidth={1.4 * u} {...draw(view.rings)} />
        <path d={data.zones.quarter} className="map-ring map-draw" strokeWidth={1.4 * u} {...draw(view.rings)} />
        <path d={data.zones.half} className="map-ring map-draw" strokeWidth={1.4 * u} {...draw(view.rings)} />
      </g>
      <g opacity={view.ringLabels}>
        {data.ringLabels.map((l) => <Text key={l.text} at={l.at} u={u} size={12} dy={4} anchor="end" className="fig-text-accent" weight={600}>{`${l.text} `}</Text>)}
      </g>
      <path d={data.rail} className="map-rail" strokeWidth={1.8} strokeDasharray="5 3" style={layer(view.rail)} />
      <g style={layer(view.station)}>
        <circle cx={data.station.at[0]} cy={data.station.at[1]} r={7 * u} className="map-station" strokeWidth={1.6} />
        <Text at={data.station.at} u={u} anchor="end" dy={-10} size={13} weight={600}>{data.station.name}</Text>
      </g>
      <Stamp label={data.tierStamp} u={u} t={view.tier} />
      <g style={layer(view.accessPoints)}>
        {data.accessPoints.map((a, i) => (
          <rect
            key={i} x={a.at[0] - 3.5 * u} y={a.at[1] - 3.5 * u} width={7 * u} height={7 * u}
            className={a.elevator ? 'map-ap map-ap-elevator' : 'map-ap'} strokeWidth={1.4} opacity={a.primary ? 1 : 0.55}
            transform={`rotate(45 ${a.at[0]} ${a.at[1]})`}
          />
        ))}
      </g>
      <g style={layer(Math.max(view.site, view.pickSite))}>
        <path d={data.site.d} className="map-site map-site-b" strokeWidth={2} />
        <Text at={data.site.at} u={u} size={13} dy={-12} weight={600} opacity={1 - view.pickSite}>{data.site.label}</Text>
      </g>
      <g opacity={view.measure > 0 ? 1 : 0}>
        <line x1={data.measure.from[0]} y1={data.measure.from[1]} x2={data.measure.to[0]} y2={data.measure.to[1]} className="map-measure map-draw" strokeWidth={1.6 * u} {...draw(view.measure)} />
        <circle cx={data.measure.from[0]} cy={data.measure.from[1]} r={2.5 * u} className="map-measure-end" />
        <Text at={[mx, my]} u={u} size={12} anchor="start" dy={4} weight={600} opacity={view.measure < 1 ? 0 : 1}>{`  ${data.measure.label}`}</Text>
      </g>

      {/* Fire and airport: what does not reach the half mile */}
      <g opacity={view.fire > 0 ? 1 : 0}>
        <circle cx={hz.fire.at[0]} cy={hz.fire.at[1]} r={hz.fire.r} className="map-fire map-draw" strokeWidth={1.6 * u} {...draw(view.fire)} />
        <Text at={[hz.fire.at[0], hz.fire.at[1] - hz.fire.r]} u={u} size={12} dy={-8} weight={600} opacity={view.fire < 1 ? 0 : 1}>{hz.fire.label}</Text>
      </g>
      <g opacity={view.airport}>
        <line x1={hz.airport.from[0]} y1={hz.airport.from[1]} x2={hz.airport.to[0]} y2={hz.airport.to[1]} className="map-airport" strokeWidth={1.6} />
        <path d={`M ${hz.airport.to[0] - 6 * u} ${hz.airport.to[1] - 10 * u} L ${hz.airport.to[0]} ${hz.airport.to[1]} L ${hz.airport.to[0] + 6 * u} ${hz.airport.to[1] - 10 * u}`} className="map-airport" strokeWidth={1.6} fill="none" />
        <Text at={hz.airport.to} u={u} anchor="start" dx={10} dy={-6} size={12} weight={600}>{hz.airport.label}</Text>
      </g>

      <Stamp label={data.sf.stamp} u={u} t={view.sfStamp} />
      <Stamp label={data.berkeley.stamp} u={u} t={view.noExclusions} />
      {view.pickSite > 0 && (
        <Callout at={data.pick.label.at} u={u} dx={90} dy={-80} text={data.pick.label.text} sub={data.pick.label.sub} opacity={view.pickSite} anchor="start" />
      )}
    </svg>
  );
}

function Swatch({ item }: { item: LegendItem }) {
  const id = useId();
  if (item.swatch.startsWith('legend-')) return <span className={item.swatch} />;
  return (
    <svg width="14" height="14" className="fig-swatch" aria-hidden>
      {item.pattern === 'hatch' && (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="fig-hatch" strokeWidth="1.4" />
        </pattern>
      )}
      {item.pattern === 'dots' && (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" className="fig-dot" />
        </pattern>
      )}
      {item.pattern === 'cross' && (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="fig-hatch-ink" strokeWidth="1" />
          <line x1="0" y1="0" x2="4" y2="0" className="fig-hatch-ink" strokeWidth="1" />
        </pattern>
      )}
      <rect x="1" y="1" width="12" height="12" className={item.swatch} />
      {item.pattern && <rect x="1" y="1" width="12" height="12" fill={`url(#${id})`} className="fig-swatch-pattern" />}
    </svg>
  );
}

function Legend({ data, view, which, opacity }: { data: MapData; view: MapView; which: MapLegend; opacity: number }) {
  const items = data.legends[which] ?? [];
  const utc = data.california.counties.filter((c) => c.utc).length;
  return (
    <ul className="fig-legend" style={{ opacity }}>
      {items.map((item, i) => (
        <li key={item.text} style={which === 'counties' && i === 1 ? { opacity: view.orange } : undefined}>
          <Swatch item={item} />
          {which === 'counties' && i === 0 && <strong className="fig-count">{num(Math.min(utc, Math.ceil(view.utc * utc - 1e-9)))}</strong>}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/** Re-renders only for its own state: the stage updates on every frame of every figure. */
export default memo(MapFigure);
