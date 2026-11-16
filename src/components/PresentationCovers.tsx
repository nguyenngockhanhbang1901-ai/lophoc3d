import { useEffect } from 'react';
import type { PresentationCover } from '@/lib/presentation-covers';
import welcomeAsset from '@/assets/cover-welcome.png.asset.json';
import titleAsset from '@/assets/cover-title.png.asset.json';
import thanksAsset from '@/assets/cover-thanks.png.asset.json';

/** `image` is the teacher's picture; until it is supplied the slide shows its text instead. */
const COVERS: Record<PresentationCover, { image?: string; label: string; heading: string; detail?: string }> = {
  welcome: { image: welcomeAsset.url, label: 'Ảnh chào mừng', heading: 'Chào mừng các em đến với tiết học' },
  title: { image: titleAsset.url, label: 'Ảnh tên bài học', heading: 'Đường thẳng và mặt phẳng song song', detail: 'Toán học 11 · Hình học không gian' },
  thanks: { image: thanksAsset.url, label: 'Ảnh cảm ơn', heading: 'Cảm ơn các em đã chú ý lắng nghe!' },
};
const ORDER: PresentationCover[] = ['welcome', 'title', 'thanks'];

/** Preloads the cover pictures as soon as a presentation class is open, so switching never flashes. */
export function usePreloadCovers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    for (const cover of ORDER) { const src = COVERS[cover].image; if (src) { const img = new Image(); img.src = src; } }
  }, [enabled]);
}

/** All three covers stay mounted while presenting; only the active one is visible. */
export function PresentationCovers({ cover }: { cover: PresentationCover | null }) {
  return <>{ORDER.map(name => {
    const slide = COVERS[name];
    const active = cover === name;
    return <div key={name} className="presentation-cover" data-active={active} aria-hidden={!active} role={active ? 'img' : undefined} aria-label={slide.label}>
      {slide.image ? <img src={slide.image} alt="" decoding="async" /> : <div className="presentation-cover-text"><h2>{slide.heading}</h2>{slide.detail && <p>{slide.detail}</p>}</div>}
    </div>;
  })}</>;
}
