import React from 'react'

interface Props {
  title: string
  tagline: string
  tags: string[]
}

export function PageOgImage({ title, tagline, tags }: Props) {
  const titleFontSize = title.length > 32 ? 48 : title.length > 22 ? 56 : 64

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8f7ff',
        padding: '44px 64px 48px',
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      {/* Staff lines + treble clef */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: 440, height: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', right: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 38 }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: '100%', height: 4, background: 'rgba(124,58,237,0.1)', borderRadius: 2 }} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 20, fontSize: 260, lineHeight: 1, color: 'rgba(124,58,237,0.12)', fontFamily: 'Bravura', fontWeight: 400 }}>
          𝄞
        </div>
      </div>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#7c3aed' }} />
          <div style={{ fontSize: 18, color: '#7c3aed', fontWeight: 700, letterSpacing: 2 }}>CHORD SEQUENCE</div>
        </div>
        <div style={{ fontSize: 15, color: '#64748b', fontWeight: 500, border: '1px solid #e2e8f0', borderRadius: 20, padding: '5px 16px', background: '#ffffff' }}>
          chordsequence.com
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: titleFontSize, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, marginBottom: 18, letterSpacing: -1 }}>
          {title}
        </div>
        <div style={{ fontSize: 24, color: '#475569', fontWeight: 400, lineHeight: 1.45, marginBottom: 36 }}>
          {tagline}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tags.map((t, i) => (
            <div key={i} style={{
              background: i === 0 ? 'rgba(124,58,237,0.1)' : '#ffffff',
              color: i === 0 ? '#7c3aed' : '#475569',
              border: i === 0 ? '1.5px solid rgba(124,58,237,0.3)' : '1.5px solid #e2e8f0',
              borderRadius: 20,
              padding: '8px 20px',
              fontSize: 17,
              fontWeight: i === 0 ? 700 : 400,
            }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
