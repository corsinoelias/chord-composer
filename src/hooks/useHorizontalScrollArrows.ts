import { useCallback, useEffect, useRef, useState } from 'react';

// Shared by any horizontally-scrolling strip that hides its native scrollbar (Structure,
// Chords used): touch/trackpad users can still swipe, but a mouse has no drag gesture and no
// scrollbar to grab once it's hidden, so there needs to be an explicit way to move the strip.
export function useHorizontalScrollArrows<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }, []);

  return { ref, canScrollLeft, canScrollRight, scrollByPage };
}
