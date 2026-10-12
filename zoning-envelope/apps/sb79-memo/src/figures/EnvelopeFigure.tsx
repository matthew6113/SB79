/**
 * Envelope figure (3D, react-three-fiber). Exhibit B and its neighbors in a
 * quiet three-quarter view: the pale ghost (local zoning), the SB 79
 * envelope, floor plates, unit dots, the setback, the collapse; then the
 * Rockridge contrast and the three exhibits side by side.
 *
 * Geometry comes from figure-data.ts (@zoning-envelope/engine in local feet);
 * heights and labels from the figure data. Prisms are built at unit depth and
 * scaled, so a state change never rebuilds geometry.
 */
import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { EnvelopeData, FigureHandle, XY } from './types';
import { envelopeViews, type EnvelopeScene, type EnvelopeView } from './views';
import { useTokens } from './hooks';
import { num } from '../format';

interface Props {
  data: EnvelopeData;
  ref?: Ref<FigureHandle>;
}

type Tokens = Record<string, string>;
const views = envelopeViews as Record<string, (p: number, b: EnvelopeData['block']) => EnvelopeView>;
/** Local (x east, y north, height) to three.js (x, up, -north). */
const w3 = (x: number, y: number, h = 0): [number, number, number] => [x, h, -y];

export default function EnvelopeFigure({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'ghost', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (!views[s]) throw new Error(`EnvelopeFigure has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const view = views[state]!(progress, data.block);
  const tokens = useTokens();
  const b = data.block;
  const shownArea = Math.min(view.floorArea, b.residentialFloorAreaSqFt);
  const labels = useMemo(() => sceneLabels(data, view), [data, view]);
  const [screen, setScreen] = useState<Record<string, Projected | null>>({});
  const onProject = useCallback((xy: Record<string, Projected | null>) => setScreen(xy), []);

  return (
    <div className="envelope-figure" data-state={state}>
      {tokens && (
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 26, near: 5, far: 6000, position: [300, 200, 300] }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          fallback={<p className="fig-fallback">This figure needs WebGL.</p>}
        >
          <ambientLight intensity={2.2} />
          <directionalLight position={[-200, 400, 250]} intensity={1.5} />
          <CameraRig data={data} scene={view.scene} />
          <Projector anchors={labels} scene={view.scene} onProject={onProject} />
          {view.scene === 'block' && <Block data={data} view={view} t={tokens} />}
          {view.scene === 'rockridge' && <Rockridge data={data} view={view} t={tokens} />}
          {view.scene === 'exhibits' && <Exhibits data={data} view={view} t={tokens} />}
        </Canvas>
      )}

      {/* Labels and readouts (HTML, so they keep the memo's type) */}
      <div className="env-labels" aria-hidden>
        {labels.map((l) => {
          const xy = screen[l.id];
          return xy && (
            // Wrap within the room to the right edge; flip left only when there is almost none.
            <div
              key={l.id}
              className={`env-label ${l.className ?? ''} ${xy[2] < 110 && !/center|stamp/.test(l.className ?? '') ? 'is-flipped' : ''}`}
              style={{ left: xy[0], top: xy[1], opacity: l.opacity, maxWidth: xy[2] >= 110 ? xy[2] - 14 : undefined }}
            >
              {l.text}
              {l.sub && <small>{l.sub}</small>}
            </div>
          );
        })}
      </div>
      {view.units > 0 && view.scene === 'block' && (
        <div className="fig-counter">
          <p><strong>{num(view.units, 2)}</strong> units</p>
          <span>{data.labels.unitsOf}</span>
          {view.bonus > 0 && <span className="fig-counter-note">{data.labels.base}</span>}
        </div>
      )}
      {view.floorArea > 0 && (
        <div className="fig-counter">
          <p><strong>{num(shownArea)}</strong> sq ft</p>
          <span>{data.labels.plateOf}</span>
        </div>
      )}
      {view.toggle > 0 && (
        <div className="fig-toggle" style={{ opacity: view.toggle }}>
          <span className={`fig-switch ${view.toggle >= 1 ? 'is-on' : ''}`} aria-hidden />
          <span>{data.labels.toggle}: <strong>{data.labels.toggleValue}</strong></span>
        </div>
      )}
      {view.collapsed && view.stamp > 0 && (
        <div className="fig-stamp-html fig-stamp-collapse" style={{ opacity: view.stamp, transform: `rotate(-4deg) scale(${1 + 0.35 * (1 - view.stamp)})` }}>
          <strong>{data.labels.collapse}</strong>
          <span>{data.labels.collapseSub}</span>
        </div>
      )}
      {view.totals > 0 && (
        <div className="fig-totals" style={{ opacity: view.totals }}>
          <strong>{data.labels.totals}</strong>
          <span>{data.labels.totalsSub}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- camera

interface Preset { center: [number, number, number]; radius: number; dir: [number, number, number] }

function presets(data: EnvelopeData): Record<EnvelopeScene, Preset> {
  // Stand on the street side, turned a little, looking down at about 30 degrees.
  const [ix, iy] = data.block.inward;
  const turn = (35 * Math.PI) / 180;
  const hx = -ix * Math.cos(turn) + iy * Math.sin(turn);
  const hy = -iy * Math.cos(turn) - ix * Math.sin(turn);
  const el = (30 * Math.PI) / 180;
  const blockDir = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), -hy * Math.cos(el)).normalize();
  const span = Math.max(...data.exhibits.flatMap((e) => e.ring.map(([x]) => Math.abs(x))));
  const tallest = Math.max(...data.rockridge.towers.map((t) => t.heightFt));
  return {
    block: { center: [0, data.block.floorHeightFt * 0.45, 0], radius: data.block.floorHeightFt * 1.05, dir: blockDir.toArray() as [number, number, number] },
    rockridge: { center: [0, tallest * 0.4, 0], radius: tallest * 0.82, dir: new THREE.Vector3(-0.55, 0.38, 0.72).normalize().toArray() as [number, number, number] },
    exhibits: { center: [0, data.exhibits[0]!.floorHeightFt * 0.4, 0], radius: span + 30, dir: new THREE.Vector3(0.12, 0.5, 1).normalize().toArray() as [number, number, number] },
  };
}

function CameraRig({ data, scene }: { data: EnvelopeData; scene: EnvelopeScene }) {
  const { camera, size, invalidate } = useThree();
  const all = useMemo(() => presets(data), [data]);
  useLayoutEffect(() => {
    const p = all[scene];
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(size.height, 1)));
    const dist = p.radius / Math.sin(Math.min(vfov, hfov) / 2);
    const c = new THREE.Vector3(...p.center);
    cam.position.copy(c).addScaledVector(new THREE.Vector3(...p.dir), dist);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    invalidate();
  }, [all, scene, camera, size.width, size.height, invalidate]);
  return null;
}

// ---------------------------------------------------------------- primitives

function useShapeGeometry(ring: XY[]) {
  return useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 1, bevelEnabled: false });
    return { geo, edges: new THREE.EdgesGeometry(geo) };
  }, [ring]);
}

/** A prism over `ring` from `base` up `height` feet. */
function Prism({ ring, height, base = 0, at = [0, 0], color, opacity = 1, edge, edgeOpacity = 0.6, dashed = false }: {
  ring: XY[]; height: number; base?: number; at?: XY; color?: string; opacity?: number; edge?: string; edgeOpacity?: number; dashed?: boolean;
}) {
  const { geo, edges } = useShapeGeometry(ring);
  const lines = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => { if (dashed) lines.current?.computeLineDistances(); });
  if (height <= 0.05 || (opacity <= 0 && !edge)) return null;
  return (
    <group position={w3(at[0], at[1], base)} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, height]}>
      {color && opacity > 0 && (
        <mesh geometry={geo} renderOrder={opacity < 1 ? 2 : 1}>
          <meshLambertMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} side={THREE.DoubleSide} />
        </mesh>
      )}
      {edge && (
        <lineSegments ref={lines} geometry={edges} renderOrder={3}>
          {dashed
            ? <lineDashedMaterial color={edge} dashSize={3} gapSize={2} transparent opacity={edgeOpacity} scale={1} />
            : <lineBasicMaterial color={edge} transparent opacity={edgeOpacity} />}
        </lineSegments>
      )}
    </group>
  );
}

const loop = (ring: XY[], h: number) => [...ring, ring[0]!].map(([x, y]) => w3(x, y, h));

/** The ring vertex farthest to the camera's right, pushed `by` feet away from the ring's center. */
function rightCorner(ring: XY[], dir: [number, number, number], by = 8): XY {
  // Camera direction in local axes (x east, y north); right = forward x up.
  const right: XY = [dir[2], dir[0]];
  const p = ring.reduce((best, q) => (q[0] * right[0] + q[1] * right[1] > best[0] * right[0] + best[1] * right[1] ? q : best));
  const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
  const l = Math.hypot(p[0] - cx, p[1] - cy) || 1;
  return [p[0] + ((p[0] - cx) / l) * by, p[1] + ((p[1] - cy) / l) * by];
}

// ---------------------------------------------------------------- labels

interface LabelSpec {
  id: string;
  at: [number, number, number];
  text: string;
  sub?: string;
  className?: string;
  opacity: number;
}

/** Every label the current view shows, anchored in 3D; drawn as HTML over the canvas. */
function sceneLabels(data: EnvelopeData, view: EnvelopeView): LabelSpec[] {
  const L = data.labels;
  const all = presets(data);
  const out: LabelSpec[] = [];
  if (view.scene === 'block') {
    const b = data.block;
    const [x, y] = rightCorner(b.site, all.block.dir);
    out.push({ id: 'local', at: w3(x, y, b.localHeightFt), text: L.local!, opacity: view.solid === 0 && view.outline === 0 ? 1 : view.dimension });
    out.push({ id: 'floor', at: w3(x, y, view.height), text: L.floor!, className: 'env-label-accent', opacity: view.dimension });
    out.push({ id: 'gain', at: w3(x, y, (b.localHeightFt + view.height) / 2), text: L.gain!, className: 'env-label-soft', opacity: view.dimension });
    out.push({ id: 'preview', at: w3(x, y, b.floorHeightFt), text: L.preview!, className: 'env-label-accent', opacity: Math.max(view.previewLabel, view.outline) });
    out.push({ id: 'lock', at: w3(x, y, b.floorHeightFt + 4), text: L.lock!, sub: L.lockSub!, className: 'env-label-strong', opacity: view.lock });
    out.push({ id: 'bonus', at: w3(x, y, b.floorHeightFt * 0.45), text: L.bonus!, opacity: view.bonus });
    if (view.setback > 0) {
      const [a, c] = b.setback.line;
      const shift = b.setback.depth * (1 - view.setback);
      const mid = w3((a[0] + c[0]) / 2 + b.inward[0] * shift, (a[1] + c[1]) / 2 + b.inward[1] * shift, b.floorHeightFt + 14);
      out.push({ id: 'setback', at: mid, text: L.setback!, className: 'env-label-soft env-label-center', opacity: 1 - view.stamp });
      out.push({ id: 'stamp', at: mid, text: L.cannotPreclude!, className: 'env-stamp', opacity: view.stamp });
    }
  } else if (view.scene === 'rockridge') {
    const r = data.rockridge;
    const [x, y] = rightCorner(r.site, all.rockridge.dir, 10);
    out.push({ id: 'rock-local', at: w3(x, y, r.localHeightFt), text: L.rockLocal!, opacity: 1 });
    out.push({ id: 'rock-floor', at: w3(x, y, r.floorHeightFt - 12), text: L.rockFloor!, className: 'env-label-accent', opacity: view.solid });
    r.towers.forEach((tw, i) => out.push({ id: `tower-${i}`, at: w3(tw.at[0] + 12, tw.at[1], tw.heightFt), text: `${num(tw.heightFt)} ft`, opacity: view.towers >= 1 ? 1 : 0 }));
    out.push({ id: 'rock-towers', at: w3(x, y, Math.max(...r.towers.map((tw) => tw.heightFt)) * 0.62), text: L.rockTowers!, sub: L.rockNote!, className: 'env-label-strong', opacity: view.towers });
    out.push({ id: 'rock-site', at: w3(x, y, 0), text: L.rockSite!, className: 'env-label-soft', opacity: 1 });
  } else {
    for (const e of data.exhibits) {
      out.push({ id: `ex-${e.key}`, at: w3(e.center[0], Math.min(...e.ring.map(([, y]) => y)) - 6, 0), text: e.label, sub: e.sub, className: 'env-label-center', opacity: 1 });
    }
    const xs = data.exhibits.flatMap((e) => e.ring.map(([x]) => x));
    out.push({ id: 'labor', at: w3(Math.max(...xs) + 25, 0, data.laborFt), text: L.labor!, opacity: view.labor });
  }
  return out.filter((l) => l.opacity > 0);
}

/** Canvas pixels, and the room (px) between the anchor and the right edge. */
type Projected = [x: number, y: number, room: number];

/** Projects label anchors to canvas pixels after the camera is placed. */
function Projector({ anchors, scene, onProject }: { anchors: LabelSpec[]; scene: EnvelopeScene; onProject: (xy: Record<string, Projected | null>) => void }) {
  const { camera, size } = useThree();
  const key = JSON.stringify(anchors.map((a) => [a.id, a.at]));
  useLayoutEffect(() => {
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    onProject(Object.fromEntries(anchors.map((a) => {
      v.set(...a.at).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      return [a.id, v.z > 1 ? null : [x, ((1 - v.y) / 2) * size.height, size.width - x]];
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scene, camera, size.width, size.height, onProject]);
  return null;
}

// ---------------------------------------------------------------- scenes

function Block({ data, view, t }: { data: EnvelopeData; view: EnvelopeView; t: Tokens }) {
  const b = data.block;
  const preset = useMemo(() => presets(data).block, [data]);
  const [dx, dy] = useMemo(() => rightCorner(b.site, preset.dir), [b.site, preset.dir]);
  const envColor = view.collapsed ? t.collapse! : t.accent!;

  // Plates revealed up to the stacked floor area.
  let left = view.floorArea;
  const plates = b.plates.map((p, i) => {
    const area = b.plateAreas[i]!;
    const shown = Math.max(0, Math.min(1, left / area));
    left -= area;
    return { ...p, shown };
  });
  const whole = Math.floor(view.units);
  const frac = view.units - whole;
  const lower = view.collapsed ? view.height : Math.min(view.height, b.localHeightFt);

  return (
    <group>
      {/* Ground: parcel lines, the site outline, and the neighbors */}
      {b.ground.map((r, i) => <Line key={i} points={loop(r, 0.05)} color={t['context-edge']} lineWidth={0.8} />)}
      <Line points={loop(b.site, 0.1)} color={t.ink} lineWidth={2} />
      {b.context.map((s, i) => <Prism key={i} ring={s.ring} height={s.height} color={t.context} edge={t['context-edge']} edgeOpacity={0.7} />)}

      {/* Ghost: local zoning */}
      <Prism ring={b.site} height={b.localHeightFt} color={t.ghost} opacity={0.55 * view.ghost} edge={t['ink-soft']} edgeOpacity={0.55 * view.ghost} />

      {/* The SB 79 envelope: the part above the local limit, then the part within it */}
      {view.solid > 0 && !view.collapsed && view.height > b.localHeightFt + 0.05 && (
        <Prism ring={b.site} base={b.localHeightFt} height={view.height - b.localHeightFt} color={envColor} opacity={view.solid} edge={t.page} edgeOpacity={0.5} />
      )}
      {view.solid > 0 && (
        <Prism ring={b.site} height={lower} color={envColor} opacity={view.collapsed ? 0.55 : view.solid} edge={view.collapsed ? envColor : t.page} edgeOpacity={view.collapsed ? 1 : 0.5} />
      )}
      {view.outline > 0 && <Prism ring={b.site} height={b.floorHeightFt} edge={t.accent} edgeOpacity={view.outline} dashed />}

      {/* Floor plates */}
      {plates.map((p, i) => p.shown > 0 && (
        <Prism key={i} ring={p.ring} base={p.elevation} height={p.thickness} color={t.accent} opacity={p.shown} edge={t.ink} edgeOpacity={0.4 * p.shown} />
      ))}

      {/* Unit dots; the last one is the fraction */}
      {b.dots.map((d, i) => {
        if (i > whole || (i === whole && frac <= 0)) return null;
        const f = i < whole ? 1 : frac;
        return (
          <mesh key={i} position={w3(d[0], d[1], d[2])} scale={0.45 + 0.55 * f}>
            <sphereGeometry args={[2.2, 16, 12]} />
            <meshLambertMaterial color={t.ink} transparent={f < 1} opacity={f < 1 ? 0.35 + 0.65 * f : 1} />
          </mesh>
        );
      })}
      {view.bonus > 0 && b.bonusDots.map((d, i) => {
        const f = Math.min(1, Math.max(0, view.bonus * b.bonusDots.length - i));
        // Hollow: a page-colored dot inside a slightly larger ink back face.
        return f > 0 && (
          <group key={i} position={w3(d[0], d[1], d[2])} scale={f}>
            <mesh><sphereGeometry args={[2.0, 16, 12]} /><meshBasicMaterial color={t.page} /></mesh>
            <mesh scale={1.22}><sphereGeometry args={[2.0, 16, 12]} /><meshBasicMaterial color={t.ink} side={THREE.BackSide} /></mesh>
          </group>
        );
      })}
      {(view.units > 0 || view.bonus > 0) && b.levels.map((h) => (
        <Line key={h} points={loop(b.site, h)} color={t.accent} lineWidth={1} transparent opacity={0.45} />
      ))}

      {view.setback > 0 && <Setback data={b} view={view} t={t} />}

      {/* Height lock (density bonus) */}
      {view.lock > 0 && <Line points={loop(b.site, b.floorHeightFt + 0.4)} color={t.ink} lineWidth={2.4} transparent opacity={view.lock} />}

      {/* Dimension line at the right-hand corner */}
      {view.dimension > 0 && (
        <>
          <Line points={[w3(dx, dy, 0), w3(dx, dy, view.height)]} color={t.ink} lineWidth={1.2} transparent opacity={view.dimension} />
          {[b.localHeightFt, view.height].map((h) => (
            <Line key={h} points={[w3(dx - 2.5, dy, h), w3(dx + 2.5, dy, h)]} color={t.ink} lineWidth={1.2} transparent opacity={view.dimension} />
          ))}
        </>
      )}
    </group>
  );
}

function Setback({ data: b, view, t }: { data: EnvelopeData['block']; view: EnvelopeView; t: Tokens }) {
  const [a, c] = b.setback.line;
  const shift = b.setback.depth * (1 - view.setback);
  const [ix, iy] = b.inward;
  const p0: XY = [a[0] + ix * shift, a[1] + iy * shift];
  const p1: XY = [c[0] + ix * shift, c[1] + iy * shift];
  const top = b.floorHeightFt + 8;
  const plane = useMemo(() => new THREE.BufferGeometry(), []);
  useLayoutEffect(() => {
    const v = [...w3(p0[0], p0[1], 0), ...w3(p1[0], p1[1], 0), ...w3(p1[0], p1[1], top), ...w3(p0[0], p0[1], top)];
    plane.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    plane.setIndex([0, 1, 2, 0, 2, 3]);
    plane.computeVertexNormals();
  }, [plane, p0[0], p0[1], p1[0], p1[1], top]);
  const cut = new THREE.Color(t['ink-soft']).lerp(new THREE.Color(t.ghost), view.setbackGray).getStyle();
  return (
    <group>
      <mesh geometry={plane} renderOrder={4}>
        <meshBasicMaterial color={cut} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={[w3(p0[0], p0[1], top), w3(p1[0], p1[1], top), w3(p1[0], p1[1], 0), w3(p0[0], p0[1], 0), w3(p0[0], p0[1], top)]} color={cut} lineWidth={1.5} />
      <Prism ring={b.setback.slab} height={b.floorHeightFt + 0.3} color={cut} opacity={0.6 * view.setback} edge={cut} edgeOpacity={view.setback} />
    </group>
  );
}

function Rockridge({ data, view, t }: { data: EnvelopeData; view: EnvelopeView; t: Tokens }) {
  const r = data.rockridge;
  return (
    <group>
      <Line points={loop(r.site, 0.1)} color={t.ink} lineWidth={2} />
      <Prism ring={r.site} height={r.localHeightFt} color={t.ghost} opacity={0.45} edge={t['ink-soft']} edgeOpacity={0.55} />
      <Prism ring={r.site} height={r.floorHeightFt} color={t.accent} opacity={0.8 * view.solid} edge={t.accent} edgeOpacity={view.solid} />
      {r.towers.map((tw, i) => (
        <group key={i}>
          {view.towers > 0 && (
            <>
              <Line points={[w3(tw.at[0], tw.at[1], 0), w3(tw.at[0], tw.at[1], tw.heightFt * view.towers)]} color={t.ink} lineWidth={2} dashed dashSize={6} gapSize={4} />
              <Line points={[w3(tw.at[0] - 10, tw.at[1], tw.heightFt * view.towers), w3(tw.at[0] + 10, tw.at[1], tw.heightFt * view.towers)]} color={t.ink} lineWidth={2} />
            </>
          )}
        </group>
      ))}
    </group>
  );
}

function Exhibits({ data, view, t }: { data: EnvelopeData; view: EnvelopeView; t: Tokens }) {
  const xs = data.exhibits.flatMap((e) => e.ring.map(([x]) => x));
  const ys = data.exhibits.flatMap((e) => e.ring.map(([, y]) => y));
  const [x0, x1, y0, y1] = [Math.min(...xs) - 25, Math.max(...xs) + 25, Math.min(...ys) - 15, Math.max(...ys) + 15];
  const plane: XY[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return (
    <group>
      {data.exhibits.map((e) => (
        <group key={e.key}>
          <Line points={loop(e.ring, 0.1)} color={t.ink} lineWidth={1.6} />
          <Prism ring={e.ring} height={e.localHeightFt} color={t.ghost} opacity={0.55} edge={t['ink-soft']} edgeOpacity={0.5} />
          <Prism ring={e.ring} base={e.localHeightFt} height={(e.floorHeightFt - e.localHeightFt) * view.solid} color={t.accent} opacity={0.9} edge={t.accent} edgeOpacity={0.9} />
        </group>
      ))}
      {view.labor > 0 && (
        <>
          <Prism ring={plane} base={data.laborFt} height={0.2} color={t['ink-soft']} opacity={0.06 * view.labor} />
          <Line points={loop(plane, data.laborFt)} color={t.ink} lineWidth={1.4} dashed dashSize={4} gapSize={3} transparent opacity={view.labor} />
        </>
      )}
    </group>
  );
}
