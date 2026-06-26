const cache = new Map<string, string | null>()

export async function fetchCoverImage(slug: string, artist: string, title: string): Promise<string | null> {
  if (cache.has(slug)) return cache.get(slug)!
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&limit=1&entity=song`,
      { signal: controller.signal },
    )
    clearTimeout(id)
    if (!res.ok) { cache.set(slug, null); return null }
    const data = await res.json() as { results?: { artworkUrl100?: string }[] }
    const url = data.results?.[0]?.artworkUrl100?.replace('100x100bb', '500x500bb') ?? null
    cache.set(slug, url)
    return url
  } catch {
    cache.set(slug, null)
    return null
  }
}
