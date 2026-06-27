import React from 'react'

interface Props {
  title: string
  description: string
  tags: string[]
}

export function LearnOgImage({ title, description, tags }: Props) {
  const titleSize = title.length > 50 ? 42 : title.length > 36 ? 50 : 58
  const shortDesc = description.length > 150 ? description.slice(0, 148) + '…' : description
  const displayTags = tags.slice(0, 3)

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
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 700, letterSpacing: 3, marginBottom: 18 }}>
          LEARN
        </div>
        <div style={{ fontSize: titleSize, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, marginBottom: 14, letterSpacing: -1 }}>
          {title}
        </div>
        <div style={{ fontSize: 22, color: '#64748b', fontWeight: 400, lineHeight: 1.45, marginBottom: 28 }}>
          {shortDesc}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {displayTags.map((tag, i) => (
            <div key={i} style={{
              background: i === 0 ? 'rgba(124,58,237,0.1)' : '#ffffff',
              color: i === 0 ? '#7c3aed' : '#475569',
              border: i === 0 ? '1.5px solid rgba(124,58,237,0.3)' : '1.5px solid #e2e8f0',
              borderRadius: 20,
              padding: '7px 18px',
              fontSize: 16,
              fontWeight: i === 0 ? 700 : 400,
            }}>
              {tag}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
