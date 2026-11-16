import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferGeometry, CatmullRomCurve3, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { OrbitControls as Controls } from 'three-stdlib';
import { ArrowLeft, ArrowRight, Box, Check, ChevronLeft, Clock, Minus, Plus, RotateCcw } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useEnterReview } from '@/hooks/use-enter-review';
import { reveal } from '@/lib/reveal';
import { fitGoalView } from '@/lib/goal-camera';
import { getGoalSteelMembers, goalProfileTop, GOAL_DIMENSIONS, GOAL_DISPLAY_SCALE, type Point3 } from '@/lib/goal-model';
import { canAdvanceGoal, GOAL_QUESTIONS } from '@/lib/goal-questions';
import { remainingMs, timerTone, type Timing } from '@/lib/timer';

type ScenePalette = { sky: string; grass: string; grassDark: string; grassLight: string; steel: string; net: string; highlight: string };

function useScenePalette() {
  const [palette, setPalette] = useState<ScenePalette | null>(null);
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const resolve = (token: string) => {
      context.fillStyle = styles.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    };
    setPalette({
      sky: resolve('--goal-sky'), grass: resolve('--goal-grass'),
      grassDark: resolve('--goal-grass-dark'), grassLight: resolve('--goal-grass-light'),
      steel: resolve('--goal-steel'), net: resolve('--goal-net'), highlight: resolve('--goal-highlight'),
    });
  }, []);
  return palette;
}

function Grass({ palette }: { palette: ScenePalette }) {
  // Plain, uniform turf; seen from below it stays visible as a faint translucent plane.
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(({ camera }) => {
    const m = material.current;
    if (!m) return;
    const below = camera.position.y < 0;
    m.opacity = below ? 0.35 : 1;
    m.depthWrite = !below;
  });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
    <circleGeometry args={[90, 96]} />
    <meshStandardMaterial ref={material} color={palette.grass} roughness={1} metalness={0} side={DoubleSide} transparent />
  </mesh>;
}

function SteelMember({ start, end, radius, color, highlighted, highlightColor }: { start: Point3; end: Point3; radius: number; color: string; highlighted: boolean; highlightColor: string }) {
  const material = useRef<MeshPhysicalMaterial>(null);
  const from = useMemo(() => new Vector3(...start), [start]);
  const to = useMemo(() => new Vector3(...end), [end]);
  const center = useMemo(() => from.clone().add(to).multiplyScalar(0.5), [from, to]);
  const direction = useMemo(() => to.clone().sub(from), [from, to]);
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), [direction]);
  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.emissiveIntensity = highlighted ? 1.2 + (Math.sin(clock.elapsedTime * 7) + 1) * 0.85 : 0;
  });
  return <>
    <mesh position={center} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, direction.length(), 24, 1]} />
      <meshPhysicalMaterial ref={material} color={highlighted ? highlightColor : color} emissive={highlightColor} emissiveIntensity={0} metalness={0.1} roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.2} toneMapped={false} />
    </mesh>
    {highlighted && <mesh position={center} quaternion={quaternion} scale={[1.8, 1.005, 1.8]}>
      <cylinderGeometry args={[radius, radius, direction.length(), 24, 1]} />
      <meshBasicMaterial color={highlightColor} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
    </mesh>}
  </>;
}

