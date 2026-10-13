/**
 * three.js pieces shared by the memo's 3D figure and the calculator's small
 * envelope: unit-depth prisms, perimeter bands, one-pixel lines (these share
 * shader programs, so lines can come and go mid-scroll), the shader warm-up,
 * and the projector that places HTML labels over the canvas.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { XY } from './types';

export type Tokens = Record<string, string>;
export type V3 = [number, number, number];
/** Local (x east, y north, height) to three.js (x, up, -north). */
export const w3 = (x: number, y: number, h = 0): V3 => [x, h, -y];
export const loop = (ring: XY[], h: number) => [...ring, ring[0]!].map(([x, y]) => w3(x, y, h));

/**
 * Compiles every material variant the figure uses once, at mount, and keeps
 * one of each alive (hidden) so three.js never frees and recompiles a shader
 * mid-scroll when the last object using it unmounts.
 */
export function Warmup({ t }: { t: Tokens }) {
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

export function useShapeGeometry(ring: XY[]) {
  return useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 1, bevelEnabled: false });
    return { geo, edges: new THREE.EdgesGeometry(geo) };
  }, [ring]);
}

/** A prism over `ring` from `base` up `height` feet. */
export function Prism({ ring, height, base = 0, at = [0, 0], color, opacity = 1, edge, edgeOpacity = 0.6, dashed = false }: {
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
 * A polyline drawn with three.js's own line materials (one pixel wide). These
 * share shader programs across every line, so lines can come and go mid-scroll
 * without a shader compile.
 */
export function Polyline({ points, color, opacity = 1, dashed = false, dash = 4 }: { points: V3[]; color: string | undefined; opacity?: number; dashed?: boolean; dash?: number }) {
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
export function Band({ ring, h, color, opacity, depth = 0.9 }: { ring: XY[]; h: number; color: string | undefined; opacity: number; depth?: number }) {
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
export function Outline({ ring, h, color, opacity = 1, dashed = false }: { ring: XY[]; h: number; color: string | undefined; opacity?: number; dashed?: boolean }) {
  const pts = useMemo(() => loop(ring, h), [ring, h]);
  return <Polyline points={pts} color={color} opacity={opacity} dashed={dashed} />;
}

export interface LabelSpec {
  id: string;
  at: V3;
  text: string;
  sub?: string;
  className?: string;
  opacity: number;
}

/** Canvas pixels, and the room (px) between the anchor and the right edge. */
export type Projected = [x: number, y: number, room: number];

/** Projects label anchors to canvas pixels after the camera is placed. */
export function Projector({ anchors, cameraKey, onProject }: { anchors: LabelSpec[]; cameraKey: string; onProject: (xy: Record<string, Projected | null>) => void }) {
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
