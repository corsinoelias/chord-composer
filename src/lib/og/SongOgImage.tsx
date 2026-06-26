import React from 'react'

interface Props {
  title: string
  artist: string
  songKey: string
  bpm: number
  capo?: number
  year?: number
  chords: string[]
}

export function SongOgImage({ title, artist, songKey, bpm, capo, year, chords }: Props) {
  const fontSize = title.length > 40 ? 44 : title.length > 28 ? 52 : 62
  const artistLine = artist + (year ? ` · ${year}` : '')
  const chordLine = chords.slice(0, 9).join('  ·  ')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f1318 0%, #1a0d3d 100%)',
        padding: '56px 64px',
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, color: '#a78bfa', fontWeight: 700, letterSpacing: 3 }}>
          CHORD SEQUENCE
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)' }}>
          chordsequence.com
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Music icon */}
      <div style={{ display: 'flex', marginBottom: 20 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(167,139,250,0.15)',
          border: '1.5px solid rgba(167,139,250,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          color: '#a78bfa',
        }}>
          ♪
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: 12 }}>
        {title}
      </div>

      {/* Artist · Year */}
      <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.5)', marginBottom: 36, fontWeight: 400 }}>
        {artistLine}
      </div>

      {/* Stats pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{
          background: 'rgba(167,139,250,0.12)',
          border: '1px solid rgba(167,139,250,0.3)',
          borderRadius: 8,
          padding: '7px 18px',
          fontSize: 17,
          color: '#a78bfa',
          fontWeight: 700,
        }}>
          {`Key ${songKey}`}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '7px 18px',
          fontSize: 17,
          color: 'rgba(255,255,255,0.6)',
          fontWeight: 400,
        }}>
          {`${bpm} BPM`}
        </div>
        {capo ? (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '7px 18px',
            fontSize: 17,
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 400,
          }}>
            {`Capo ${capo}`}
          </div>
        ) : null}
      </div>

      {/* Chord list */}
      <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.35)', fontWeight: 400, letterSpacing: 0.5 }}>
        {chordLine}
      </div>

      {/* Decorative orb */}
      <div style={{
        position: 'absolute',
        top: -80,
        right: -80,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)',
      }} />
    </div>
  )
}
