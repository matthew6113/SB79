/**
 * Envelope figure (3D, react-three-fiber). Exhibit B and its neighbors in a
 * quiet three-quarter view: the pale ghost (local zoning), the SB 79
 * envelope, floor plates, unit dots, the setback, the collapse; then the
 * Rockridge contrast and the three exhibits side by side.
 *
 * Geometry comes from figure-data.ts (@zoning-envelope/engine in local feet);
 * heights and labels from the figure data; motion from views.ts. Prisms are
 * built at unit depth and scaled, so a state change never rebuilds geometry.
 * When a state moves to another scene, both scenes render while the camera
 * moves between them and one dissolves into the other.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnvelopeData, FigureHandle, Solid, XY } from './types';
import { IMPLEMENTED, envelopeView, type EnvelopeScene, type EnvelopeView } from './views';
import { useTokens } from './hooks';
import { num } from '../format';

interface Props {
  data: EnvelopeData;
  ref?: Ref<FigureHandle>;
}

type Tokens = Record<string, string>;
type V3 = [number, number, number];
/** Local (x east, y north, height) to three.js (x, up, -north). */
const w3 = (x: number, y: number, h = 0): V3 => [x, h, -y];
const loop = (ring: XY[], h: number) => [...ring, ring[0]!].map(([x, y]) => w3(x, y, h));

function EnvelopeFigure({ data, ref }: Props) {
  const [{ state, progress }, set] = useState({ state: 'ghost', progress: 1 });
  useImperativeHandle(ref, () => ({
    setState(s: string, p: number) {
      if (!(IMPLEMENTED.envelope as readonly string[]).includes(s)) throw new Error(`EnvelopeFigure has no state "${s}"`);
      set({ state: s, progress: p });
    },
  }), []);
  const view = useMemo(() => envelopeView(state, progress, data.block), [state, progress, data.block]);
  const tokens = useTokens();
  // The reduced-motion crossfade copies the canvas, which needs the last frame kept.
  const [reduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const b = data.block;
  // While dissolving, the outgoing scene shows at its settled view, fading out.
  const layers = useMemo(
    () => (view.from && view.mix < 1 ? [{ v: view.from, alpha: 1 - view.mix }, { v: view, alpha: view.mix }] : [{ v: view, alpha: 1 }]),
    [view],
  );
  const labels = useMemo(() => layers.flatMap(({ v, alpha }) => sceneLabels(data, v, alpha)), [data, layers]);
  const [screen, setScreen] = useState<Record<string, Projected | null>>({});
  const onProject = useCallback((xy: Record<string, Projected | null>) => setScreen(xy), []);
  const camera = { from: view.from?.scene ?? view.scene, to: view.scene, t: view.from ? view.mix : 1 };

  return (
    <div className="envelope-figure" data-state={state}>
      {tokens && (
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 26, near: 5, far: 6000, position: [300, 200, 300] }}
          gl={{ antialias: true, preserveDrawingBuffer: reduced }}
          fallback={<p className="fig-fallback">This figure needs WebGL.</p>}
        >
          <ambientLight intensity={2.2} />
          <directionalLight position={[-200, 400, 250]} intensity={1.5} />
          <CameraRig data={data} {...camera} />
          <Warmup t={tokens} />
          <Projector anchors={labels} onProject={onProject} cameraKey={`${camera.from}:${camera.to}:${camera.t.toFixed(4)}`} />
          {layers.map(({ v, alpha }) => (
            <group key={v.scene}>
              {v.scene === 'block' && <Block data={data} view={v} t={tokens} alpha={alpha} />}
              {v.scene === 'rockridge' && <Rockridge data={data} view={v} t={tokens} alpha={alpha} />}
              {v.scene === 'exhibits' && <Exhibits data={data} view={v} t={tokens} alpha={alpha} />}
            </group>
          ))}
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
      {view.scene === 'block' && view.units > 0 && view.dots > 0 && (
        <div className="fig-counter" style={{ opacity: view.dots }}>
          <p><strong>{num(view.units, 2)}</strong> units</p>
          <span>{data.labels.unitsOf}</span>
          {view.bonus > 0 && <span className="fig-counter-note">{data.labels.base}</span>}
        </div>
      )}
      {view.scene === 'block' && view.floorArea > 0 && view.plates > 0 && (
        <div className="fig-counter" style={{ opacity: view.plates }}>
          <p><strong>{num(Math.min(view.floorArea, b.residentialFloorAreaSqFt))}</strong> sq ft</p>
          <span>{data.labels.plateOf}</span>
        </div>
      )}
      {view.toggle > 0 && (
        <div className="fig-toggle" style={{ opacity: view.toggle }}>
          <span className={`fig-switch ${view.red > 0 ? 'is-on' : ''}`} aria-hidden />
          <span>{data.labels.toggle}: <strong>{data.labels.toggleValue}</strong></span>
        </div>
      )}
      {view.collapseStamp > 0 && (
        <div className="fig-stamp-html fig-stamp-collapse" style={{ opacity: view.collapseStamp, transform: `rotate(-4deg) scale(${1 + 0.35 * (1 - view.collapseStamp)})` }}>
          <strong>{data.labels.collapse}</strong>
          <span>{data.labels.collapseSub}</span>
        </div>
      )}
      {view.totals > 0 && (
        <div className="fig-totals" style={{ opacity: view.totals, transform: `scale(${1 + 0.2 * (1 - view.totals)})` }}>
          <strong>{data.labels.totals}</strong>
          <span>{data.labels.totalsSub}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- camera

interface Preset { center: V3; radius: number; dir: V3 }

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
    block: { center: [0, data.block.floorHeightFt * 0.45, 0], radius: data.block.floorHeightFt * 1.05, dir: blockDir.toArray() as V3 },
    rockridge: { center: [0, tallest * 0.4, 0], radius: tallest * 0.82, dir: new THREE.Vector3(-0.55, 0.38, 0.72).normalize().toArray() as V3 },
    exhibits: { center: [0, data.exhibits[0]!.floorHeightFt * 0.4, 0], radius: span + 30, dir: new THREE.Vector3(0.12, 0.5, 1).normalize().toArray() as V3 },
  };
}
const presetCache = new WeakMap<EnvelopeData, Record<EnvelopeScene, Preset>>();
const presetsOf = (data: EnvelopeData) => {
  let p = presetCache.get(data);
  if (!p) presetCache.set(data, (p = presets(data)));
  return p;
};

/** Places the camera at a preset, or partway between two (the view's move, already eased). */
function CameraRig({ data, from, to, t }: { data: EnvelopeData; from: EnvelopeScene; to: EnvelopeScene; t: number }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const all = presetsOf(data);
    const a = all[from], b = all[to];
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(size.height, 1)));
    const fit = (r: number) => r / Math.sin(Math.min(vfov, hfov) / 2);
    const center = new THREE.Vector3(...a.center).lerp(new THREE.Vector3(...b.center), t);
    const dir = new THREE.Vector3(...a.dir).lerp(new THREE.Vector3(...b.dir), t).normalize();
    // Distance changes geometrically so a long pull-back reads as steady.
    const dist = fit(a.radius) * Math.pow(fit(b.radius) / fit(a.radius), t);
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    invalidate();
  }, [data, from, to, t, camera, size.width, size.height, invalidate]);
  return null;
}

