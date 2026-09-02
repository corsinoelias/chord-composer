import { useEffect, useState } from 'react';

// Mirrors the `lg` breakpoint the layout already switches on (Tailwind's `lg:` prefix) so
// the JS-driven mobile chrome (bottom sheets, edit mode, tap-to-edit-line) and the
// CSS-driven desktop/mobile split never disagree about which "mode" is showing.
const QUERY = '(max-width: 1023px)';

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches));
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