function createNetGeometry() {
  const { width, depth, netRadius } = GOAL_DIMENSIONS;
  const half = width / 2 - 0.08;
  const front = depth / 2 - 0.1;
  const back = -depth / 2 + 0.08;
  const bottom = 0.06;
  const top = (z: number) => Math.max(bottom, goalProfileTop(z, 0.1));
  const sections: BufferGeometry[] = [];
  const addStrand = (points: Vector3[]) => sections.push(new TubeGeometry(new CatmullRomCurve3(points), 12, netRadius, 4, false));
  const steps = 12;
  // Profile path from front-top along the roof, then down the sloping back to the ground.
  const bendZ = depth / 2 - GOAL_DIMENSIONS.topDepth;
  const roofLen = front - bendZ;
  const slopeLen = Math.hypot(bendZ - back, top(bendZ) - bottom);
  const total = roofLen + slopeLen;
  const along = (s: number): [number, number] => {
    const d = s * total;
    if (d <= roofLen) return [front - d, top(front)];
    const t = (d - roofLen) / slopeLen;
    return [bendZ + (back - bendZ) * t, top(bendZ) + (bottom - top(bendZ)) * t];
  };

  // Sides
  for (const side of [-1, 1]) {
    for (let column = 0; column <= 7; column++) {
      const z = front + (back - front) * (column / 7);
      const h = top(z);
      if (h - bottom < 0.05) continue;
      addStrand(Array.from({ length: steps + 1 }, (_, i) => {
        const v = i / steps;
        return new Vector3(side * (half + 0.03 * Math.sin(Math.PI * v)), bottom + (h - bottom) * v, z);
      }));
    }
    for (let row = 1; row <= 6; row++) {
      const y = bottom + (top(front) - bottom) * (row / 7);
      const points: Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const z = front + (back - front) * (i / steps);
        if (top(z) < y) break;
        points.push(new Vector3(side * half, y, z));
      }
      if (points.length > 1) addStrand(points);
    }
  }
  // Roof + sloping back: one sagging sheet across the width.
  const sag = (s: number) => 0.14 * Math.sin(Math.PI * s);
  for (let row = 0; row <= 12; row++) {
    const [z, y] = along(row / 12);
    addStrand(Array.from({ length: steps + 1 }, (_, i) => {
      const u = i / steps;
      return new Vector3(-half + 2 * half * u, y - sag(row / 12) * 0.6 * Math.sin(Math.PI * u), z - sag(row / 12) * 0.4 * Math.sin(Math.PI * u));
    }));
  }
  for (let column = 0; column <= 20; column++) {
    const x = -half + 2 * half * (column / 20);
    const edge = Math.sin(Math.PI * (column / 20));
    addStrand(Array.from({ length: steps + 1 }, (_, i) => {
      const s = i / steps;
      const [z, y] = along(s);
      return new Vector3(x, y - sag(s) * 0.6 * edge, z - sag(s) * 0.4 * edge);
    }));
  }

  const merged = mergeGeometries(sections, false) ?? new BufferGeometry();
  sections.forEach((geometry) => geometry.dispose());
  return merged;
}

function Net({ color }: { color: string }) {
  const geometry = useMemo(createNetGeometry, []);
  const material = useMemo(() => new MeshPhysicalMaterial({ color, roughness: 0.7, metalness: 0, side: DoubleSide }), [color]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} />;
}

function FitGoalCamera({ controls }: { controls: React.RefObject<Controls | null> }) {
  const { camera, size } = useThree();
  const fitted = useRef('');
  useFrame(() => {
    const key = `${size.width}x${size.height}:${controls.current ? 1 : 0}`;
    if (fitted.current === key) return;
    fitted.current = key;
    // Every screen: whole goal centred with a margin, 3/4 view from a low eye height (horizon at one third of the goal).
    const view = fitGoalView(size.width / Math.max(size.height, 1), 44);
    const target = new Vector3(...view.target);
    camera.position.set(...view.position);
    camera.lookAt(target);
    if (controls.current) { controls.current.target.copy(target); controls.current.update(); controls.current.saveState(); }
  });
  return null;
}

function GoalScene({ palette, highlightedMember }: { palette: ScenePalette; highlightedMember: string | null }) {
  const members = useMemo(getGoalSteelMembers, []);
  return <>
    <color attach="background" args={[palette.sky]} />
    <fog attach="fog" args={[palette.sky, 36, 110]} />
    {/* Soft, even, shadow-free lighting: depth comes from perspective, not cast shadows. */}
    <hemisphereLight args={[palette.sky, palette.grass, 1.6]} />
    <ambientLight intensity={0.75} />
    <directionalLight position={[-6, 10, 8]} intensity={0.9} />
    <directionalLight position={[8, 6, -6]} intensity={0.45} />
    <Grass palette={palette} />
    <group scale={GOAL_DISPLAY_SCALE}>
      {members.map((member) => <SteelMember key={member.name} start={member.start} end={member.end} radius={member.radius} color={palette.steel} highlighted={member.name === highlightedMember} highlightColor={palette.highlight} />)}
      <Net color={palette.net} />
    </group>
  </>;
}

