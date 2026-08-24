// Cloud sharing for a Virtual Piano recording — the counterpart to mySongs.ts, which
// is deliberately localStorage-only and login-free. Sharing needs a server-side row to
// point a link at, so it's the one piano feature gated behind an account; everything
// else (recording, playing back, downloading, My Songs) keeps working logged out.
//
// Mirrors src/lib/songStorageCloud.ts's conventions on purpose: never throws, returns
// null/false on failure with console.error, and every write opens with the same
// `ensureAuth()` + `!supabase` guard.

import { supabase, ensureAuth } from '../supabase'
import type { RecEvent } from './pianoAudio'

// Versioned so a future shape change can be read alongside old rows instead of
// migrating them all at once — see the migration's header comment.
export interface SharedRecordingData {
  v: 1
  name: string
  durationSec: number
  events: RecEvent[]
}

export interface SharedRecording {
  id: string
  data: SharedRecordingData
  isOwner: boolean
  isPublic: boolean
}

// Guards against an accidental multi-hour recording (the piano itself caps a single
// take at 5 minutes, VirtualPiano.tsx's 300s hard stop) turning into an oversized jsonb
// row — generous enough that no real recording should ever hit it.
const MAX_EVENTS = 20_000

/** Creates a new shared row (already public) and returns its id, or null on failure. */
export async function createSharedRecording(name: string, durationSec: number, events: RecEvent[]): Promise<string | null> {
  const userId = await ensureAuth()
  if (!supabase || !userId) return null
  if (events.length === 0 || events.length > MAX_EVENTS) return null

  const data: SharedRecordingData = { v: 1, name, durationSec, events }
  const { data: row, error } = await supabase
    .from('piano_recordings')
    .insert({ user_id: userId, data, is_public: true })
    .select('id')
    .single()
  if (error || !row) {
    console.error('Cloud createSharedRecording error:', error?.message)
    return null
  }
  return row.id as string
}

/** Opt a recording in/out of being readable via its /piano/r/<id> link. Owner only. */
export async function setRecordingVisibility(id: string, isPublic: boolean): Promise<boolean> {
  const userId = await ensureAuth()
  if (!supabase || !userId) return false
  const { data, error } = await supabase
    .from('piano_recordings')
    .update({ is_public: isPublic })
    .eq('id', id)
    .eq('user_id', userId) // belt-and-braces: RLS is the real gate
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('Cloud setRecordingVisibility error:', error.message)
    return false
  }
  return !!data
}

/**
 * Permanently removes a shared recording — called when its My Songs entry is deleted
 * (see SongsPanel.tsx's delete handler + mySongs.ts's sharedId), so deleting a
 * recording doesn't leave an orphaned link nothing local points at any more. Owner
 * only; a logged-out visitor deleting a locally-saved entry just no-ops here (RLS
 * denies it) — the local delete still goes through regardless.
 */
export async function deleteSharedRecording(id: string): Promise<boolean> {
  const userId = await ensureAuth()
  if (!supabase || !userId) return false
  const { error } = await supabase
    .from('piano_recordings')
    .delete()
    .eq('id', id)
    .eq('user_id', userId) // belt-and-braces: RLS is the real gate
  if (error) {
    console.error('Cloud deleteSharedRecording error:', error.message)
    return false
  }
  return true
}

/**
 * For the /piano/r/<id> viewer route. Reports ownership so the page can distinguish
 * "your own link" from a genuinely shared one, same reasoning as getSongForViewer.
 */
export async function getSharedRecording(id: string): Promise<SharedRecording | null> {
  if (!supabase) return null
  const userId = await ensureAuth()
  const { data, error } = await supabase
    .from('piano_recordings')
    .select('data, user_id, is_public')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return {
    id,
    data: data.data as SharedRecordingData,
    isOwner: !!userId && data.user_id === userId,
    isPublic: !!data.is_public,
  }
}
