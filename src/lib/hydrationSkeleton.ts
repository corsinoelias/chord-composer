/**
 * Removes a server-rendered loading skeleton once the `client:only` island sitting under
 * it has actually painted.
 *
 * NOT `document.addEventListener('astro:hydrate', …, { capture: true, once: true })`,
 * which is what every page with a skeleton used to do. That fires for whichever island
 * hydrates FIRST, and BaseLayout mounts `<FeedbackModal client:idle />` on every page.
 * The feedback modal is a few KB and hydrates on idle (~0.9s locally) while the editor /
 * instrument bundles take several seconds — so the skeleton was torn down seconds before
 * the app existed and the page went blank in between. That gap is what reads as a flicker
 * ("it disappears after the shimmer"), and it got worse the heavier the island became.
 *
 * Watching the island's own DOM is the precise signal — the same reasoning as the song
 * page's header-transport shimmer — and it also survives the opposite race the drum tab
 * hit, where hydration finishes before the page's own module runs: the "already painted"
 * check below is simply true on the first pass.
 */
export function removeSkeletonOnHydrate(skeletonId: string, islandHostId: string): void {
  const host = document.getElementById(islandHostId);
  const skeleton = document.getElementById(skeletonId);
  if (!host || !skeleton) return;

  const removeSkeleton = () => {
    // Fade rather than cut: these skeletons carry real, readable text (the chord player's
    // breadcrumb, the instrument pages' hint lines), so an abrupt swap reads as a glitch
    // in a way a plain loading shimmer never did.
    skeleton.style.opacity = '0';
    skeleton.addEventListener('transitionend', () => skeleton.remove(), { once: true });
    setTimeout(() => skeleton.remove(), 250); // fallback in case transitionend never fires
  };

  // React renders into the <astro-island> element itself, so its first element child is
  // the app's first painted node. `.children` (elements only), never `.childNodes` —
  // that would also count the whitespace text nodes the template leaves behind and be
  // true from the very first paint, which is the bug this replaces.
  const island = host.querySelector('astro-island') ?? host;
  if (island.children.length > 0) {
    removeSkeleton();
    return;
  }

  const observer = new MutationObserver(() => {
    if (island.children.length === 0) return;
    observer.disconnect();
    removeSkeleton();
  });
  observer.observe(island, { childList: true });
}