export function GoalModelViewer({ highlightedMember, questionNumber, compact = false }: { highlightedMember: string | null; questionNumber: number; compact?: boolean }) {
  const palette = useScenePalette();
  const [ready, setReady] = useState(false);
  const controls = useRef<Controls | null>(null);
  const zoom = (factor: number) => {
    const current = controls.current;
    if (!current) return;
    current.object.position.sub(current.target).multiplyScalar(factor).add(current.target);
    current.update();
  };
  return <section className={`goal-viewer ${compact ? 'goal-viewer-compact' : ''}`} aria-label="Mô hình khung thành bóng đá 3D" data-highlighted-member={highlightedMember ?? ''} data-question={questionNumber}>
      <div className="goal-legend"><span><i className="goal-legend-steel" />Khung thép sơn trắng</span><span><i className="goal-legend-net" />Lưới sợi</span><span><i className="goal-legend-highlight" />Thanh đang quan sát</span></div>
      {palette && <Canvas data-testid="goal-canvas" dpr={[1, 1.5]} camera={{ position: [6.4, 2, 7.8], fov: 44, near: 0.1, far: 150 }} onCreated={() => setReady(true)}>
        <GoalScene palette={palette} highlightedMember={highlightedMember} />
        <OrbitControls ref={controls} makeDefault target={[0, GOAL_DIMENSIONS.height * GOAL_DISPLAY_SCALE / 2, 0]} enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.72} minDistance={4.2 * GOAL_DISPLAY_SCALE} maxDistance={100} minPolarAngle={0} maxPolarAngle={Math.PI} />
        <FitGoalCamera controls={controls} />
      </Canvas>}
      <div className="goal-view-status"><span className="goal-status-dot" />{ready ? 'Mô hình 3D sẵn sàng' : 'Đang dựng mô hình 3D'}</div>
      <div className="goal-controls">
        <Button variant="ghost" size="icon" title="Phóng to" aria-label="Phóng to" onClick={() => zoom(0.82)}><Plus /></Button>
        <Button variant="ghost" size="icon" title="Thu nhỏ" aria-label="Thu nhỏ" onClick={() => zoom(1.22)}><Minus /></Button>
        <span className="goal-control-divider" />
        <Button variant="ghost" size="icon" title="Đưa về góc nhìn ban đầu" aria-label="Đưa về góc nhìn ban đầu" onClick={() => controls.current?.reset()}><RotateCcw /></Button>
      </div>
    </section>;
}

const TEACHER_PROMPT = 'Quan sát mô hình và em hãy trả lời các câu hỏi sau?';

function TeacherGoalPreview({ autoQuestion }: { autoQuestion?: number | null | undefined }) {
  const review = useEnterReview(GOAL_QUESTIONS.length + 1);
  // While the work runs, the shared screen follows the question every team has reached.
  useEffect(() => { if (autoQuestion != null) review.select(autoQuestion + 1); }, [autoQuestion]);
  const selected = review.selected === 0 ? null : review.selected - 1;
  const question = selected === null ? null : GOAL_QUESTIONS[selected];
  return <div className="goal-content goal-content-embedded goal-teacher-preview">
    <section className="goal-question-workspace goal-teacher-workspace" aria-labelledby="goal-teacher-heading">
      <div className="goal-question-intro"><div><p className="eyebrow">HOẠT ĐỘNG 1 · QUAN SÁT</p><h2 id="goal-teacher-heading">{TEACHER_PROMPT}</h2></div></div>
      <nav className="goal-question-nav goal-teacher-nav" aria-label="Danh sách câu hỏi">
        {GOAL_QUESTIONS.map((item, index) => <Button key={`${item.member}-${index}`} variant="ghost" className={`goal-question-step ${index === selected ? 'selected' : ''}`} aria-label={`Câu ${index + 1}`} aria-current={index === selected ? 'step' : undefined} onClick={() => review.select(index + 1)}><span className="case-number">{index + 1}</span><strong>Câu {index + 1}</strong></Button>)}
      </nav>
      <p className="goal-teacher-prompt" role="status" {...reveal(question !== null)}><strong>Câu {(selected ?? 0) + 1}:</strong> {(question ?? GOAL_QUESTIONS[0])?.prompt}</p>
    </section>
    <GoalModelViewer highlightedMember={question?.member ?? null} questionNumber={selected === null ? 0 : selected + 1} />
  </div>;
}

export type ActivityOneProps = {
  embedded?: boolean;
  /** Teacher view: only the model and the question list; a bar glows once the teacher picks its question. */
  teacherPreview?: boolean;
  questionsVisible?: boolean;
  /** Teacher view while the work runs: the question all teams have reached, shown automatically. */
  autoQuestion?: number | null | undefined;
  initialAnswers?: string[] | undefined;
  initialStep?: number | undefined;
  initialCompleted?: boolean;
  timings?: Timing[] | undefined;
  serverNow?: number;
  closed?: boolean;
  onDraft?: ((step: number, answer: string) => Promise<void>) | undefined;
  onSave?: ((step: number, answer: string, completed: boolean) => Promise<void>) | undefined;
};

