// "My Songs" — recordings and opened .mid files a visitor saves for later.
// No account needed: persisted client-side only, same pattern as the Bass
// Tab Player's 'bass-tab-track-v1' key (BassTabPlayer.tsx).

const KEY = 'piano-my-songs-v1'
const MAX_SONGS = 20

export interface MySongNote { midi: number; time: number; dur: number }

export interface MySong {
  id: string
  name: string
  createdAt: number
  source: 'recording' | 'midi'
  bpm: number
  notes: MySongNote[]
}

function readAll(): MySong[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(songs: MySong[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs))
    return true
  } catch {
    return false // quota exceeded or storage unavailable — caller decides how to surface it
  }
}

export function getMySongs(): MySong[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt)
}

/** Returns the saved song's id, or null if storage failed (e.g. quota). */
export function saveMySong(song: Omit<MySong, 'id' | 'createdAt'>): string | null {
  const all = readAll()
  const entry: MySong = { ...song, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() }
  const next = [entry, ...all].slice(0, MAX_SONGS)
  return writeAll(next) ? entry.id : null
}

export function renameMySong(id: string, name: string): void {
  const all = readAll()
  const song = all.find(s => s.id === id)
  if (song) { song.name = name; writeAll(all) }
}

export function deleteMySong(id: string): void {
  writeAll(readAll().filter(s => s.id !== id))
}
