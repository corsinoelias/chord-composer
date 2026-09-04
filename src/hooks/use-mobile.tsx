import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024; // Tailwind `lg`

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * True at Tailwind `lg` and up (>= 1024px). Initialized synchronously from the
 * current width so the first client render already picks the right layout — safe
 * because the editor mounts as a `client:only` island (window is always defined).
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

/**
 * True at 1440px and up. Used by the Drum Tab Player to decide whether there is
 * room for a third column (the kit inspector) beside the library rail and the
 * grid: below this the grid's sixteenths get squeezed under the width they need
 * to stay clickable, and the editor starts scrolling sideways to pay for a panel.
 */
const WIDE_BREAKPOINT = 1440;

export function useIsWide() {
  const [isWide, setIsWide] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth >= WIDE_BREAKPOINT,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
    const onChange = () => setIsWide(window.innerWidth >= WIDE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsWide(window.innerWidth >= WIDE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isWide;
}
