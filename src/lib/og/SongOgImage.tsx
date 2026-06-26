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
  const titleSize = title.length > 38 ? 48 : title.length > 24 ? 58 : 68
  const artistLine = artist + (year ? ` · ${year}` : '')
  const chordLine = chords.slice(0, 8).join('   ·   ')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(145deg, #12102a 0%, #1e1245 60%, #0f1820 100%)',
        padding: '48px 64px 52px',
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#a78bfa',
          }} />
          <div style={{ fontSize: 20, color: '#a78bfa', fontWeight: 700, letterSpacing: 2 }}>
            CHORD SEQUENCE
          </div>
        </div>
        <div style={{
          fontSize: 16,
          color: 'rgba(255,255,255,0.7)',
          fontWeight: 500,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 20,
          padding: '6px 16px',
        }}>
          chordsequence.com
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Genre tag */}
      <div style={{ display: 'flex', marginBottom: 24 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}>
          CHORD CHART
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontSize: titleSize,
        fontWeight: 700,
        color: '#ffffff',
        lineHeight: 1.1,
        marginBottom: 14,
        letterSpacing: -0.5,
      }}>
        {title}
      </div>

      {/* Artist · Year */}
      <div style={{
        fontSize: 32,
        color: 'rgba(255,255,255,0.78)',
        marginBottom: 40,
        fontWeight: 400,
      }}>
        {artistLine}
      </div>

      {/* Divider */}
      <div style={{
        width: 48,
        height: 3,
        background: '#7c3aed',
        borderRadius: 2,
        marginBottom: 32,
      }} />

      {/* Stats pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{
          background: 'rgba(124,58,237,0.25)',
          border: '1.5px solid rgba(167,139,250,0.5)',
          borderRadius: 10,
          padding: '10px 22px',
          fontSize: 24,
          color: '#c4b5fd',
          fontWeight: 700,
        }}>
          {`Key of ${songKey}`}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1.5px solid rgba(255,255,255,0.18)',
          borderRadius: 10,
          padding: '10px 22px',
          fontSize: 24,
          color: 'rgba(255,255,255,0.85)',
          fontWeight: 400,
        }}>
          {`${bpm} BPM`}
        </div>
        {capo ? (
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1.5px solid rgba(255,255,255,0.18)',
            borderRadius: 10,
            padding: '10px 22px',
            fontSize: 24,
            color: 'rgba(255,255,255,0.85)',
            fontWeight: 400,
          }}>
            {`Capo ${capo}`}
          </div>
        ) : null}
      </div>

      {/* Chord list */}
      <div style={{
        fontSize: 24,
        color: 'rgba(255,255,255,0.65)',
        fontWeight: 400,
        letterSpacing: 1,
      }}>
        {chordLine}
      </div>

      {/* Decorative orb top-right */}
      <div style={{
        position: 'absolute',
        top: -120,
        right: -120,
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(109,40,217,0.35) 0%, transparent 65%)',
      }} />

      {/* Decorative orb bottom-left */}
      <div style={{
        position: 'absolute',
        bottom: -60,
        left: -60,
        width: 280,
        height: 280,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)',
      }} />
    </div>
  )
}
