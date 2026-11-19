import { useContext, useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { LoaderCircle, Send, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { MathText } from './MathText';
import { LESSON_AI_PROMPT, requestLessonAi, solveWithFallback } from '@/lib/lesson-ai';
import { solveLessonQuestion } from '@/lib/lesson-ai.functions';
import { useLessonAiKey } from './LessonAiKey';
import { PresentationNavigation } from '@/lib/presentation-navigation';

export function LessonAiSolver() {
  const [open, setOpen] = useState(false);
  const { apiKey } = useLessonAiKey();
  const [prompt, setPrompt] = useState(LESSON_AI_PROMPT);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const solve = useServerFn(solveLessonQuestion);
  const report = useRef(useContext(PresentationNavigation).onAiAnswer);
  useEffect(() => { report.current?.(Boolean(answer)); }, [answer]);
  useEffect(() => () => report.current?.(false), []);
  async function submit() {
    if (busy || !apiKey.trim() || !prompt.trim()) return;
    setBusy(true); setError('');
    try {
      const key = apiKey.trim(), text = prompt.trim();
      const result = await solveWithFallback(() => solve({ data: { apiKey: key, prompt: text } }), () => requestLessonAi(key, text));
      setAnswer(result.answer); setError(result.error);
    } catch {
      setError('Chưa gửi được yêu cầu. Hãy kiểm tra đăng nhập và kết nối rồi thử lại.');
    } finally { setBusy(false); }
  }
  return <div className="lesson-ai">
    <div className="lesson-ai-controls">
    <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}><Sparkles />Giải bài bằng AI</Button>
    {open && <form className="lesson-ai-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="lesson-ai-prompt-frame"><label htmlFor="lesson-ai-prompt">Lệnh gửi AI</label><Textarea id="lesson-ai-prompt" className="lesson-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} maxLength={6000} required /></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">Gemini 3.5 Flash-Lite</span><Button type="submit" size="sm" disabled={busy || !apiKey.trim() || !prompt.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}{busy ? 'Đang giải…' : 'Gửi AI'}</Button></div>
      {busy && <p role="status" className="text-sm text-muted-foreground">Gemini đang phân tích và viết lời giải…</p>}
      {!apiKey.trim() && <p className="text-sm text-muted-foreground">Nhập API key Gemini ở góc phải phía trên để gửi AI.</p>}
      {error && <p role="alert" className="error-note">{error}</p>}
    </form>}
    </div>
    {answer && <section aria-label="Bài giải do AI" className="lesson-ai-answer"><h4 className="font-semibold text-primary">Bài giải do AI</h4><MathText text={answer} /></section>}
  </div>;
}