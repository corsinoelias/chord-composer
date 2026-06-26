import type { APIContext } from 'astro'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import React from 'react'
import { SongOgImage } from '../../../../lib/og/SongOgImage'
import { SONGS, extractChordsFromSong } from '../../../../data/songs'
import { getPublicSongBySlug } from '../../../../lib/publicSongs'

let fontRegular: ArrayBuffer | null = null
let fontBold: ArrayBuffer | null = null

async function loadFonts(origin: string): Promise<void> {
  const [r, b] = await Promise.all([
    fontRegular
      ? Promise.resolve(fontRegular)
      : fetch(`${origin}/fonts/Inter-Regular.woff`).then(r => r.arrayBuffer()),
    fontBold
      ? Promise.resolve(fontBold)
      : fetch(`${origin}/fonts/Inter-Bold.woff`).then(r => r.arrayBuffer()),
  ])
  fontRegular = r
  fontBold = b
}

export const GET = async ({ params, url }: APIContext): Promise<Response> => {
  const slug = params.slug as string

  const pub = await getPublicSongBySlug(slug).catch(() => null)
  const fallback = SONGS.find(s => s.slug === slug)
  const raw = pub ?? fallback

  if (!raw) return new Response('Not found', { status: 404 })

  const chords = [...new Set(extractChordsFromSong(raw as Parameters<typeof extractChordsFromSong>[0]))]

  await loadFonts(url.origin)

  const element = React.createElement(SongOgImage, {
    title: raw.title,
    artist: raw.artist,
    songKey: raw.key,
    bpm: raw.bpm,
    capo: raw.capo,
    year: raw.year,
    chords,
  })

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: fontRegular!, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontBold!,    weight: 700, style: 'normal' },
    ],
  })

  const png = new Resvg(svg).render().asPng()

  return new Response(png.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
