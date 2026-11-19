import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { MathText } from './MathText';
import { PlaneNamePosition, placeLabel } from './PlaneNamePosition';
import { CanvasTexture, SRGBColorSpace, Vector3, type Group, type PerspectiveCamera } from 'three';
import type { OrbitControls as Controls, Line2 } from 'three-stdlib';
import { Button } from '@/components/ui/button';
import { Plus, Minus, RotateCcw, Maximize, Play, Pause } from 'lucide-react';
import { containedLinePoints, animatedLine, advanceMotion, motionIsValid, lineSegment, segmentInsidePlane, splitByVisibility, CAMERA_VIEWS, CAMERA_TARGETS, type CaseIndex, type MotionSpeed, type Segment, type Vec3 } from '@/lib/geometry';
const SLOTS = [0, 1, 2, 3];
function draw(lines: (Line2 | null)[], segments: Segment[], dashed: boolean) {
  lines.forEach((l, i) => { if (!l) return; const s = segments[i]; l.visible = Boolean(s); if (!s) return; l.geometry.setPositions([...s[0], ...s[1]]); if (dashed) l.computeLineDistances(); });
}

import { fitCaseView, modelPoints, type FitConfig } from '@/lib/geometry-fit';
type Palette = { plane: string; line: string; foreground: string; border: string };
/** HTML labels for d, M, A, B — used by framed views so they match the (α) label's size. */
type NameLabels = { d: HTMLDivElement | null; M: HTMLDivElement | null; A: HTMLDivElement | null; B: HTMLDivElement | null };
function Label({ text, position, color, size = 1 }: { text: string; position: [number,number,number]; color: string; size?: number }) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => { const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.font = 'italic 44px Georgia'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text,64,48); const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; setTexture(map); return () => map.dispose(); }, [text,color]);
  return texture ? <sprite position={position} scale={[0.85 * size,0.425 * size,1]}><spriteMaterial map={texture} transparent depthTest={false} /></sprite> : null;
}
function Scene({ index, playing, speed, resetVersion, palette, controls, onReady, planeName, fit, names }: { index: CaseIndex; playing: boolean; speed: MotionSpeed; resetVersion: number; palette: Palette; controls: React.RefObject<Controls | null>; onReady: () => void; planeName: React.RefObject<HTMLDivElement | null>; fit?: FitConfig | undefined; names?: React.RefObject<NameLabels> | undefined }) {
  const projected = useMemo(() => new Vector3(), []);
  const phase = useRef(0);
  const solid = useRef<(Line2 | null)[]>([]);
  const dashes = useRef<(Line2 | null)[]>([]);
  const marker = useRef<Group | null>(null);
  const label = useRef<Group | null>(null);
  const pointA = useRef<Group | null>(null);
  const pointB = useRef<Group | null>(null);
  const marked = useRef(false);
  useEffect(() => { phase.current = 0; }, [index,resetVersion]);
  useFrame((state, delta) => {
    phase.current = advanceMotion(phase.current,delta,playing,speed);
    const { origin, direction } = animatedLine(index,phase.current);
    if (!motionIsValid(index,origin,direction)) throw new Error('Quan hệ đường thẳng và mặt phẳng không hợp lệ');
    const [a, b] = lineSegment(index, origin, direction);
    if (index === 2 && !segmentInsidePlane([a, b])) throw new Error('Đường thẳng d phải nằm trong mặt phẳng (P)');
    const cam: Vec3 = [state.camera.position.x, state.camera.position.y, state.camera.position.z];
    // Recomputed every frame from the live camera, so dashes follow orbiting exactly.
    const parts = splitByVisibility(a, b, cam);
    draw(solid.current, parts.visible, false); draw(dashes.current, parts.hidden, true);
    marker.current?.position.set(...origin);
    const contained = index === 2 ? containedLinePoints(origin, direction) : null;
    if (contained) { pointA.current?.position.set(...contained[0]); pointB.current?.position.set(...contained[1]); }
    label.current?.position.set(b[0] + 0.25, b[1] + 0.2, b[2]);
    const html = names?.current;
    if (html) {
      // Same world anchors as the original 3D names (they move rigidly with d); refresh the camera first so names never trail the drawing.
      state.camera.updateMatrixWorld();
      placeLabel(html.d, [b[0] + 0.25, b[1] + 0.2, b[2]], state.camera, state.size, projected);
      if (index === 0) placeLabel(html.M, [origin[0] + 0.35, origin[1] + 0.12, origin[2]], state.camera, state.size, projected);
      if (contained) { placeLabel(html.A, [contained[0][0], contained[0][1] + 0.42, contained[0][2]], state.camera, state.size, projected); placeLabel(html.B, [contained[1][0], contained[1][1] + 0.42, contained[1][2]], state.camera, state.size, projected); }
    }
    if (import.meta.env.DEV) { const element = state.gl.domElement; element.dataset['motionPhase'] = String(phase.current); element.dataset['motionOrigin'] = JSON.stringify(origin); element.dataset['motionDirection'] = JSON.stringify(direction); element.dataset['hiddenParts'] = String(parts.hidden.length); element.dataset['segment'] = JSON.stringify([a, b]); }
    if (!marked.current) { marked.current = true; requestAnimationFrame(onReady); }
  });
  const { camera, size } = useThree();
  const points = useMemo(() => fit ? modelPoints(index) : null, [fit, index]);
  const aspect = fit && size.height > 0 ? size.width / size.height : 0;
  useEffect(() => {
    const c = controls.current;
    let position = CAMERA_VIEWS[index], target = CAMERA_TARGETS[index];
    // Framed views (Hoạt động 2) re-aim the camera and narrow its field of view from the live frame shape; the model itself never changes.
    if (fit && points && aspect > 0) { const v = fitCaseView(index, aspect, fit, points); position = v.position; target = v.target; (camera as PerspectiveCamera).fov = v.fov; camera.updateProjectionMatrix(); }
    camera.position.set(...position); camera.lookAt(...target);
    if (c) { c.target.set(...target); c.update(); c.saveState(); }
  }, [index, camera, controls, fit, points, aspect]);
  return <>
    <ambientLight intensity={1.5} />
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6.1, 4.5]} /><meshBasicMaterial color={palette.plane} transparent opacity={0.2} side={2} depthWrite={false} /></mesh>
    {Array.from({ length: 9 }, (_, i) => <Line key={`x${i}`} points={[[-3, 0, -2 + i * 0.5], [3, 0, -2 + i * 0.5]]} color={palette.plane} transparent opacity={0.19} lineWidth={0.65} />)}
    {Array.from({ length: 13 }, (_, i) => <Line key={`z${i}`} points={[[-3 + i * 0.5, 0, -2.25], [-3 + i * 0.5, 0, 2.25]]} color={palette.plane} transparent opacity={0.19} lineWidth={0.65} />)}
    <Line points={[[-3,0,-2.25],[3,0,-2.25],[3,0,2.25],[-3,0,2.25],[-3,0,-2.25]]} color={palette.plane} lineWidth={1.1} transparent opacity={0.6} />
    {SLOTS.map(i => <Line key={`s${i}`} ref={(l: Line2 | null) => { solid.current[i] = l; }} points={[[0,0,0],[0,0,0.01]]} color={palette.line} lineWidth={3} renderOrder={2} />)}
    {SLOTS.map(i => <Line key={`h${i}`} ref={(l: Line2 | null) => { dashes.current[i] = l; }} points={[[0,0,0],[0,0,0.01]]} color={palette.line} lineWidth={2} dashed dashSize={0.14} gapSize={0.1} transparent opacity={0.85} />)}
    <group ref={label}>{!names && <Label text="d" position={[0,0,0]} color={palette.line} />}</group>
    <PlaneNamePosition label={planeName} />
    {index === 0 && <group ref={marker}><mesh><sphereGeometry args={[0.07,16,16]} /><meshBasicMaterial color={palette.foreground} /></mesh>{!names && <Label text="M" position={[0.35,0.12,0]} color={palette.foreground} />}</group>}
    {index === 2 && ([['A', pointA], ['B', pointB]] as const).map(([name, ref]) => <group key={name} ref={ref}><mesh><sphereGeometry args={[0.07,16,16]} /><meshBasicMaterial color={palette.foreground} /></mesh>{!names && <Label text={name} position={[0,0.42,0]} color={palette.foreground} size={1.5} />}</group>)}
    <OrbitControls ref={controls} enablePan={false} minDistance={4} maxDistance={16} maxPolarAngle={Math.PI} />
  </>;
}
/** `lineToken` names the CSS colour token for line d and its label (default `--line`). */
export default function GeometryView({ index, compact = false, hideLegend = false, planeLabel = '(P)', viewMagnification = 1, lineToken = '--line', fit }: { index: CaseIndex; compact?: boolean; hideLegend?: boolean; planeLabel?: string; viewMagnification?: number; lineToken?: string; fit?: FitConfig }) {
  const planeName = useRef<HTMLDivElement | null>(null);
  const names = useRef<NameLabels>({ d: null, M: null, A: null, B: null });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<MotionSpeed>('normal');
  const [resetVersion,setResetVersion] = useState(0);
  useEffect(() => { setPlaying(true); setResetVersion(v => v+1); }, [index]);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [ready, setReady] = useState(false);
  const controls = useRef<Controls | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const markReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    // Three.js cannot parse OKLCH; resolve semantic CSS colors through the browser's sRGB canvas.
    const swatch = document.createElement('canvas').getContext('2d');
    if (!swatch) return;
    const resolve = (token: string) => { swatch.fillStyle = css.getPropertyValue(token).trim(); swatch.fillRect(0,0,1,1); const p = swatch.getImageData(0,0,1,1).data; return `rgb(${p[0]},${p[1]},${p[2]})`; };
    setPalette({ plane: resolve('--plane'), line: resolve(lineToken), foreground: resolve('--foreground'), border: resolve('--border') });
  }, [lineToken]);
  function zoom(factor: number) { const c = controls.current; if (!c) return; c.object.position.sub(c.target).multiplyScalar(factor).add(c.target); c.update(); }
  // Framed views keep the zoom buttons below the frame, so they never cover any part of the model.
  const tools = <div className={`scene-tools ${fit ? 'scene-tools-inline' : ''}`}>
        <Button variant="ghost" size="icon" title="Phóng to" aria-label="Phóng to" onClick={() => zoom(0.85)}><Plus /></Button>
        <Button variant="ghost" size="icon" title="Thu nhỏ" aria-label="Thu nhỏ" onClick={() => zoom(1.15)}><Minus /></Button>
        <Button variant="ghost" size="icon" title="Góc nhìn ban đầu" aria-label="Góc nhìn ban đầu" onClick={() => { controls.current?.reset(); }}><RotateCcw /></Button>
        {!compact && <Button variant="ghost" size="icon" title="Toàn màn hình" aria-label="Toàn màn hình" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void wrapper.current?.requestFullscreen(); }}><Maximize /></Button>}
  </div>;
  return <>
    <div ref={wrapper} className={`geometry-view ${compact ? 'compact' : ''}`} data-scene-ready={ready || undefined}>
      {!hideLegend && <div className="scene-top"><span className="legend"><i />Đường thẳng d</span><span className="legend"><i className="plane" />Mặt phẳng (P)</span><span className="legend">Nét đứt: phần bị che khuất</span></div>}
      {palette && <Canvas camera={{ position: CAMERA_VIEWS[index], fov: 2 * Math.atan(Math.tan(20 * Math.PI / 180) / viewMagnification) * 180 / Math.PI }} frameloop="always" dpr={[1,1.5]}><Scene index={index} playing={playing} speed={speed} resetVersion={resetVersion} palette={palette} controls={controls} onReady={markReady} planeName={planeName} fit={fit} names={fit ? names : undefined} /></Canvas>}
      <div ref={planeName} className="pair-math-label pair-plane-label absolute left-0 top-0"><MathText text={planeLabel === 'α' ? '$(\\alpha)$' : `$${planeLabel}$`} /></div>
      {fit && <>
        <div ref={el => { names.current.d = el; }} className="pair-math-label absolute left-0 top-0" style={{ color: `var(${lineToken})`, visibility: 'hidden' }}><MathText text="$d$" /></div>
        {index === 0 && <div ref={el => { names.current.M = el; }} className="pair-math-label absolute left-0 top-0 text-foreground" style={{ visibility: 'hidden' }}><MathText text="$M$" /></div>}
        {index === 2 && (['A', 'B'] as const).map(name => <div key={name} ref={el => { names.current[name] = el; }} className="pair-math-label absolute left-0 top-0 text-foreground" style={{ visibility: 'hidden' }}><MathText text={`$${name}$`} /></div>)}
      </>}
      {!fit && tools}
    </div>
    <div className="motion-row">
      <Button variant="outline" size="icon" title="PLAY · Bắt đầu" aria-label="PLAY" aria-pressed={playing} disabled={playing} onClick={() => setPlaying(true)}><Play /></Button>
      <Button variant="outline" size="icon" title="PAUSE · Tạm dừng" aria-label="PAUSE" aria-pressed={!playing} disabled={!playing} onClick={() => setPlaying(false)}><Pause /></Button>
      <Button variant="outline" size="icon" title="RESET · Vị trí ban đầu" aria-label="RESET" onClick={() => { setResetVersion(v => v+1); setPlaying(false); }}><RotateCcw /></Button>
      <select aria-label="Tốc độ chuyển động" value={speed} onChange={e => setSpeed(e.target.value as MotionSpeed)} className="min-w-0 rounded-md border border-input bg-background p-2 text-xs"><option value="slow">Chậm</option><option value="normal">Bình thường</option><option value="fast">Nhanh</option></select>
      {fit && tools}
    </div>
  </>;
}