export default function ActivityOne({ embedded = false, teacherPreview = false, questionsVisible = true, autoQuestion, initialAnswers, initialStep = 0, initialCompleted = false, timings, serverNow, closed = false, onDraft, onSave }: ActivityOneProps) {
  const [questionIndex, setQuestionIndex] = useState(Math.max(0, Math.min(initialStep, GOAL_QUESTIONS.length - 1)));
  const [furthestStep, setFurthestStep] = useState(Math.max(0, Math.min(initialStep, GOAL_QUESTIONS.length - 1)));
  const [answers, setAnswers] = useState<string[]>(() => GOAL_QUESTIONS.map((_, index) => initialAnswers?.[index] ?? ''));
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const question = GOAL_QUESTIONS[questionIndex] ?? GOAL_QUESTIONS[0];
  const managed = Boolean(onSave && timings);
  const ms = remainingMs(timings?.[initialStep]?.started_at ?? null, serverNow ?? 0);
  const locked = closed || completed || (managed && (questionIndex !== initialStep || ms <= 0));
  useEffect(() => {
    if (!managed) return;
    setQuestionIndex(initialStep); setFurthestStep(initialStep); setCompleted(initialCompleted);
    setAnswers(previous => GOAL_QUESTIONS.map((_, i) => i === initialStep && !initialCompleted ? previous[i] ?? initialAnswers?.[i] ?? '' : initialAnswers?.[i] ?? ''));
  }, [managed, initialStep, initialCompleted]);
  const highlightedMember = completed || !questionsVisible ? null : question?.member ?? null;
  const draftCallback = useRef(onDraft);
  draftCallback.current = onDraft;
  useEffect(() => {
    if (!managed || locked || !questionsVisible) return;
    const timer = window.setTimeout(() => { void draftCallback.current?.(questionIndex, answers[questionIndex] ?? '').catch(() => {}); }, 150);
    return () => window.clearTimeout(timer);
  }, [managed, questionIndex, answers, locked, questionsVisible]);
  const updateAnswer = (answer: string) => {
    if (locked) return;
    setAnswers(answers.map((value, index) => index === questionIndex ? answer : value));
    setSaveError('');
  };
  const selectQuestion = async (index: number) => {
    if (managed) return;
    if (saving) return;
    setSaveError('');
    if (onSave && canAdvanceGoal(answers[questionIndex] ?? '')) {
      setSaving(true);
      try { await onSave(questionIndex, answers[questionIndex] ?? '', false); }
      catch (error) { setSaveError(error instanceof Error ? error.message : 'Không lưu được câu trả lời'); setSaving(false); return; }
      setSaving(false);
    }
    setQuestionIndex(index);
    setCompleted(false);
  };
  const next = async () => {
    const answer = answers[questionIndex] ?? '';
    if (!canAdvanceGoal(answer) || saving || locked) return;
    const isComplete = questionIndex === GOAL_QUESTIONS.length - 1;
    setSaving(true);
    setSaveError('');
    try { await onSave?.(questionIndex, answer, isComplete); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Không lưu được câu trả lời'); setSaving(false); return; }
    setSaving(false);
    if (managed) return;
    if (isComplete) setCompleted(true);
    else {
      setFurthestStep(Math.max(furthestStep, questionIndex + 1));
      setQuestionIndex(questionIndex + 1);
    }
  };

  if (teacherPreview) return <TeacherGoalPreview autoQuestion={autoQuestion} />;
  if (!question) return null;
  const content = <div className={`goal-content ${embedded ? 'goal-content-embedded' : ''} ${managed ? 'goal-content-timed' : ''}`}>
    <div className="goal-kicker">Hoạt động 1 <span>·</span> Quan sát không gian thực</div>
    <div className="goal-title-row">
      <div><h1>Khung thành bóng đá</h1><p>Mô hình khung thép và lưới trong không gian ba chiều.</p></div>
      <div className="goal-dimensions"><span>KÍCH THƯỚC KHUNG THÀNH 11 NGƯỜI</span><strong>7,32 × 2,44 × 2,20 m</strong></div>
    </div>
    <GoalModelViewer highlightedMember={highlightedMember} questionNumber={questionIndex + 1} />
    <div className="goal-caption"><span>KHUNG CỐ ĐỊNH · CAMERA QUAN SÁT TỰ DO</span><span>Hai cột dọc <i /> xà ngang <i /> thanh chéo <i /> lưới</span></div>

    {!questionsVisible ? <section className="goal-waiting" role="status"><Clock size={24} /><div><h2>Chờ giáo viên bắt đầu giao bài</h2><p>Em có thể quan sát và xoay mô hình. Các câu hỏi sẽ hiện ra sau khi giáo viên giao bài.</p></div></section> : <section className="goal-question-workspace" aria-labelledby="goal-question-heading">
      <div className="goal-question-intro"><div><p className="eyebrow">QUAN SÁT & TRẢ LỜI</p><h2 id="goal-question-heading">Quan sát hình ảnh khung thành bóng đá, em hãy trả lời các câu sau:</h2></div><span className="badge">{answers.filter(canAdvanceGoal).length}/{GOAL_QUESTIONS.length} câu đã trả lời</span></div>
      <div className="goal-question-layout">
        <nav className="goal-question-nav" aria-label="Danh sách câu hỏi">
          {GOAL_QUESTIONS.map((item, index) => <Button key={`${item.member}-${index}`} variant="ghost" className={`goal-question-step ${!completed && index === questionIndex ? 'selected' : ''}`} aria-label={`Câu ${index + 1}`} aria-current={!completed && index === questionIndex ? 'step' : undefined} disabled={saving || completed || (managed && index !== initialStep) || index > furthestStep} onClick={() => { void selectQuestion(index); }}><span className="case-number">{canAdvanceGoal(answers[index] ?? '') ? <Check size={14} /> : index + 1}</span><strong>Câu {index + 1}</strong></Button>)}
        </nav>
        <div className="goal-question-main">
          {completed ? <div className="goal-completion" role="status"><span className="goal-completion-icon"><Check size={26} /></span><div><p className="eyebrow">HOÀN THÀNH</p><h3>Đã nộp bài.</h3><p>Bài làm đã được lưu · Không thể sửa.</p></div></div> : <>
            <div className="model-heading"><h2>Câu {questionIndex + 1}</h2><span className="badge">Thanh phát sáng</span>{managed && <span role="timer" aria-label="Thời gian còn lại" className={`question-timer ${timerTone(ms)}`}>00:{String(Math.ceil(ms / 1000)).padStart(2, '0')}</span>}</div>
            <h3 className="goal-question-prompt">{question.prompt}</h3>
            {question.options ? <div className="goal-choice-group" role="group" aria-label={`Câu trả lời câu ${questionIndex + 1}`}>{question.options.map(option => <Button key={option} type="button" variant={answers[questionIndex] === option ? 'default' : 'outline'} aria-pressed={answers[questionIndex] === option} disabled={saving || locked} onClick={() => updateAnswer(option)}>{answers[questionIndex] === option && <Check />}{option}</Button>)}</div> : <>
              <label className="goal-answer-label" htmlFor="goal-answer">Câu trả lời của em</label>
              <Textarea id="goal-answer" aria-label={`Câu trả lời câu ${questionIndex + 1}`} className="answer-field goal-answer-field" placeholder={question.placeholder} disabled={saving || locked} value={answers[questionIndex] ?? ''} onChange={(event) => updateAnswer(event.target.value)} />
            </>}
            {saveError && <p className="error-note" role="alert">{saveError}</p>}
            <div className="action-row"><span className="status"><span className="goal-status-dot" />{onSave ? 'Tiến trình được lưu khi chuyển câu' : 'Hiệu ứng chuyển theo câu hỏi'}</span><div className="flex gap-2">{questionIndex > 0 && !managed && <Button variant="outline" disabled={saving} onClick={() => { void selectQuestion(questionIndex - 1); }}><ChevronLeft />Quay lại</Button>}<Button disabled={saving || locked || !canAdvanceGoal(answers[questionIndex] ?? '')} onClick={() => { void next(); }}>{saving ? 'Đang lưu…' : questionIndex === GOAL_QUESTIONS.length - 1 ? 'Nộp bài' : 'NEXT · Câu tiếp theo'}{questionIndex === GOAL_QUESTIONS.length - 1 ? <Check /> : <ArrowRight />}</Button></div></div>
          </>}
        </div>
      </div>
    </section>}
  </div>;

  if (embedded) return content;
  return <main className="goal-activity">
    <header className="goal-header">
      <div className="goal-brand"><span className="goal-brand-mark"><Box size={21} /></span><div>Hình học 3D<small>Toán học 11 · Hình học không gian</small></div></div>
      <Link to="/" className="goal-back-link"><ArrowLeft size={16} />Vào lớp học</Link>
    </header>
    {content}
  </main>;
}