/**
 * Compiles every material variant the figure uses once, at mount, and keeps
 * one of each alive (hidden) so three.js never frees and recompiles a shader
 * mid-scroll when the last object using it unmounts.
 */
function Warmup({ t }: { t: Tokens }) {
  const { gl, scene, camera } = useThree();
  const [done, setDone] = useState(false);
  const ring = useMemo((): XY[] => [[0, 0], [1, 0], [1, 1]], []);
  useLayoutEffect(() => {
    gl.compile(scene, camera);
    setDone(true);
  }, [gl, scene, camera]);
  return (
    <group position={[0, -1000, 0]} visible={!done}>
      <Prism ring={ring} height={1} color={t.ghost} opacity={0.5} edge={t.ink} edgeOpacity={0.5} />
      <Prism ring={ring} height={1} edge={t.ink} edgeOpacity={0.5} dashed />
      <Outline ring={ring} h={0} color={t.ink} opacity={0.5} />
      <mesh><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color={t.ink} transparent opacity={0.5} /></mesh>
      <mesh><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color={t.page} transparent opacity={0.5} /></mesh>
      <mesh><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color={t.ink} side={THREE.BackSide} transparent opacity={0.5} /></mesh>
      <mesh><planeGeometry args={[1, 1]} /><meshBasicMaterial color={t.ink} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    </group>
  );
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
  ring: XY[]; height: number; base?: number; at?: XY; color?: string | undefined; opacity?: number; edge?: string | undefined; edgeOpacity?: number; dashed?: boolean;
}) {
  const { geo, edges } = useShapeGeometry(ring);
  const lines = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => { if (dashed) lines.current?.computeLineDistances(); });
  const showEdge = Boolean(edge) && edgeOpacity > 0.001;
  if (height <= 0.05 || (opacity <= 0.001 && !showEdge)) return null;
  return (
    <group position={w3(at[0], at[1], base)} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, height]}>
      {color && opacity > 0.001 && (
        <mesh geometry={geo} renderOrder={opacity < 1 ? 2 : 1}>
          <meshLambertMaterial color={color} transparent opacity={opacity} depthWrite={opacity >= 0.999} side={THREE.DoubleSide} />
        </mesh>
      )}
      {showEdge && (
        <lineSegments ref={lines} geometry={edges} renderOrder={3}>
          {dashed
            ? <lineDashedMaterial color={edge} dashSize={3} gapSize={2} transparent opacity={edgeOpacity} scale={1} />
            : <lineBasicMaterial color={edge} transparent opacity={edgeOpacity} />}
        </lineSegments>
      )}
    </group>
  );
}

