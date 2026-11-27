import { useEffect, useState } from 'react';
import { AlarmClock, Play, X } from 'lucide-react';
import { assignmentStarted } from '@/lib/assignment';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const pad = (n: number) => String(n).padStart(2, '0');
/** datetime-local value in the teacher's own time zone. */
function localInput(time: number) { const d = new Date(time); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const hourMinute = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
function remaining(ms: number) { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

/** Bài 11.1 and Bài 12.1: release now, or schedule the release for a set time. */
export function CubeReleaseControls({ startedAt, closed, busy, onReleaseNow, onSchedule, partName = 'Luyện tập 1' }: { startedAt: string | null; closed: boolean; busy: boolean; onReleaseNow: () => void; onSchedule: (at: string | null) => Promise<void>; partName?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const released = assignmentStarted(startedAt, now);
  const scheduled = Boolean(startedAt && !released);
  useEffect(() => { if (!scheduled) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [scheduled]);
  if (released) return <Button size="sm" disabled><Play />Đã giao bài {partName}</Button>;
  const openPicker = (next: boolean) => { if (next) setValue(startedAt ? localInput(Date.parse(startedAt)) : localInput(Math.ceil((Date.now() + 60_000) / 300_000) * 300_000)); setOpen(next); };
  return <>
    <Button size="sm" disabled={busy || closed} onClick={onReleaseNow}><Play />Bắt đầu giao bài {partName}</Button>
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={busy || closed}><AlarmClock />{scheduled && startedAt ? `Hẹn giao ${hourMinute(startedAt)} · còn ${remaining(Date.parse(startedAt) - now)}` : 'Hẹn giờ giao bài'}</Button></PopoverTrigger>
      <PopoverContent className="w-72">
        <form className="cube-schedule-form" onSubmit={e => { e.preventDefault(); const at = new Date(value); if (Number.isNaN(at.getTime())) return; void onSchedule(at.toISOString()).then(() => setOpen(false), () => {}); }}>
          <label className="text-sm font-medium">Giờ giao bài<Input type="datetime-local" step={60} required value={value} onChange={e => setValue(e.target.value)} aria-label="Giờ giao bài" /></label>
          <p className="text-xs text-muted-foreground">Đúng giờ này bài tự mở cho học sinh; 5 giây trước đó học sinh thấy đếm ngược.</p>
          <Button type="submit" size="sm" disabled={busy}><AlarmClock />Lưu giờ hẹn</Button>
          {scheduled && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { void onSchedule(null).then(() => setOpen(false), () => {}); }}><X />Hủy hẹn giờ</Button>}
        </form>
      </PopoverContent>
    </Popover>
  </>;
}
