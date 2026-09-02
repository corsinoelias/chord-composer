import { useEffect, useRef, useState } from 'react';

/** Returns a ref for the available-width container and the scale factor (≤1) needed to fit
 *  a fixed-width real page inside it — the Canva/Figma/Google-Slides "fit to width" zoom.
 *  Never magnifies past 100%: on a roomy screen the page renders at its true 96dpi size
 *  with canvas margin on either side, and only shrinks once the pane is narrower than the
 *  page itself. */
export function useFitScale(naturalWidthPx: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setScale(Math.min(1, w / naturalWidthPx));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidthPx]);
  return { ref, scale };
}