/**
 * The neighbors and the ground lines, merged into three draw calls (they never
 * change), so the block stays cheap to draw on a phone.
 */
const Context = memo(function Context({ solids, ground, t, alpha }: { solids: Solid[]; ground: XY[][]; t: Tokens; alpha: number }) {
  const geo = useMemo(() => {
    const blocks = solids.map((s) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(s.ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: s.height, bevelEnabled: false });
      return g.rotateX(-Math.PI / 2);
    });
    const mesh = mergeGeometries(blocks);
    const edges = mergeGeometries(blocks.map((g) => new THREE.EdgesGeometry(g)));
    const segs: number[] = [];
    for (const r of ground) r.forEach(([x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]!; segs.push(x, 0.05, -y, x2, 0.05, -y2); });
    const lines = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    blocks.forEach((g) => g.dispose());
    return { mesh, edges, lines };
  }, [solids, ground]);
  if (alpha <= 0.001) return null;
  return (
    <group>
      <lineSegments geometry={geo.lines}><lineBasicMaterial color={t['context-edge']} transparent opacity={alpha} /></lineSegments>
      <mesh geometry={geo.mesh}><meshLambertMaterial color={t.context} transparent opacity={alpha} depthWrite={alpha >= 0.999} side={THREE.DoubleSide} /></mesh>
      <lineSegments geometry={geo.edges}><lineBasicMaterial color={t['context-edge']} transparent opacity={0.7 * alpha} /></lineSegments>
    </group>
  );
});

/**
 * A polyline drawn with three.js's own line materials (one pixel wide). These
 * share shader programs across every line, so lines can come and go mid-scroll
 * without a shader compile.
 */
