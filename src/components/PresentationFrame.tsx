import { useEffect, useRef, useState, type ReactNode } from 'react';
import { presentationScale } from '@/lib/presentation-fit';

/** Fit the complete current slide, not individual text, to the teacher's viewport. */
/** `reserved` is the screen height kept above the slide (the fixed title bar in full screen). Never scrolls the page. */
/** `shrink` false keeps the slide at full size (enlarged full screen text); taller slides then scroll vertically instead of shrinking the text back. */
export function PresentationFrame({ enabled, slideKey, reserved = 28, shrink = true, children }: { enabled: boolean; slideKey: string; reserved?: number; shrink?: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    if (!enabled || !shrink || !frame.current || !content.current) { setFit({ scale: 1, height: 0 }); return; }
    const node = content.current;
    const resize = () => {
      if (!window.matchMedia('(min-width: 701px) and (orientation: landscape)').matches) { setFit({ scale: 1, height: 0 }); return; }
      const naturalHeight = node.scrollHeight;
      const available = window.innerHeight - reserved;
      const ai = node.querySelector<HTMLElement>('.lesson-ai');
      const toggle = ai?.querySelector<HTMLElement>('.lesson-ai-controls > button');
      const expansion = ai && toggle ? Math.max(0, ai.offsetHeight - toggle.offsetHeight) : 0;
      const scale = presentationScale(naturalHeight, available, expansion);
      setFit({ scale, height: naturalHeight * scale });
    };
    const observer = new ResizeObserver(resize); observer.observe(node);
    window.addEventListener('resize', resize); resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [enabled, shrink, slideKey, reserved]);
  return <div ref={frame} className={enabled ? 'presentation-frame' : 'lesson-frame'} style={enabled && fit.height ? { height: fit.height } : undefined}>
    <div ref={content} className={enabled ? 'presentation-slide' : undefined} style={enabled ? { transform: `scale(${fit.scale})` } : undefined}>{children}</div>
  </div>;
}