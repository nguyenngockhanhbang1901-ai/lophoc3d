import { lazy, Suspense, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Clock, Send } from 'lucide-react';
import { CUBE_QUESTIONS,CUBE_ANSWERS,cubeResultOrder,releaseState,submissionClock } from '@/lib/cube-practice';
import { readCubeResults,readCubeStudent,submitCubeAnswers,type CubeAccess } from '@/lib/cube-practice.functions';
import { useEnterReview } from '@/hooks/use-enter-review';
import { reveal } from '@/lib/reveal';
import { MathText } from './MathText';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { SlideArrows } from './SlideArrows';
const CubePracticeView=lazy(()=>import('./CubePracticeView'));
function TeacherQuestions({review,rows}:{review:boolean;rows:Awaited<ReturnType<typeof readCubeResults>>}) {
 const {selected}=useEnterReview(6);
 return <><SlideArrows/>{CUBE_QUESTIONS.map((q,i)=><section key={q} {...reveal(review || i<=selected)} className="cube-question">
  <h3><strong>Câu {i+1}. </strong><MathText text={q}/></h3>
  {review && <><p className="correct-answer"><MathText text={CUBE_ANSWERS[i] ?? ''}/></p>{cubeResultOrder(rows).map(s=><p className="cube-student-result" key={s.slot}><span className="cube-result-meta">{s.name} - {submissionClock(s.submitted_at)}</span>{s.submitted_at && Array.isArray(s.answers)?<>: {String(s.answers[i] ?? '')}</>:null}</p>)}</>}
 </section>)}</>;
}
export function CubePractice({teacher,roomId,review,access}:{teacher:boolean;roomId?:string|undefined;review:boolean;access:CubeAccess|null}) {
 const read=useServerFn(readCubeStudent),send=useServerFn(submitCubeAnswers),results=useServerFn(readCubeResults);
 const [student,setStudent]=useState<Awaited<ReturnType<typeof readCubeStudent>>|null>(null),[rows,setRows]=useState<Awaited<ReturnType<typeof readCubeResults>>>([]);
 const [answers,setAnswers]=useState(Array.from({length:6},()=>'')),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!access){setStudent(null);setAnswers(Array.from({length:6},()=>''));return;}let active=true;const update=async()=>{try{const s=await read({data:access});if(active){setOffset(s.serverNow-Date.now());setStudent(s);if(s.submitted_at)setAnswers(s.answers);}}catch(e){if(active)setError(e instanceof Error?e.message:'Không đọc được bài');}};void update();const timer=setInterval(()=>void update(),1500);return()=>{active=false;clearInterval(timer);};},[access,read]);
 useEffect(()=>{if(!teacher || !roomId || !review)return;let active=true;const update=async()=>{try{const r=await results({data:{roomId}});if(active)setRows(r);}catch(e){if(active)setError(e instanceof Error?e.message:'Không đọc được đáp án');}};void update();const timer=setInterval(()=>void update(),2000);return()=>{active=false;clearInterval(timer);};},[teacher,roomId,review,results]);
 async function submit(){if(!access)return;setBusy(true);setError('');try{await send({data:{...access,answers}});setStudent(await read({data:access}));}catch(e){setError(e instanceof Error?e.message:'Không nộp được bài');}finally{setBusy(false);}}
 const [offset,setOffset]=useState(0),[now,setNow]=useState(0);
 // Tick on the server's clock only while a scheduled release is still ahead.
 useEffect(()=>{if(teacher || !student?.release_at || student.released)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer);},[teacher,student?.release_at,student?.released]);
  const gate=student?.released?{released:true,countdown:null,remaining:null}:releaseState(student?.release_at,now+offset);
 const enabled=Boolean(access && gate.released && !student?.closed && !student?.submitted_at);
 if(!teacher && !gate.released) return <section className="cube-practice"><div className="cube-release-wait" role="status" aria-live="polite">{gate.countdown?<><p>Bài sẽ mở sau</p><span className="cube-countdown" key={gate.countdown}>{gate.countdown}</span></>:<><Clock size={40}/><h2>Đợi giáo viên giao bài{gate.remaining && <span className="cube-release-clock" aria-hidden="true">còn {gate.remaining}</span>}</h2>{student?.name && <p>{student.name}</p>}</>}</div>{error && <p role="alert" className="error-note">{error}</p>}</section>;
 return <section className="cube-practice"><div className="model-heading"><h2>Luyện tập 1</h2>{teacher && review && <span>{rows.length}/45 học sinh</span>}</div><p className="practice-context">Cho hình lập phương <MathText text="$MNPQ.M'N'P'Q'$"/>.</p>
  <div className="cube-practice-layout"><div className="cube-question-column">
   {teacher?<TeacherQuestions review={review} rows={rows}/>:<>{student?.name && <p><strong>{student.name}</strong></p>}{CUBE_QUESTIONS.map((q,i)=><section className="cube-question" key={q}><h3><strong>Câu {i+1}. </strong><MathText text={q}/></h3><Textarea aria-label={`Trả lời câu ${i+1}`} value={answers[i] ?? ''} maxLength={2000} disabled={!enabled || busy} onChange={e=>setAnswers(a=>a.map((v,j)=>j===i?e.target.value:v))} rows={2}/></section>)}{student?.submitted_at?<p role="status" className="correct-answer"><Check/>Đã nộp bài lúc {submissionClock(student.submitted_at)} · Không thể sửa.</p>:<Button disabled={!enabled || busy || answers.some(a=>!a.trim())} onClick={()=>void submit()}><Send/>{busy?'Đang nộp…':'Nộp bài'}</Button>}</>}
   {error && <p role="alert" className="error-note">{error}</p>}
  </div><figure className="cube-diagram"><Suspense fallback={<div className="cube-practice-view"/>}><CubePracticeView/></Suspense><figcaption>Hình lập phương <MathText text="$MNPQ.M'N'P'Q'$"/></figcaption></figure></div>
 </section>;
}