function Polyline({ points, color, opacity = 1, dashed = false, dash = 4 }: { points: V3[]; color: string | undefined; opacity?: number; dashed?: boolean; dash?: number }) {
  const key = JSON.stringify(points);
  const geo = useMemo(() => {
    const pairs = points.slice(1).flatMap((q, i) => [...points[i]!, ...q]);
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => { if (dashed) ref.current?.computeLineDistances(); }, [geo, dashed]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (opacity <= 0.001) return null;
  return (
    <lineSegments ref={ref} geometry={geo} renderOrder={3}>
      {dashed
        ? <lineDashedMaterial color={color} transparent opacity={opacity} dashSize={dash} gapSize={dash * 0.75} />
        : <lineBasicMaterial color={color} transparent opacity={opacity} />}
    </lineSegments>
  );
}

/** A narrow band around a ring's perimeter (no top or bottom): a heavy line that reads from any angle. */
function Band({ ring, h, color, opacity, depth = 0.9 }: { ring: XY[]; h: number; color: string | undefined; opacity: number; depth?: number }) {
  const geo = useMemo(() => {
    const v: number[] = [];
    ring.forEach(([x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      const [a, b2, c, d] = [w3(x, y, h), w3(x2, y2, h), w3(x2, y2, h + depth), w3(x, y, h + depth)];
      v.push(...a, ...b2, ...c, ...a, ...c, ...d);
    });
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  }, [ring, h, depth]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (opacity <= 0.001) return null;
  return (
    <mesh geometry={geo} renderOrder={3}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/** A ring outline at a fixed height. */
function Outline({ ring, h, color, opacity = 1, dashed = false }: { ring: XY[]; h: number; color: string | undefined; opacity?: number; dashed?: boolean }) {
  const pts = useMemo(() => loop(ring, h), [ring, h]);
  return <Polyline points={pts} color={color} opacity={opacity} dashed={dashed} />;
}

// ---------------------------------------------------------------- labels

interface LabelSpec {
  id: string;
  at: V3;
  text: string;
  sub?: string;
  className?: string;
  opacity: number;
}

/** The ring vertex farthest to the camera's right, pushed `by` feet away from the ring's center. */
function rightCorner(ring: XY[], dir: V3, by = 8): XY {
  // Camera direction in local axes (x east, y north); right = forward x up.
  const right: XY = [dir[2], dir[0]];
  const p = ring.reduce((best, q) => (q[0] * right[0] + q[1] * right[1] > best[0] * right[0] + best[1] * right[1] ? q : best));
  const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
  const l = Math.hypot(p[0] - cx, p[1] - cy) || 1;
  return [p[0] + ((p[0] - cx) / l) * by, p[1] + ((p[1] - cy) / l) * by];
}

/** Every label a view shows, anchored in 3D; drawn as HTML over the canvas. */
function sceneLabels(data: EnvelopeData, view: EnvelopeView, alpha: number): LabelSpec[] {
  const L = data.labels;
  const all = presetsOf(data);
  const out: LabelSpec[] = [];
  if (view.scene === 'block') {
    const b = data.block;
    const [x, y] = rightCorner(b.site, all.block.dir);
    out.push({ id: 'local', at: w3(x, y, b.localHeightFt), text: L.local!, opacity: Math.max(view.localLabel, view.dimension) });
    out.push({ id: 'floor', at: w3(x, y, view.height), text: L.floor!, className: 'env-label-accent', opacity: view.dimension });
    out.push({ id: 'gain', at: w3(x, y, (b.localHeightFt + view.height) / 2), text: L.gain!, className: 'env-label-soft', opacity: view.dimension });
    out.push({ id: 'preview', at: w3(x, y, Math.max(view.height, b.localHeightFt + 2)), text: L.preview!, className: 'env-label-accent', opacity: Math.max(view.previewLabel, view.outline) });
    out.push({ id: 'lock', at: w3(x, y, b.floorHeightFt + 4), text: L.lock!, sub: L.lockSub!, className: 'env-label-strong', opacity: view.lock });
    out.push({ id: 'bonus', at: w3(x, y, b.floorHeightFt * 0.45), text: L.bonus!, opacity: view.bonus > 0 ? 1 : 0 });
    if (view.setback > 0) {
      const [a, c] = b.setback.line;
      const shift = b.setback.depth * (1 - view.setback);
      const mid = w3((a[0] + c[0]) / 2 + b.inward[0] * shift, (a[1] + c[1]) / 2 + b.inward[1] * shift, b.floorHeightFt + 14);
      out.push({ id: 'setback', at: mid, text: L.setback!, className: 'env-label-soft env-label-center', opacity: Math.min(view.setback, 1 - view.precludeStamp) });
      out.push({ id: 'stamp', at: mid, text: L.cannotPreclude!, className: 'env-stamp', opacity: view.precludeStamp });
    }
  } else if (view.scene === 'rockridge') {
    const r = data.rockridge;
    const [x, y] = rightCorner(r.site, all.rockridge.dir, 10);
    out.push({ id: 'rock-local', at: w3(x, y, r.localHeightFt), text: L.rockLocal!, opacity: 1 });
    out.push({ id: 'rock-floor', at: w3(x, y, r.floorHeightFt - 12), text: L.rockFloor!, className: 'env-label-accent', opacity: view.rockRise });
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
  return out.map((l) => ({ ...l, id: `${view.scene}:${l.id}`, opacity: l.opacity * alpha })).filter((l) => l.opacity > 0.001);
}

/** Canvas pixels, and the room (px) between the anchor and the right edge. */
type Projected = [x: number, y: number, room: number];

/** Projects label anchors to canvas pixels after the camera is placed. */
function Projector({ anchors, cameraKey, onProject }: { anchors: LabelSpec[]; cameraKey: string; onProject: (xy: Record<string, Projected | null>) => void }) {
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
  }, [key, cameraKey, camera, size.width, size.height, onProject]);
  return null;
}

// ---------------------------------------------------------------- scenes

function Block({ data, view, t, alpha }: { data: EnvelopeData; view: EnvelopeView; t: Tokens; alpha: number }) {
  const b = data.block;
  const [dx, dy] = useMemo(() => rightCorner(b.site, presetsOf(data).block.dir), [b.site, data]);
  // Collapse: the envelope's color drains to red as it drops (the one use of red).
  const envColor = useMemo(() => new THREE.Color(t.accent).lerp(new THREE.Color(t.collapse), view.red).getStyle(), [t, view.red]);
  const solid = view.solid * (1 - 0.45 * view.red) * alpha;
  const edgeAlpha = Math.min(1, view.solid) * alpha;

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
  const dotAlpha = view.dots * alpha;

  return (
    <group>
      <Context solids={b.context} ground={b.ground} t={t} alpha={alpha} />
      <Outline ring={b.site} h={0.1} color={t.ink} opacity={alpha} />

      {/* Ghost: local zoning */}
      <Prism ring={b.site} height={b.localHeightFt} color={t.ghost} opacity={0.55 * view.ghost * alpha} edge={t['ink-soft']} edgeOpacity={0.55 * view.ghost * alpha} />

      {/* The SB 79 envelope: the part above the local limit, then the part within it */}
      {view.height > b.localHeightFt + 0.05 && (
        <Prism ring={b.site} base={b.localHeightFt} height={view.height - b.localHeightFt} color={envColor} opacity={solid} edge={t.page} edgeOpacity={0.5 * edgeAlpha} />
      )}
      <Prism ring={b.site} height={Math.min(view.height, b.localHeightFt)} color={envColor} opacity={solid} edge={view.red > 0.5 ? envColor : t.page} edgeOpacity={(view.red > 0.5 ? 1 : 0.5) * edgeAlpha} />
      <Prism ring={b.site} height={b.floorHeightFt} edge={t.accent} edgeOpacity={view.outline * alpha} dashed />

      {/* Floor plates, filled in sequence */}
      {plates.map((p, i) => p.shown > 0 && (
        <Prism key={i} ring={p.ring} base={p.elevation} height={p.thickness} color={t.accent} opacity={p.shown * view.plates * alpha} edge={t.ink} edgeOpacity={0.4 * p.shown * view.plates * alpha} />
      ))}

      {/* Unit dots, filled in sequence; the last one is the fraction */}
      {dotAlpha > 0.001 && b.dots.map((d, i) => {
        if (i > whole || (i === whole && frac <= 0)) return null;
        const f = i < whole ? 1 : frac;
        const o = (f < 1 ? 0.35 + 0.65 * f : 1) * dotAlpha;
        return (
          <mesh key={i} position={w3(d[0], d[1], d[2])} scale={0.45 + 0.55 * f}>
            <sphereGeometry args={[2.2, 16, 12]} />
            <meshLambertMaterial color={t.ink} transparent opacity={o} />
          </mesh>
        );
      })}
      {view.bonus > 0 && b.bonusDots.map((d, i) => {
        const f = Math.min(1, Math.max(0, view.bonus * b.bonusDots.length - i));
        // Hollow: a page-colored dot inside a slightly larger ink back face.
        return f > 0 && (
          <group key={i} position={w3(d[0], d[1], d[2])} scale={f}>
            <mesh><sphereGeometry args={[2.0, 16, 12]} /><meshBasicMaterial color={t.page} transparent opacity={alpha} /></mesh>
            <mesh scale={1.22}><sphereGeometry args={[2.0, 16, 12]} /><meshBasicMaterial color={t.ink} side={THREE.BackSide} transparent opacity={alpha} /></mesh>
          </group>
        );
      })}
      {view.levels > 0 && b.levels.map((h) => (
        <Outline key={h} ring={b.site} h={h} color={t.accent} opacity={0.45 * view.levels * alpha} />
      ))}

      {view.setback > 0 && <Setback data={b} view={view} t={t} alpha={alpha} />}

      {/* Height lock (density bonus) */}
      <Band ring={b.site} h={b.floorHeightFt} color={t.ink} opacity={view.lock * alpha} />

      {/* Dimension line at the right-hand corner, traced up from the ground */}
      {view.dimension > 0 && (
        <>
          <Polyline points={[w3(dx, dy, 0), w3(dx, dy, view.height * view.dimension)]} color={t.ink} opacity={view.dimension * alpha} />
          {[b.localHeightFt, view.height].map((h) => (
            <Polyline key={h} points={[w3(dx - 2.5, dy, h), w3(dx + 2.5, dy, h)]} color={t.ink} opacity={view.dimension * alpha} />
          ))}
        </>
      )}
    </group>
  );
}

function Setback({ data: b, view, t, alpha }: { data: EnvelopeData['block']; view: EnvelopeView; t: Tokens; alpha: number }) {
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
  // Gray out: the rule's color drains to the ghost tone.
  const cut = new THREE.Color(t['ink-soft']).lerp(new THREE.Color(t.ghost), view.setbackGray).getStyle();
  return (
    <group>
      <mesh geometry={plane} renderOrder={4}>
        <meshBasicMaterial color={cut} transparent opacity={0.4 * alpha} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Polyline points={[w3(p0[0], p0[1], top), w3(p1[0], p1[1], top), w3(p1[0], p1[1], 0), w3(p0[0], p0[1], 0), w3(p0[0], p0[1], top)]} color={cut} opacity={alpha} />
      <Prism ring={b.setback.slab} height={b.floorHeightFt + 0.3} color={cut} opacity={0.6 * view.setback * alpha} edge={cut} edgeOpacity={view.setback * alpha} />
    </group>
  );
}

function Rockridge({ data, view, t, alpha }: { data: EnvelopeData; view: EnvelopeView; t: Tokens; alpha: number }) {
  const r = data.rockridge;
  return (
    <group>
      <Outline ring={r.site} h={0.1} color={t.ink} opacity={alpha} />
      <Prism ring={r.site} height={r.localHeightFt} color={t.ghost} opacity={0.45 * alpha} edge={t['ink-soft']} edgeOpacity={0.55 * alpha} />
      <Prism ring={r.site} height={r.floorHeightFt * view.rockRise} color={t.accent} opacity={0.8 * alpha} edge={t.accent} edgeOpacity={alpha} />
      {view.towers > 0 && r.towers.map((tw, i) => (
        <group key={i}>
          <Polyline points={[w3(tw.at[0], tw.at[1], 0), w3(tw.at[0], tw.at[1], tw.heightFt * view.towers)]} color={t.ink} opacity={alpha} dashed dash={6} />
          <Polyline points={[w3(tw.at[0] - 10, tw.at[1], tw.heightFt * view.towers), w3(tw.at[0] + 10, tw.at[1], tw.heightFt * view.towers)]} color={t.ink} opacity={alpha} />
        </group>
      ))}
    </group>
  );
}

function Exhibits({ data, view, t, alpha }: { data: EnvelopeData; view: EnvelopeView; t: Tokens; alpha: number }) {
  const plane = useMemo((): XY[] => {
    const xs = data.exhibits.flatMap((e) => e.ring.map(([x]) => x));
    const ys = data.exhibits.flatMap((e) => e.ring.map(([, y]) => y));
    const [x0, x1, y0, y1] = [Math.min(...xs) - 25, Math.max(...xs) + 25, Math.min(...ys) - 15, Math.max(...ys) + 15];
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }, [data]);
  return (
    <group>
      {data.exhibits.map((e) => (
        <group key={e.key}>
          <Outline ring={e.ring} h={0.1} color={t.ink} opacity={alpha} />
          <Prism ring={e.ring} height={e.localHeightFt} color={t.ghost} opacity={0.55 * alpha} edge={t['ink-soft']} edgeOpacity={0.5 * alpha} />
          <Prism ring={e.ring} base={e.localHeightFt} height={(e.floorHeightFt - e.localHeightFt) * view.exRise} color={t.accent} opacity={alpha} edge={t.page} edgeOpacity={0.5 * alpha} />
        </group>
      ))}
      {view.labor > 0 && (
        <>
          <Prism ring={plane} base={data.laborFt} height={0.2} color={t['ink-soft']} opacity={0.06 * view.labor * alpha} />
          <Outline ring={plane} h={data.laborFt} color={t.ink} opacity={view.labor * alpha} dashed />
        </>
      )}
    </group>
  );
}

/** Re-renders only for its own state: the stage updates on every frame of every figure. */
export default memo(EnvelopeFigure);
