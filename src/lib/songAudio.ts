// Vocal/reference audio for the Song Creator — a single file shared by a whole song,
// uploaded once to the `song-audio` Supabase Storage bucket (public read; write/replace/
// delete restricted by RLS to the song's own owner — see
// supabase/migrations/20260723_song_audio_track.sql). Superseded the earlier local-only
// prototype (URL.createObjectURL, never persisted) once the UX/sync engine were proven out.

import { supabase, ensureAuth } from './supabase';

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_DURATION_SEC = 7 * 60; // 7 minutes
const BUCKET = 'song-audio';

export interface AudioValidation {
  ok: boolean;
  durationSec?: number;
  reason?: string;
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => reject(new Error('unreadable'));
    audio.src = url;
  });
}

export async function validateAudioFile(file: File): Promise<AudioValidation> {
  if (!file.type.startsWith('audio/')) {
    return { ok: false, reason: 'El archivo debe ser de audio.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `El archivo pesa demasiado (máx. ${MAX_FILE_BYTES / (1024 * 1024)} MB).` };
  }

  const url = URL.createObjectURL(file);
  try {
    const durationSec = await readDuration(url);
    if (durationSec > MAX_DURATION_SEC) {
      return { ok: false, reason: `El audio dura demasiado (máx. ${MAX_DURATION_SEC / 60} minutos).` };
    }
    return { ok: true, durationSec };
  } catch {
    return { ok: false, reason: 'No se pudo leer el archivo de audio.' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SongAudioUploadResult {
  ok: true;
  url: string;
  path: string;
  durationSec: number;
}

export interface SongAudioUploadError {
  ok: false;
  reason: string;
}

// `songId` scopes the storage path — for a brand-new song this is a client-generated
// UUID minted before the first save (see SongCreator/index.tsx), not yet a real
// public_songs row; the RLS policy explicitly allows the first write into such a
// folder (see migration). Re-uploading under the same songId (replacing the file)
// works the same way once the row exists, since ownership is enforced by then.
export async function uploadSongAudio(songId: string, file: File): Promise<SongAudioUploadResult | SongAudioUploadError> {
  if (!supabase) return { ok: false, reason: 'Supabase no está configurado.' };

  const userId = await ensureAuth();
  if (!userId) return { ok: false, reason: 'Iniciá sesión para adjuntar audio.' };

  const validation = await validateAudioFile(file);
  if (!validation.ok) return { ok: false, reason: validation.reason ?? 'Archivo inválido.' };

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'mp3';
  const path = `${songId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, reason: 'No se pudo subir el archivo.' };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path, durationSec: validation.durationSec! };
}

// Best-effort — never throws. Called when replacing/removing a song's audio, and when
// deleting a song entirely (see publicSongs.ts's deletePublicSong).
export async function deleteSongAudio(path: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (err) {
    console.warn('deleteSongAudio failed:', err);
  }
}
