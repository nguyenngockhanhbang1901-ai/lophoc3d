import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pressStepKey, type StepAction } from '@/lib/step-keys';

/** On-screen ← / → buttons: each press runs exactly the Backspace / Enter keyboard handler. */
export function SlideArrows({ className = '' }: { className?: string }) {
  const press = (action: StepAction) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    pressStepKey(action);
  };
  return <div className={`model-heading slide-arrows ${className}`.trim()}><span className="ml-auto" />
    <Button type="button" size="sm" variant="ghost" aria-label="Bước trước" title="Lùi lại (← / Backspace)" onClick={press('back')}><ArrowLeft /></Button>
    <Button type="button" size="sm" variant="ghost" aria-label="Bước tiếp theo" title="Tiến tới (→ / Enter)" onClick={press('next')}><ArrowRight /></Button>
  </div>;
}
