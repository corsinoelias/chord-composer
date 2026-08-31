// Per-instance memo. Worth keeping — it makes builds and request bursts on a warm serverless
// instance nearly free — but it is NOT a real cache: every cold instance starts empty, so on
// a cache-missing page view this genuinely calls out to iTunes before the first byte is sent.
const cache = new Map<string, string | null>()

// What this blocks: the song page awaits this in its frontmatter (see songs/[slug].astro),
// sequentially after the Supabase lookup, so the budget below is added to TTFB on every
// uncached render. The payoff is a decorative 64x64 thumbnail in the page header — it is not
// used for og:image or JSON-LD, and the page renders fine without it.
//
// Which is why the budget is 700ms and not the 2500ms it was until Aug 2026: a third of a
// visitor's patience is not a fair price for a thumbnail. Cold TTFB measured 0.6–4.7s at the
// time, and this call was the largest single item in it. If iTunes is slow, we drop the cover
// rather than make the reader wait for it.
const COVER_FETCH_BUDGET_MS = 700

export async function fetchCoverImage(slug: string, artist: string, title: string): Promise<string | null> {
  if (cache.has(slug)) return cache.get(slug)!
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), COVER_FETCH_BUDGET_MS)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&limit=1&entity=song`,
      { signal: controller.signal },
    )
    clearTimeout(id)
    // An HTTP error is iTunes answering, so treat it like "no artwork" and stop asking.
    if (!res.ok) { cache.set(slug, null); return null }
    const data = await res.json() as { results?: { artworkUrl100?: string }[] }
    const url = data.results?.[0]?.artworkUrl100?.replace('100x100bb', '500x500bb') ?? null
    cache.set(slug, url)
    return url
  } catch {
    // Deliberately NOT memoized: everything landing here is transient — the abort above
    // firing, a DNS blip, a dropped connection. Caching it would let one slow moment remove
    // this song's cover for the whole life of the instance, and a tighter budget makes that
    // both more likely and less deserved. The page just renders without a cover this time.
    return null
  }
}
