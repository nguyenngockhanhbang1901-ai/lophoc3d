import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** On-screen equivalents of Backspace / Enter for the presentation hook, placed like Activity 2/3's arrows. */
export function SlideArrows() {
  const press = (key: 'Enter' | 'Backspace') => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };
  return <div className="model-heading slide-arrows"><span className="ml-auto" />
    <Button type="button" size="sm" variant="ghost" aria-label="Bước trước" onClick={press('Backspace')}><ArrowLeft /></Button>
    <Button type="button" size="sm" variant="ghost" aria-label="Bước tiếp theo" onClick={press('Enter')}><ArrowRight /></Button>
  </div>;
}
