import { useContext, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { FileText, LoaderCircle, Save, Send, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { MathText } from './MathText';
import { LESSON_AI_PROMPT, LESSON_AI_QUESTION_KEY, fallbackAnswer, requestLessonAi, revealChunks, solveWithFallback, solveWithSaved } from '@/lib/lesson-ai';
import { solveLessonQuestion } from '@/lib/lesson-ai.functions';
import { useLessonAiKey } from './LessonAiKey';
import { PresentationNavigation } from '@/lib/presentation-navigation';
import { supabase } from '@/integrations/supabase/client';

async function loadSavedSolution(roomId: string | undefined) {
  if (!roomId) return '';
  const { data } = await supabase.from('lesson_ai_solutions').select('answer').eq('classroom_id', roomId).eq('question_key', LESSON_AI_QUESTION_KEY).maybeSingle();
  return data?.answer ?? '';
}

async function loadPreparedAnswer() {
  const { data } = await supabase.from('lesson_ai_prepared').select('answer').eq('question_key', LESSON_AI_QUESTION_KEY).maybeSingle();
  return data?.answer ?? '';
}

async function savePreparedAnswer(answer: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('signed out');
  const { error } = await supabase.from('lesson_ai_prepared').upsert({ owner_id: user.id, question_key: LESSON_AI_QUESTION_KEY, answer, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,question_key' });
  if (error) throw error;
}

/** Nút Đáp án: the teacher's prepared solution, shown by Gửi AI when Gemini fails or is slow. Hidden in full screen presentation. */
function PreparedAnswer({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    loadPreparedAnswer().then(value => { if (live) { setText(value); setState('idle'); } }, () => { if (live) setState('idle'); });
    return () => { live = false; };
  }, []);
  async function save() {
    setState('saving');
    try { await savePreparedAnswer(text); setState('saved'); } catch { setState('error'); }
  }
  return <form className="lesson-ai-prepared" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="lesson-ai-prompt-frame"><label htmlFor="lesson-ai-prepared">Đáp án</label><Textarea id="lesson-ai-prepared" className="lesson-ai-prompt" value={text} onChange={event => { setText(event.target.value); if (state === 'saved') setState('idle'); }} disabled={state === 'loading' || state === 'saving'} maxLength={20000} placeholder="Nhập nội dung đáp án…" /></div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" disabled={state === 'loading' || state === 'saving'}>{state === 'saving' ? <LoaderCircle className="animate-spin" /> : <Save />}Lưu đáp án</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>Đóng</Button>
      {state === 'saved' && <span role="status" className="text-sm text-muted-foreground">Đã lưu.</span>}
      {state === 'error' && <span role="alert" className="error-note">Chưa lưu được. Hãy kiểm tra đăng nhập rồi thử lại.</span>}
    </div>
  </form>;
}

async function saveSolution(roomId: string | undefined, answer: string) {
  if (!roomId) return;
  await supabase.from('lesson_ai_solutions').upsert({ classroom_id: roomId, question_key: LESSON_AI_QUESTION_KEY, answer, updated_at: new Date().toISOString() }, { onConflict: 'classroom_id,question_key' });
}

/** Fresh and saved solutions share this frame and its line-by-line fade-in, so they look identical. */
function AiAnswer({ text }: { text: string }) {
  return <section aria-label="Bài giải do AI" className="lesson-ai-answer"><h4 className="font-semibold text-primary">Bài giải do AI</h4>
    {revealChunks(text).map((line, i) => <div key={i} className="lesson-ai-line" style={{ animationDelay: `${i * 140}ms` }}>{line.trim() ? <MathText text={line} /> : '\u00a0'}</div>)}
  </section>;
}

export function LessonAiSolver() {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const { apiKey } = useLessonAiKey();
  const [prompt, setPrompt] = useState(LESSON_AI_PROMPT);
  const [answer, setAnswer] = useState('');
  const [round, setRound] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const solve = useServerFn(solveLessonQuestion);
  const navigation = useContext(PresentationNavigation);
  const roomId = navigation.aiRoomId;
  async function submit() {
    if (busy || !apiKey.trim() || !prompt.trim()) return;
    setBusy(true); setError('');
    try {
      const key = apiKey.trim(), text = prompt.trim();
      const result = await solveWithSaved(
        signal => solveWithFallback(() => solve({ data: { apiKey: key, prompt: text }, signal }), () => requestLessonAi(key, text, undefined, signal)),
        async () => { const [prepared, saved] = await Promise.all([loadPreparedAnswer().catch(() => ''), loadSavedSolution(roomId).catch(() => '')]); return fallbackAnswer(prepared, saved); },
      );
      if (result.answer) { setAnswer(result.answer); setRound(r => r + 1); }
      setError(result.error);
      if (result.source === 'ai') void saveSolution(roomId, result.answer).catch(() => undefined);
    } catch {
      setError('Chưa gửi được yêu cầu. Hãy kiểm tra đăng nhập và kết nối rồi thử lại.');
    } finally { setBusy(false); }
  }
  return <div className="lesson-ai">
    <div className="lesson-ai-controls">
    <div className="lesson-ai-buttons">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}><Sparkles />Giải bài bằng AI</Button>
      <Button variant="outline" size="sm" className="lesson-ai-prepared-toggle" aria-expanded={preparing} onClick={() => setPreparing(value => !value)}><FileText />Đáp án</Button>
    </div>
    {open && <form className="lesson-ai-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="lesson-ai-prompt-frame"><label htmlFor="lesson-ai-prompt">Lệnh gửi AI</label><Textarea id="lesson-ai-prompt" className="lesson-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} maxLength={6000} required /></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">GEMINI</span><Button type="submit" size="sm" disabled={busy || !apiKey.trim() || !prompt.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}{busy ? 'Đang giải…' : 'Gửi AI'}</Button></div>
      {busy && <p role="status" className="text-sm text-muted-foreground">Gemini đang phân tích và viết lời giải…</p>}
      {!apiKey.trim() && <p className="text-sm text-muted-foreground">Nhập API key Gemini ở góc phải phía trên để gửi AI.</p>}
      {error && <p role="alert" className="error-note">{error}</p>}
    </form>}
    </div>
    {preparing && <PreparedAnswer onClose={() => setPreparing(false)} />}
    {answer && <AiAnswer key={round} text={answer} />}
  </div>;
}
