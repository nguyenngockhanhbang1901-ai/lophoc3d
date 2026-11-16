import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { MathText } from './MathText';
import type { Vec3 } from '@/lib/geometry';
import type { OrbitControls as Controls } from 'three-stdlib';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { pairSegments, type PairKind } from '@/lib/line-pairs';
import { PlaneNamePosition } from './PlaneNamePosition';
function InitialView({ kind, controls }: { kind: PairKind; controls: React.RefObject<Controls | null> }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...(kind === 'skew' ? [-4, 2, 11] as Vec3 : [6, 7, 8] as Vec3));
    camera.lookAt(0, 0, 0);
    const c = controls.current;
    if (c) { c.target.set(0, 0, 0); c.update(); c.saveState(); }
  }, [camera, controls, kind]);
  return null;
}
export default function LinePairView({ kind }: { kind: PairKind }) {
  const planeName = useRef<HTMLDivElement | null>(null);
  const lineName = useRef<HTMLDivElement | null>(null);
  const otherName = useRef<HTMLDivElement | null>(null);
  const controls = useRef<Controls | null>(null);
  const [palette, setPalette] = useState<{ plane: string; line: string; other: string } | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    const resolve = (key: string) => { ctx.fillStyle = css.getPropertyValue(key).trim(); ctx.fillRect(0, 0, 1, 1); const p = ctx.getImageData(0, 0, 1, 1).data; return `rgb(${p[0]},${p[1]},${p[2]})`; };
    setPalette({ plane: resolve('--plane'), line: resolve('--pair-line'), other: resolve('--pair-other') });
  }, []);
  const segments = pairSegments(kind);
  function zoom(factor: number) { const c = controls.current; if (!c) return; c.object.position.sub(c.target).multiplyScalar(factor).add(c.target); c.update(); }
  return <div className="geometry-view compact line-pair-view" aria-label={`Mô hình hai đường thẳng ${kind}`}>
    {palette && <Canvas camera={{ position: [6, 7, 8], fov: 2 * Math.atan(Math.tan(21 * Math.PI / 180) / 1.3) * 180 / Math.PI }} dpr={[1, 1.5]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 4.5]} /><meshBasicMaterial color={palette.plane} transparent opacity={0.16} side={2} depthWrite={false} /></mesh>
      <Line points={[[-3, 0, -2.25], [3, 0, -2.25], [3, 0, 2.25], [-3, 0, 2.25], [-3, 0, -2.25]]} color={palette.plane} lineWidth={1.3} />
      {segments.map((segment, i) => <Line key={i} points={segment} color={i ? palette.other : palette.line} lineWidth={kind === 'coincident' ? i ? 2 : 6 : 3} />)}
      <PlaneNamePosition label={planeName} />
      {segments.map((segment, i) => <PlaneNamePosition key={i} label={i ? otherName : lineName} position={[segment[1][0] + 0.2, segment[1][1] + 0.12, segment[1][2] + (kind === 'coincident' && i ? 0.65 : 0)]} />)}
      {kind === 'intersecting' && <mesh position={[0, 0, -0.6]}><sphereGeometry args={[0.065]} /><meshBasicMaterial color={palette.other} /></mesh>}
      <OrbitControls ref={controls} enablePan={false} minDistance={5} maxDistance={18} />
      <InitialView kind={kind} controls={controls} />
    </Canvas>}
    <div ref={planeName} className="pair-math-label pair-plane-label absolute left-0 top-0"><MathText text="$(P)$" /></div>
    <div ref={lineName} className="pair-math-label pair-line-label absolute left-0 top-0"><MathText text="$d$" /></div>
    <div ref={otherName} className="pair-math-label pair-other-label absolute left-0 top-0"><MathText text={'$d^{\\prime}$'} /></div>
    <div className="scene-tools"><Button size="icon" variant="ghost" aria-label="Phóng to" title="Phóng to" onClick={() => zoom(0.85)}><Plus /></Button><Button size="icon" variant="ghost" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => zoom(1.15)}><Minus /></Button><Button size="icon" variant="ghost" aria-label="Góc nhìn ban đầu" title="Góc nhìn ban đầu" onClick={() => controls.current?.reset()}><RotateCcw /></Button></div>
  </div>;
}