import type { APIContext } from 'astro'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import React from 'react'
import { PageOgImage } from '../../../../lib/og/PageOgImage'

let fontRegular: ArrayBuffer | null = null
let fontBold: ArrayBuffer | null = null
let fontBravura: ArrayBuffer | null = null

async function loadFonts(origin: string): Promise<void> {
  const [r, b, m] = await Promise.all([
    fontRegular  ? Promise.resolve(fontRegular)  : fetch(`${origin}/fonts/Inter-Regular.woff`).then(r => r.arrayBuffer()),
    fontBold     ? Promise.resolve(fontBold)     : fetch(`${origin}/fonts/Inter-Bold.woff`).then(r => r.arrayBuffer()),
    fontBravura  ? Promise.resolve(fontBravura)  : fetch(`${origin}/fonts/MusicFont.otf`).then(r => r.arrayBuffer()),
  ])
  fontRegular = r
  fontBold    = b
  fontBravura = m
}

export const GET = async ({ url }: APIContext): Promise<Response> => {
  const title   = url.searchParams.get('t') ?? 'Chord Sequence'
  const tagline = url.searchParams.get('d') ?? 'Free online music tools'
  const tags    = url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []

  await loadFonts(url.origin)

  const element = React.createElement(PageOgImage, { title, tagline, tags })

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter',   data: fontRegular!, weight: 400, style: 'normal' },
      { name: 'Inter',   data: fontBold!,    weight: 700, style: 'normal' },
      { name: 'Bravura', data: fontBravura!, weight: 400, style: 'normal' },
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
