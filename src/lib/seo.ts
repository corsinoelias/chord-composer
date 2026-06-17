/** Production site — used for canonical URLs and Open Graph absolute assets. */
export const SITE_ORIGIN = 'https://chordsequence.com';

export const SEO_OG = {
  imageUrl: `${SITE_ORIGIN}/og-image.jpg`,
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt:
    'Chord Player — chord progression editor with playback and MP3 export on chordsequence.com',
  siteName: 'Chord Sequence',
} as const;

export function editorPath(songId?: string | null) {
  if (songId) return `/editor/${songId}`;
  return '/editor';
}

export function editorCanonicalUrl(songId?: string | null) {
  return `${SITE_ORIGIN}${editorPath(songId)}`;
}
