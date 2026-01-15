/**
 * Song Storage System
 * 
 * Handles persistence of songs to localStorage
 */

import { Song, generateSongId } from './songs';

const STORAGE_KEY = 'chord-player-songs';

/**
 * Get all saved songs
 */
export function getSongs(): Song[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const songs = JSON.parse(data) as Song[];
    // Sort by updatedAt descending (most recent first)
    return songs.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Error loading songs:', error);
    return [];
  }
}

/**
 * Get a single song by ID
 */
export function getSongById(id: string): Song | null {
  const songs = getSongs();
  return songs.find(s => s.id === id) || null;
}

/**
 * Save or update a song
 */
export function saveSong(song: Song): void {
  const songs = getSongs();
  const index = songs.findIndex(s => s.id === song.id);
  
  const updatedSong = {
    ...song,
    updatedAt: new Date().toISOString(),
  };
  
  if (index >= 0) {
    songs[index] = updatedSong;
  } else {
    songs.push(updatedSong);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

/**
 * Delete a song by ID
 */
export function deleteSong(id: string): void {
  const songs = getSongs();
  const filtered = songs.filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Duplicate a song
 */
export function duplicateSong(id: string): Song | null {
  const original = getSongById(id);
  if (!original) return null;
  
  const duplicate: Song = {
    ...original,
    id: generateSongId(),
    title: `${original.title} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  saveSong(duplicate);
  return duplicate;
}

/**
 * Export all songs as JSON string
 */
export function exportSongsToJson(): string {
  const songs = getSongs();
  return JSON.stringify(songs, null, 2);
}

/**
 * Import songs from JSON string
 */
export function importSongsFromJson(jsonString: string): number {
  try {
    const imported = JSON.parse(jsonString) as Song[];
    if (!Array.isArray(imported)) {
      throw new Error('Invalid format: expected array');
    }
    
    const existing = getSongs();
    const existingIds = new Set(existing.map(s => s.id));
    
    let importedCount = 0;
    for (const song of imported) {
      if (!existingIds.has(song.id)) {
        saveSong(song);
        importedCount++;
      }
    }
    
    return importedCount;
  } catch (error) {
    console.error('Error importing songs:', error);
    throw error;
  }
}
