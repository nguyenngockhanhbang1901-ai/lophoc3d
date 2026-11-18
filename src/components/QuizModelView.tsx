import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { Line2, OrbitControls as Controls } from 'three-stdlib';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { edgeHidden, faceFacesCamera, PYRAMID, SOLID_HIGHLIGHT, solidEdges, solidPoint, TETRAHEDRON, type P3, type Solid } from '@/lib/solid-models';
import type { QuizModel } from '@/lib/quiz-race';
import { PlaneNamePosition } from './PlaneNamePosition';
import { MathText } from './MathText';
import { Button } from './ui/button';

const SOLIDS: Record<QuizModel, Solid> = { tetrahedron: TETRAHEDRON, pyramid: PYRAMID };
type Palette = { edge: string; face: string; vertex: string; highlight: string };

/** Solid when seen, dashed when hidden: decided every frame from the live camera by the pure solid-model math. */
function SolidLine({ a, b, color, width, hidden }: { a: P3; b: P3; color: string; width: number; hidden: (camera: P3) => boolean }) {
  const line = useRef<Line2 | null>(null);
  useFrame(({ camera }) => {
    if (!line.current) return;
    const dashed = hidden([camera.position.x, camera.position.y, camera.position.z]);
    if (line.current.material.dashed !== dashed) { line.current.material.dashed = dashed; line.current.material.needsUpdate = true; line.current.computeLineDistances(); }
  });
  return <Line ref={line} points={[a, b]} color={color} lineWidth={width} dashed dashSize={0.1} gapSize={0.08} />;
}
function Faces({ solid, color }: { solid: Solid; color: string }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const face of solid.faces) {
      const pts = face.map(n => solid.vertices[n]!);
      for (let i = 1; i < pts.length - 1; i++) positions.push(...pts[0]!, ...pts[i]!, ...pts[i + 1]!);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(positions, 3)); return g;
  }, [solid]);
  return <mesh geometry={geometry} renderOrder={-1}><meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} side={DoubleSide} /></mesh>;
}
function Ready({ onReady }: { onReady: () => void }) { const sent = useRef(false); useFrame(() => { if (!sent.current) { sent.current = true; requestAnimationFrame(onReady); } }); return null; }
const CAMERA: P3 = [3.2, 2.4, 9.2];
const TARGET: P3 = [0, 0.5, 0.1];

export default function QuizModelView({ model }: { model: QuizModel }) {
  const solid = SOLIDS[model];
  const [hiA, hiB] = SOLID_HIGHLIGHT[model];
  const controls = useRef<Controls | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement), ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    const color = (token: string) => { ctx.fillStyle = css.getPropertyValue(token).trim(); ctx.fillRect(0, 0, 1, 1); const p = ctx.getImageData(0, 0, 1, 1).data; return `rgb(${p[0]},${p[1]},${p[2]})`; };
    setPalette({ edge: color('--cube-edge'), face: color('--cube-face'), vertex: color('--foreground'), highlight: color('--line') });
  }, []);
  const edges = useMemo(() => solidEdges(solid), [solid]);
  const names = Object.keys(solid.labels);
  // One stable ref per label: the scene positions these ordinary React elements from the live camera.
  const labelRefs = useMemo(() => Object.fromEntries(names.map(n => [n, { current: null as HTMLDivElement | null }])), [solid]);
  function zoom(factor: number) { const c = controls.current; if (!c) return; c.object.position.sub(c.target).multiplyScalar(factor).add(c.target); c.update(); }
  const isHighlight = (a: string, b: string) => (a === hiA && b === hiB) || (a === hiB && b === hiA);
  return <div className="quiz-model-view" data-scene-ready={ready || undefined} aria-label={model === 'tetrahedron' ? 'Mô hình tứ diện ABCD' : 'Mô hình hình chóp S.ABCD'}>
    {palette && <Canvas camera={{ position: CAMERA, fov: 30 }} dpr={[1, 1.5]}>
      <Faces solid={solid} color={palette.face} />
      {edges.map(e => <SolidLine key={e.from + e.to} a={solid.vertices[e.from]!} b={solid.vertices[e.to]!} color={isHighlight(e.from, e.to) ? palette.highlight : palette.edge} width={isHighlight(e.from, e.to) ? 4.6 : 3} hidden={camera => edgeHidden(solid, e.faces, camera)} />)}
      {solid.segments.map(s => <SolidLine key={s.from + s.to} a={solidPoint(solid, s.from)!} b={solidPoint(solid, s.to)!} color={s.highlight ? palette.highlight : palette.edge} width={s.highlight ? 4.6 : 3} hidden={camera => !faceFacesCamera(solid, s.face, camera)} />)}
      {[...Object.values(solid.vertices), ...Object.values(solid.points)].map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[0.06, 16, 12]} /><meshBasicMaterial color={palette.vertex} /></mesh>)}
      {names.map(n => <PlaneNamePosition key={n} label={labelRefs[n]!} position={solid.labels[n]!} />)}
      <OrbitControls ref={controls} target={TARGET} enablePan={false} minDistance={5} maxDistance={20} />
      <Ready onReady={() => setReady(true)} />
    </Canvas>}
    {names.map(n => <div key={n} ref={labelRefs[n]} className="pair-math-label absolute left-0 top-0"><MathText text={`$${n}$`} /></div>)}
    <div className="scene-tools"><Button variant="ghost" size="icon" title="Phóng to" aria-label="Phóng to" onClick={() => zoom(0.85)}><Plus /></Button><Button variant="ghost" size="icon" title="Thu nhỏ" aria-label="Thu nhỏ" onClick={() => zoom(1.15)}><Minus /></Button><Button variant="ghost" size="icon" title="Góc nhìn ban đầu" aria-label="Góc nhìn ban đầu" onClick={() => controls.current?.reset()}><RotateCcw /></Button></div>
  </div>;
}
