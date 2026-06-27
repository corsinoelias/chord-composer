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
  const titleSize = title.length > 36 ? 50 : title.length > 22 ? 60 : 70
  const artistLine = artist + (year ? ` · ${year}` : '')
  const statsLine = `Key of ${songKey}  ·  ${bpm} BPM` + (capo ? `  ·  Capo ${capo}` : '')
  const displayChords = chords.slice(0, 7)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8f7ff',
        padding: '40px 60px 44px',
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      {/* Right side: staff lines + treble clef */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: 440,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* 5 staff lines grouped together like a real pentagrama */}
        <div style={{ position: 'absolute', right: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 38 }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: '100%', height: 4, background: 'rgba(124,58,237,0.1)', borderRadius: 2 }} />
          ))}
        </div>
        {/* Treble clef using Bravura font */}
        <div style={{
          position: 'absolute',
          left: 20,
          fontSize: 260,
          lineHeight: 1,
          color: 'rgba(124,58,237,0.12)',
          fontFamily: 'Bravura',
          fontWeight: 400,
        }}>
          𝄞
        </div>
      </div>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#7c3aed' }} />
          <div style={{ fontSize: 18, color: '#7c3aed', fontWeight: 700, letterSpacing: 2 }}>
            CHORD SEQUENCE
          </div>
        </div>
        <div style={{
          fontSize: 15,
          color: '#64748b',
          fontWeight: 500,
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          padding: '5px 16px',
          background: '#ffffff',
        }}>
          chordsequence.com
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 700, letterSpacing: 3, marginBottom: 18 }}>
          CHORD CHART
        </div>
        <div style={{ fontSize: titleSize, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, marginBottom: 10, letterSpacing: -1 }}>
          {title}
        </div>
        <div style={{ fontSize: 28, color: '#64748b', fontWeight: 400, marginBottom: 32 }}>
          {artistLine}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {displayChords.map((chord, i) => (
            <div key={i} style={{
              background: i === 0 ? '#7c3aed' : '#ffffff',
              color: i === 0 ? '#ffffff' : '#1e293b',
              border: i === 0 ? '2px solid #7c3aed' : '2px solid #e2e8f0',
              borderRadius: 12,
              padding: '10px 22px',
              fontSize: 26,
              fontWeight: 700,
            }}>
              {chord}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 19, color: '#64748b', fontWeight: 400 }}>
          {statsLine}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#7c3aed', color: '#ffffff', borderRadius: 14, padding: '14px 30px', fontSize: 20, fontWeight: 700 }}>
          <div style={{ fontWeight: 700 }}>Play chords</div>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  )
}
