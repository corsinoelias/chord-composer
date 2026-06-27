import type { APIContext } from 'astro'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import React from 'react'
import { SongOgImage } from '../../../../lib/og/SongOgImage'
import { SONGS, extractChordsFromSong } from '../../../../data/songs'

export const prerender = true

export function getStaticPaths() {
  return SONGS.map(s => ({ params: { slug: s.slug } }))
}

async function loadFonts(origin: string): Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> {
  return Promise.all([
    fetch(`${origin}/fonts/Inter-Regular.woff`).then(r => r.arrayBuffer()),
    fetch(`${origin}/fonts/Inter-Bold.woff`).then(r => r.arrayBuffer()),
    fetch(`${origin}/fonts/MusicFont.otf`).then(r => r.arrayBuffer()),
  ])
}

export const GET = async ({ params, url }: APIContext): Promise<Response> => {
  const slug = params.slug as string
  const song = SONGS.find(s => s.slug === slug)
  if (!song) return new Response('Not found', { status: 404 })

  const chords = [...new Set(extractChordsFromSong(song))]
  const [fontRegular, fontBold, fontBravura] = await loadFonts(url.origin)

  const element = React.createElement(SongOgImage, {
    title: song.title,
    artist: song.artist,
    songKey: song.key,
    bpm: song.bpm,
    capo: song.capo,
    year: song.year,
    chords,
  })

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter',   data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Inter',   data: fontBold,    weight: 700, style: 'normal' },
      { name: 'Bravura', data: fontBravura, weight: 400, style: 'normal' },
    ],
  })

  const png = new Resvg(svg).render().asPng()

  return new Response(png.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
