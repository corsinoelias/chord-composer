import { useState, useLayoutEffect, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Music2, Play, Sliders, Download, ChevronRight, ChevronLeft } from 'lucide-react';

interface GuidedTourProps {
  onDismiss: () => void;
}

interface TourStep {
  target: string; // matches a data-tour="..." attribute somewhere on the page
  icon: typeof Music2;
  title: string;
  description: string;
}

// Same 4 concepts as the overlay this replaces — anchored to the real elements now
// instead of floating in a generic centered card.
const steps: TourStep[] = [
  {
    target: 'chords-section',
    icon: Music2,
    title: 'Your chords are ready',
    description: 'Tap any chord to edit it, drag to reorder, or add new ones',
  },
  {
    target: 'style-selector',
    icon: Sliders,
    title: 'Pick your style',
    description: 'Choose a rhythm pattern that fits your music',
  },
  {
    target: 'play-button',
    icon: Play,
    title: 'Press play',
    description: 'Hear your progression come to life with real instruments',
  },
  {
    target: 'export-button',
    icon: Download,
    title: 'Export when ready',
    description: 'Download your creation as an audio file',
  },
];

const GAP = 12; // space between the spotlighted element and the tooltip card
const MARGIN = 8; // minimum distance kept from the viewport edges

interface Rect { top: number; left: number; width: number; height: number; }

export function GuidedTour({ onDismiss }: GuidedTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'bottom' });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Measures the current step's target and the tooltip card, then positions both —
  // re-run on step change, resize, and scroll (capture, to catch nested scroll
  // containers) since the app's layout isn't static.
  const reposition = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) { setTargetRect(null); return; }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });

    const cardEl = cardRef.current;
    const cardWidth = cardEl?.offsetWidth ?? 320;
    const cardHeight = cardEl?.offsetHeight ?? 180;

    let placement: 'top' | 'bottom' = 'bottom';
    let top = r.bottom + GAP;
    if (top + cardHeight > window.innerHeight - MARGIN) {
      placement = 'top';
      top = r.top - GAP - cardHeight;
    }
    // If it doesn't fit above either (very short viewport), just clamp on-screen
    // rather than render off the top edge.
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - cardHeight - MARGIN));

    let left = r.left;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - cardWidth - MARGIN));

    setCardPos({ top, left, placement });
  }, [step.target]);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Scrolling is animated, so the final rect isn't known immediately — reposition
    // now (for an instant best-effort placement) and again shortly after the
    // scroll-into-view animation has had time to settle.
    reposition();
    const t = setTimeout(reposition, 350);
    return () => clearTimeout(t);
  }, [stepIndex, step.target, reposition]);

  useEffect(() => {
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition]);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const handleNext = () => {
    if (isLast) onDismiss();
    else setStepIndex(i => i + 1);
  };
  const handleBack = () => setStepIndex(i => Math.max(0, i - 1));

  const Icon = step.icon;

  // No target found (e.g. layout changed, element not mounted yet) — skip this step
  // rather than show a spotlight frame pointing at nothing.
  if (!targetRect) {
    return null;
  }

  const PAD = 6; // small breathing room between the highlight ring and the element

  return (
    <div className="fixed inset-0 z-50 animate-in fade-in duration-200">
      {/* Dimmed frame around the target — 4 rects, the target rect itself stays uncovered */}
      <div className="fixed bg-background/80 backdrop-blur-sm" style={{ top: 0, left: 0, right: 0, height: Math.max(0, targetRect.top - PAD) }} />
      <div className="fixed bg-background/80 backdrop-blur-sm" style={{ top: targetRect.top - PAD, left: 0, width: Math.max(0, targetRect.left - PAD), height: targetRect.height + PAD * 2 }} />
      <div className="fixed bg-background/80 backdrop-blur-sm" style={{ top: targetRect.top - PAD, left: targetRect.left + targetRect.width + PAD, right: 0, height: targetRect.height + PAD * 2 }} />
      <div className="fixed bg-background/80 backdrop-blur-sm" style={{ top: targetRect.top + targetRect.height + PAD, left: 0, right: 0, bottom: 0 }} />

      {/* Highlight ring around the spotlighted element */}
      <div
        className="fixed rounded-lg ring-2 ring-primary pointer-events-none transition-all duration-200"
        style={{ top: targetRect.top - PAD, left: targetRect.left - PAD, width: targetRect.width + PAD * 2, height: targetRect.height + PAD * 2 }}
      />

      {/* Tooltip card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        className="fixed w-[calc(100vw-1rem)] max-w-[320px] bg-card border border-border rounded-2xl shadow-2xl p-5"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-primary" />
        </div>

        <h2 className="text-base font-semibold text-foreground mb-1.5">{step.title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{step.description}</p>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex ? 'w-6 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {stepIndex + 1} of {steps.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={handleBack} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </Button>
            )}
            <Button ref={nextButtonRef} size="sm" onClick={handleNext} className="gap-1">
              {isLast ? "Let's go!" : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
