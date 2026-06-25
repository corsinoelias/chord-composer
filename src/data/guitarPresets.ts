import type { GuitarTrack } from '../lib/guitarTab/types'

export interface GuitarPreset extends GuitarTrack {
  artist: string
  genre: string
  defaultSound: string
}

export const GUITAR_PRESETS: GuitarPreset[] = []
