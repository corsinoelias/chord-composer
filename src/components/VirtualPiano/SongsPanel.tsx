import React, { useEffect, useState } from 'react'
import { PIANO_SONGS, type PianoSong } from '../../lib/virtualPiano/pianoSongs'
import { deleteMySong, getMySongs, renameMySong, type MySong } from '../../lib/virtualPiano/mySongs'
import { buildMidiFile, download } from '../../lib/virtualPiano/pianoAudio'
import type { TransportSong } from './usePianoTransport'
import { TEAL, TEXT_DIM, TEXT_HI, TEXT_MED, VIOLET, ghostBtn, pillBtn } from './pianoTheme'

interface Props {
  open: boolean
  onClose: () => void
  onPlay: (song: TransportSong, opts: { practice: boolean }) => void
  onOpenMidi: () => void
  refreshKey: number
}

const DIFFS: { name: PianoSong['diff']; color: string }[] = [
  { name: 'Easy', color: '#7BC47F' },
  { name: 'Medium', color: VIOLET },
  { name: 'Hard', color: '#D97757' },
]

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function SongsPanel({ open, onClose, onPlay, onOpenMidi, refreshKey }: Props) {
  const [tab, setTab] = useState<'library' | 'mine'>('library')
  const [mySongs, setMySongs] = useState<MySong[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (open) setMySongs(getMySongs())
  }, [open, refreshKey])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,16,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', maxHeight: '82vh', overflow: 'auto', background: '#1d1830', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, boxShadow: '0 20px 60px rgba(20,16,32,.35)', padding: 20, color: TEXT_HI }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, margin: 0, fontWeight: 600 }}>Songs</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_MED, cursor: 'pointer', fontSize: 18, padding: 6 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setTab('library')} style={pillBtn(tab === 'library')}>Library</button>
          <button onClick={() => setTab('mine')} style={pillBtn(tab === 'mine')}>My Songs{mySongs.length ? ` (${mySongs.length})` : ''}</button>
          <div style={{ flex: 1 }} />
          <button onClick={onOpenMidi} style={ghostBtn()}>Open MIDI…</button>
        </div>

        {tab === 'library' && <LibraryTab onPlay={onPlay} />}

        {tab === 'mine' && (
          mySongs.length === 0 ? (
            <p style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.6, margin: '10px 4px' }}>
              No saved songs yet. Record something and choose <b style={{ color: TEXT_MED }}>Save to My Songs</b>, or open a .mid file — both let you save a copy here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mySongs.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === s.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameMySong(s.id, renameValue.trim() || s.name); setMySongs(getMySongs()); setRenamingId(null) }
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => { renameMySong(s.id, renameValue.trim() || s.name); setMySongs(getMySongs()); setRenamingId(null) }}
                        style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: TEXT_HI, borderRadius: 6, padding: '4px 8px', fontSize: 14, width: '100%' }}
                      />
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    )}
                    <div style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: TEAL, marginTop: 3 }}>
                      {s.source === 'recording' ? 'Recording' : 'MIDI file'} · {fmtDate(s.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => onPlay({ name: s.name, bpm: s.bpm, notes: s.notes }, { practice: false })}
                      title="Play"
                      style={{ ...ghostBtn(), padding: '7px 11px', fontSize: 12 }}
                    >▶</button>
                    <button
                      onClick={() => onPlay({ name: s.name, bpm: s.bpm, notes: s.notes }, { practice: true })}
                      title="Practice"
                      style={{ ...ghostBtn(), padding: '7px 11px', fontSize: 12 }}
                    >▼</button>
                    <button
                      onClick={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                      title="Rename"
                      style={{ ...ghostBtn(), padding: '7px 11px', fontSize: 12 }}
                    >✎</button>
                    <button
                      onClick={() => download(buildMidiFile(s.notes.map(n => ({ midi: n.midi, vel: 0.85, inst: 'acoustic', tOn: n.time, tOff: n.time + n.dur }))), s.name.replace(/[^\w-]+/g, '_') + '.mid')}
                      title="Download MIDI"
                      style={{ ...ghostBtn(), padding: '7px 11px', fontSize: 12 }}
                    >⬇</button>
                    <button
                      onClick={() => { deleteMySong(s.id); setMySongs(getMySongs()) }}
                      title="Delete"
                      style={{ ...ghostBtn(), padding: '7px 11px', fontSize: 12, color: '#ff8a9c' }}
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function LibraryTab({ onPlay }: { onPlay: Props['onPlay'] }) {
  const groups = DIFFS.map(d => ({
    ...d,
    songs: PIANO_SONGS.filter(sg => sg.diff === d.name),
  })).filter(g => g.songs.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map(g => (
        <div key={g.name}>
          <h4 style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: g.color, margin: '0 0 8px' }}>{g.name}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.songs.map(song => (
              <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{song.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {song.tags.map(tag => (
                      <span key={tag} style={{ fontSize: 10.5, color: TEXT_DIM, background: 'rgba(255,255,255,.06)', borderRadius: 999, padding: '2px 9px' }}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onPlay({ name: song.name, bpm: song.bpm, notes: song.notes.map(([midi, start, dur]) => ({ midi, time: start * (60 / song.bpm), dur: dur * (60 / song.bpm) })) }, { practice: false })}
                    style={{ ...pillBtn(true), padding: '7px 12px', fontSize: 12 }}
                  >▶ Play</button>
                  <button
                    onClick={() => onPlay({ name: song.name, bpm: song.bpm, notes: song.notes.map(([midi, start, dur]) => ({ midi, time: start * (60 / song.bpm), dur: dur * (60 / song.bpm) })) }, { practice: true })}
                    style={{ ...ghostBtn(), padding: '7px 12px', fontSize: 12 }}
                  >▼ Practice</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
