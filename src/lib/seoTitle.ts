// Google truncates result titles at roughly 60 characters (Screaming Frog's pixel-based
// filter, ~561px, agrees within a character or two for our titles).
//
// Every templated page used to append " | Chord Sequence" unconditionally. That spends 17
// of the 60-char budget on branding and was, on its own, the entire reason 20 of our 30
// over-length titles were over-length. The trade is bad in both directions: on a long
// title the brand is the part Google cuts, so we paid the characters and got no brand
// impression anyway — while the words that actually rank got pushed out of view.
//
// So: append the suffix only when the finished title still fits. Titles that can't afford
// it keep their own words, which are the ones a user scans for in the SERP.
//
// Stripping first makes this idempotent — callers may pass a title that already carries
// the suffix (several hand-written ones do) and get the same answer as one that doesn't.
export const BRAND_SUFFIX = ' | Chord Sequence';
export const TITLE_MAX_CHARS = 60;

export function withBrand(title: string, max = TITLE_MAX_CHARS): string {
  const base = title.trim().replace(/\s*\|\s*Chord Sequence\s*$/, '').trim();
  return base.length + BRAND_SUFFIX.length <= max ? `${base}${BRAND_SUFFIX}` : base;
}
