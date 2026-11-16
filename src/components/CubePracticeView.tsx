import { useEffect, useRef, useState } from 'react';
import { DoubleSide } from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { Line2, OrbitControls as Controls } from 'three-stdlib';
import { CUBE_LINES, CUBE_VERTICES, cubeLineHidden, type CubePoint } from '@/lib/cube-practice';
import { PlaneNamePosition } from './PlaneNamePosition';
import { MathText } from './MathText';
import { Button } from './ui/button';
import { Minus, Plus, RotateCcw } from 'lucide-react';
function CubeLine({ from,to,color }: {from:string;to:string;color:string}) {
 const line=useRef<Line2|null>(null);
 const a=CUBE_VERTICES[from],b=CUBE_VERTICES[to];
 useFrame(({camera})=>{
  if(!line.current || !a || !b) return;
  const hidden=cubeLineHidden(a,b,[camera.position.x,camera.position.y,camera.position.z]);
  if(line.current.material.dashed!==hidden) {line.current.material.dashed=hidden;line.current.material.needsUpdate=true;line.current.computeLineDistances();}
 });
 if(!a || !b) return null;
 return <Line ref={line} points={[a,b]} color={color} lineWidth={3.2} dashed dashSize={0.1} gapSize={0.08} />;
}
// Label anchors sit just outside each vertex, away from the edges meeting there in the default view.
const LABEL_POSITIONS:Record<string,CubePoint>={M:[-1.22,-1.18,1.2],N:[1.12,-1.3,1.2],P:[1.32,-1.08,-1],Q:[-1.34,-0.98,-1.05],"M'":[-1.25,1.12,1.15],"N'":[1.3,1.0,1.2],"P'":[1.28,1.2,-1.05],"Q'":[-1.05,1.3,-1.1]};
// Labels stay in the ordinary React tree; the scene only projects their positions.
function Labels({labels}:{labels:React.RefObject<(HTMLDivElement|null)[]>}) {
 return <>{Object.entries(CUBE_VERTICES).map(([name,v],i)=><ProjectedLabel key={name} index={i} labels={labels} position={LABEL_POSITIONS[name] ?? v}/>)}</>;
}
function ProjectedLabel({index,labels,position}:{index:number;labels:React.RefObject<(HTMLDivElement|null)[]>;position:CubePoint}) {
 const ref=useRef<HTMLDivElement|null>(null);
 ref.current=labels.current[index] ?? null;
 return <PlaneNamePosition label={ref} position={position}/>;
}
/** Translucent faces and vertex dots make the cube read as a solid; they never hide its dashed edges. */
function CubeBody({face,vertex}:{face:string;vertex:string}) {
 return <><mesh renderOrder={-1}><boxGeometry args={[2,2,2]}/><meshBasicMaterial color={face} transparent opacity={0.16} depthWrite={false} side={DoubleSide}/></mesh>
  {Object.entries(CUBE_VERTICES).map(([name,v])=><mesh key={name} position={v}><sphereGeometry args={[0.055,16,12]}/><meshBasicMaterial color={vertex}/></mesh>)}</>;
}
// Front-right, slightly above: every edge and both diagonals project apart. A low 25° field of view from farther away keeps perspective weak, so the equal edges and square faces read as a true cube at the same on-screen size.
const CAMERA_POSITION:CubePoint=[3.5,4.0,9.4];
const CAMERA_FOV=25;
function Ready({onReady}:{onReady:()=>void}) {const sent=useRef(false);useFrame(()=>{if(!sent.current){sent.current=true;requestAnimationFrame(onReady);}});return null;}
export default function CubePracticeView() {
 const controls=useRef<Controls|null>(null),labels=useRef<(HTMLDivElement|null)[]>([]);
 const [palette,setPalette]=useState<{edge:string;diagonal:string;face:string;vertex:string}|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{const css=getComputedStyle(document.documentElement),ctx=document.createElement('canvas').getContext('2d');if(!ctx)return;const color=(token:string)=>{ctx.fillStyle=css.getPropertyValue(token).trim();ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return `rgb(${p[0]},${p[1]},${p[2]})`;};setPalette({edge:color('--cube-edge'),diagonal:color('--cube-diagonal'),face:color('--cube-face'),vertex:color('--foreground')});},[]);
 function zoom(factor:number){const c=controls.current;if(!c)return;c.object.position.sub(c.target).multiplyScalar(factor).add(c.target);c.update();}
 return <div className="cube-practice-view" data-scene-ready={ready || undefined} aria-label="Mô hình lập phương MNPQ M′N′P′Q′">
  {palette && <Canvas camera={{position:CAMERA_POSITION,fov:CAMERA_FOV}} dpr={[1,1.5]}>
   {CUBE_LINES.map(([a,b],i)=><CubeLine key={a+b} from={a} to={b} color={i<12?palette.edge:palette.diagonal}/>)}
   <CubeBody face={palette.face} vertex={palette.vertex}/><Labels labels={labels}/><OrbitControls ref={controls} enablePan={false} minDistance={4} maxDistance={20}/><Ready onReady={()=>setReady(true)}/>
  </Canvas>}
  {Object.keys(CUBE_VERTICES).map((name,i)=><div key={name} ref={el=>{labels.current[i]=el;}} className="pair-math-label absolute left-0 top-0"><MathText text={`$${name}$`}/></div>)}
  <div className="scene-tools"><Button variant="ghost" size="icon" title="Phóng to" aria-label="Phóng to" onClick={()=>zoom(0.85)}><Plus/></Button><Button variant="ghost" size="icon" title="Thu nhỏ" aria-label="Thu nhỏ" onClick={()=>zoom(1.15)}><Minus/></Button><Button variant="ghost" size="icon" title="Góc nhìn ban đầu" aria-label="Góc nhìn ban đầu" onClick={()=>controls.current?.reset()}><RotateCcw/></Button></div>
 </div>;
}