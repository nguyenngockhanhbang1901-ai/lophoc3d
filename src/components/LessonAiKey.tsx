import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';

/** Only this browser keeps the key, and only after the teacher presses "Lưu"; it never goes to the database. */
export const AI_KEY_STORAGE = 'lesson-ai-gemini-key';
const AiKeyContext = createContext({ apiKey: '', setApiKey: (_value: string) => {}, saved: false, save: () => {} });
export function LessonAiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try { const stored = window.localStorage.getItem(AI_KEY_STORAGE); if (stored) { setKey(stored); setSaved(true); } } catch { /* storage blocked */ }
  }, []);
  const setApiKey = (value: string) => { setKey(value); setSaved(false); };
  const save = () => {
    try {
      const value = apiKey.trim();
      if (value) window.localStorage.setItem(AI_KEY_STORAGE, value); else window.localStorage.removeItem(AI_KEY_STORAGE);
      setKey(value); setSaved(Boolean(value));
    } catch { /* storage blocked */ }
  };
  return <AiKeyContext.Provider value={{ apiKey, setApiKey, saved, save }}>{children}</AiKeyContext.Provider>;
}
export const useLessonAiKey = () => useContext(AiKeyContext);
export function LessonAiKeyControl() {
  const { apiKey, setApiKey, saved, save } = useLessonAiKey();
  return <label className="lesson-ai-key" title="API key Gemini của giáo viên"><KeyRound size={16} /><Input type="password" aria-label="API key Gemini của giáo viên" placeholder="API key Gemini" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} /><Button type="button" size="sm" variant={saved ? 'ghost' : 'secondary'} className="lesson-ai-key-save" title="Lưu API key trên trình duyệt này" aria-label={saved ? 'Đã lưu API key trên trình duyệt' : 'Lưu API key trên trình duyệt'} onClick={save}>{saved ? <><Check />Đã lưu</> : 'Lưu'}</Button></label>;
}
