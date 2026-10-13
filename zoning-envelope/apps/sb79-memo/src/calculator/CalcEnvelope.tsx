/**
 * The calculator's small live envelope: a square lot of the entered area, the
 * pale ghost at the local height limit, the SB 79 envelope at the height the
 * city must allow, the proposed height as a dashed outline, and the labor
 * line. When a project condition fails, eligibility is lost and the envelope
 * collapses to local zoning in red (the motion grammar's one use of red).
 */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CalcResult } from './model';
import type { XY } from '../figures/types';
import { Band, Outline, Prism, Projector, Warmup, w3, type LabelSpec, type Projected } from '../figures/three-parts';
import { useTokens } from '../figures/hooks';
import { ftShort } from '../format';

type Env = NonNullable<CalcResult['envelope']>;

export default function CalcEnvelope({ envelope: e }: { envelope: Env }) {
  const tokens = useTokens();
  const side = Math.sqrt(e.lotAreaSqFt);
  const ring = useMemo((): XY[] => {
    const h = side / 2;
    return [[-h, -h], [h, -h], [h, h], [-h, h]];
  }, [side]);
  const sb79 = !e.collapsed && e.floorHeightFt !== null ? e.floorHeightFt : null;
  const top = Math.max(e.localHeightFt ?? 0, sb79 ?? 0, e.proposedHeightFt ?? 0, 10);
  const showLabor = Math.max(sb79 ?? 0, e.proposedHeightFt ?? 0) > e.laborFt * 0.75;
  const corner = side / 2 + 4;

  const labels: LabelSpec[] = [
    ...(e.localHeightFt !== null ? [{ id: 'local', at: w3(corner, -corner, e.localHeightFt), text: `Local limit ${ftShort(e.localHeightFt)}`, opacity: 1, className: e.collapsed ? 'env-label-collapse' : '' }] : []),
    ...(sb79 !== null ? [{ id: 'floor', at: w3(corner, -corner, sb79), text: `SB 79 floor ${ftShort(sb79)}`, opacity: 1, className: 'env-label-accent' }] : []),
    ...(e.proposedHeightFt !== null ? [{ id: 'proposed', at: w3(-corner, corner, e.proposedHeightFt), text: `Proposed ${ftShort(e.proposedHeightFt)}`, opacity: 1, className: 'env-label-soft is-flipped' }] : []),
    ...(showLabor ? [{ id: 'labor', at: w3(corner, corner, e.laborFt), text: `${ftShort(e.laborFt)}: labor standards above`, opacity: 1, className: 'env-label-soft' }] : []),
  ];
  const [screen, setScreen] = useState<Record<string, Projected | null>>({});
  const onProject = useCallback((xy: Record<string, Projected | null>) => setScreen(xy), []);
  const cameraKey = `${side.toFixed(1)}:${top.toFixed(1)}`;

  return (
    <div className="calc-envelope">
      {tokens && (
        <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 26, near: 1, far: 20000, position: [300, 200, 300] }} gl={{ antialias: true }}>
          <ambientLight intensity={2.2} />
          <directionalLight position={[-200, 400, 250]} intensity={1.5} />
          <Warmup t={tokens} />
          <Fit side={side} top={top} />
          <Projector anchors={labels} onProject={onProject} cameraKey={cameraKey} />
          <Outline ring={ring} h={0.1} color={tokens.ink} />
          {e.localHeightFt !== null && !e.collapsed && (
            <Prism ring={ring} height={e.localHeightFt} color={tokens.ghost} opacity={0.55} edge={tokens['ink-soft']} edgeOpacity={0.55} />
          )}
          {sb79 !== null && e.localHeightFt !== null && sb79 > e.localHeightFt && (
            <Prism ring={ring} base={e.localHeightFt} height={sb79 - e.localHeightFt} color={tokens.accent} opacity={1} edge={tokens.page} edgeOpacity={0.5} />
          )}
          {sb79 !== null && (
            <Prism ring={ring} height={e.localHeightFt !== null ? Math.min(sb79, e.localHeightFt) : sb79} color={tokens.accent} opacity={e.localHeightFt !== null ? 0.35 : 0.9} edge={tokens.page} edgeOpacity={0.5} />
          )}
          {e.collapsed && (e.localHeightFt !== null
            ? <Prism ring={ring} height={e.localHeightFt} color={tokens.collapse} opacity={0.55} edge={tokens.collapse} edgeOpacity={1} />
            : <Outline ring={ring} h={0.3} color={tokens.collapse} />)}
          {e.proposedHeightFt !== null && <Prism ring={ring} height={e.proposedHeightFt} edge={tokens.ink} edgeOpacity={0.9} dashed />}
          {showLabor && <Band ring={ring} h={e.laborFt} color={tokens['ink-soft']} opacity={0.6} depth={0.5} />}
        </Canvas>
      )}
      <div className="env-labels" aria-hidden>
        {labels.map((l) => {
          const xy = screen[l.id];
          return xy && (
            <div key={l.id} className={`env-label ${l.className ?? ''}`} style={{ left: xy[0], top: xy[1], opacity: l.opacity }}>
              {l.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Frames the lot and the tallest height in a fixed three-quarter view. */
function Fit({ side, top }: { side: number; top: number }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const center = new THREE.Vector3(0, top * 0.45, 0);
    const radius = Math.max(side * 0.8, top * 0.62, 30);
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(size.height, 1)));
    const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
    cam.position.copy(center).addScaledVector(new THREE.Vector3(0.62, 0.42, 0.66).normalize(), dist);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, side, top, size.width, size.height, invalidate]);
  return null;
}
