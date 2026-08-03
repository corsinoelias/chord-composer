import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

interface VerticalFaderProps {
  value: number; // 0-1
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string; // aria-label, e.g. "Bass volume"
  heightPx?: number;
  className?: string;
}

// Built directly on Radix's own orientation="vertical" support rather than reusing
// src/components/ui/slider.tsx, whose Root/Track classNames are hardcoded horizontal
// (w-full, items-center, h-2 w-full) and would fight a vertical layout instead of adapting to
// one. Radix already gives ARIA role="slider"/aria-orientation="vertical", Up/Down/PageUp/
// PageDown/Home/End keyboard support, and focus management for free — no custom pointer
// handling needed here.
export function VerticalFader({ value, onChange, disabled, label, heightPx = 130, className }: VerticalFaderProps) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex flex-col items-center touch-none select-none', className)}
      style={{ height: heightPx }}
      orientation="vertical"
      min={0}
      max={100}
      step={1}
      value={[Math.round(value * 100)]}
      onValueChange={([v]) => onChange(v / 100)}
      disabled={disabled}
      aria-label={label}
    >
      {/* Thin (not chunky) track with a recessed/inset shadow — reads as a real fader's
          "socket" rather than a generic slider bar. */}
      <SliderPrimitive.Track className="relative w-1 flex-1 grow overflow-hidden rounded-full bg-secondary shadow-inner">
        {/* Radix fills a vertical Range from the low end (bottom) upward for ascending
            values — matches a real fader's bottom-up level indicator with no extra work. */}
        <SliderPrimitive.Range className="absolute w-full bg-gradient-to-t from-primary/80 to-primary" />
      </SliderPrimitive.Track>
      {/* 44x44px transparent hit area around the visible thumb graphic — WCAG touch-target
          minimum without visually ballooning the fader itself. Radix measures this element's
          own box to center it on the track, so no manual centering offset is needed. */}
      <SliderPrimitive.Thumb
        className="relative flex items-center justify-center w-11 h-11 rounded-full
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="block w-6 h-6 rounded-full bg-card shadow-md" />
        <span className="absolute w-3 h-[2px] rounded-full bg-primary/55" />
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
}
