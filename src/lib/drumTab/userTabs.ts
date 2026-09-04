import type { DrumTrack } from './types'

/**
 * The user's own saved drum tabs.
 *
 * These are deliberately kept apart from the working track. `DRUM_STORAGE_KEY`
 * ('drum-tab-track-v1') holds whatever is in the editor right now and is
 * rewritten by `useDrumTrackEditor` on every single edit — sharing that key
 * would wipe the saved list the first time someone clicked a cell.
 *
 * Same storage tier as the rest of the tool: this browser only, no Supabase.
 * Every read and write is guarded, because `localStorage` throws outright in
 * private mode and when the quota is full, and a library that cannot save is
 * still a library you can browse.
 */

export const USER_TABS_KEY = 'drum-tab-user-tabs-v1'

export interface UserTab {
  id: string
  name: string
  /** Epoch ms. Used for the "saved on" line and to keep the newest on top. */
  savedAt: number
  track: DrumTrack
}

function newId(): string {
  return 'ut-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

/** Cheap shape check: anything that survived a schema change is dropped, not crashed on. */
function isUserTab(value: unknown): value is UserTab {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<UserTab>
  return typeof t.id === 'string'
    && typeof t.name === 'string'
    && typeof t.savedAt === 'number'
    && !!t.track
    && Array.isArray(t.track.hits)
}

export function listUserTabs(): UserTab[] {
  try {
    const raw = localStorage.getItem(USER_TABS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isUserTab).sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}

/** Returns false when the write did not land, so the caller can say so. */
function write(tabs: UserTab[]): boolean {
  try {
    localStorage.setItem(USER_TABS_KEY, JSON.stringify(tabs))
    return true
  } catch {
    return false
  }
}

/**
 * Names do not have to be unique — two takes of the same groove are a normal
 * thing to keep — so this only avoids the confusion of an exact repeat.
 */
export function uniqueName(base: string, existing: UserTab[]): string {
  const taken = new Set(existing.map(t => t.name))
  if (!taken.has(base)) return base
  for (let n = 2; n < 999; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
  return base
}

export function saveUserTab(track: DrumTrack, name: string): UserTab[] {
  const tabs = listUserTabs()
  const tab: UserTab = {
    id: newId(),
    name: uniqueName(name.trim() || 'My rhythm', tabs),
    savedAt: Date.now(),
    // Snapshot, not a reference: later edits to the editor's track must not
    // reach back and rewrite what was saved.
    track: { ...structuredCloneSafe(track) },
  }
  const next = [tab, ...tabs]
  write(next)
  return next
}

export function renameUserTab(id: string, name: string): UserTab[] {
  const trimmed = name.trim()
  const tabs = listUserTabs()
  const next = trimmed
    ? tabs.map(t => (t.id === id ? { ...t, name: trimmed } : t))
    : tabs
  write(next)
  return next
}

export function duplicateUserTab(id: string): UserTab[] {
  const tabs = listUserTabs()
  const source = tabs.find(t => t.id === id)
  if (!source) return tabs
  const copy: UserTab = {
    id: newId(),
    name: uniqueName(`${source.name} (copy)`, tabs),
    savedAt: Date.now(),
    track: structuredCloneSafe(source.track),
  }
  const next = [copy, ...tabs]
  write(next)
  return next
}

export function deleteUserTab(id: string): UserTab[] {
  const next = listUserTabs().filter(t => t.id !== id)
  write(next)
  return next
}

/**
 * `structuredClone` is not in every browser this site still serves, and the
 * track is plain JSON, so the round-trip is both safe and enough.
 */
function structuredCloneSafe(track: DrumTrack): DrumTrack {
  return JSON.parse(JSON.stringify(track)) as DrumTrack
}
