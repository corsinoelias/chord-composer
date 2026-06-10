# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Astro dev server (http://localhost:4321)
npm run build      # Production build
npm run check      # Astro type check
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript-only type check (faster for catching errors)
npm run seed       # Seed songs to Supabase (requires .env)
```

There are no automated tests.

## Architecture

This is an **Astro + React** project deployed on Netlify. Astro handles routing and SSR; React runs as islands. The path alias `@/` maps to `src/`.

### Two independent apps live in one repo

**1. Chord Progression Editor** — mounted at `/editor/` and `/app/`
- Entry: `src/pages/editor/index.astro` → `src/components/EditorApp.tsx` → `src/react-pages/Index.tsx`
- Audio: `src/lib/audioEngine.ts` (Web Audio, drum samples + chord synthesis) + `src/lib/audioEffects.ts` (EQ/reverb/compression chain wired in on context creation)
- Songs persisted to Supabase via `src/lib/songStorageCloud.ts`; `src/lib/songStorage.ts` handles local/cloud sync
- `src/contexts/PlaybackContext.tsx` coordinates transport state across components

**2. Bass Tab Player** — mounted at `/tools/bass-guitar-tab/` and `/bass-tab`
- Entry: `src/pages/tools/bass-guitar-tab/index.astro` → `src/components/BassTabPlayer/BassTabPlayer.tsx`
- `BassTabPlayer.tsx` owns all state; `useTrackEditor` hook manages undo/redo (60-step history) and `localStorage` persistence under key `bass-tab-track-v1`
- Track can be shared via URL hash (`encodeTrackToHash` / `decodeTrackFromHash`)
- Audio: `src/lib/bassTab/bassAudio.ts` — pure Web Audio oscillator engine, separate from the chord editor's audio engine

### Bass Tab component map

| File | Role |
|---|---|
| `BassTabGrid.tsx` | Piano-roll editor. `PPB = 80` px per beat. Handles multi-select (Shift+drag rubber band, Shift+click), copy/paste, drag-move, resize |
| `BassTabFretboard.tsx` | Interactive fretboard. `MIN_FRETS=7`, `ROW_H=56`. Scale computed from container width |
| `BassTabTransport.tsx` | Transport bar: BPM, sound picker (Pick/Synth/Slap), undo/redo, export |
| `RecordingOverlay.tsx` | Full-screen recording. Uses `RECORDING_BPM = 40` (slow for input); recorded beats are BPM-agnostic so they play at the track's actual BPM |
| `MobileBarView.tsx` | Bar-by-bar view for mobile (used in reviewing recordings) |

### Bass audio engine (`src/lib/bassTab/bassAudio.ts`)

- `BassSound = 'electric' | 'picked' | 'synth' | 'slap'` — `'electric'` is kept in the type but removed from the UI; presets that used it are remapped to `'synth'` at load time
- Default sound is `'synth'`
- `startRecordingMetronome` drives both countdown and recording phases at `RECORDING_BPM`
- `renderTrackOffline` uses `OfflineAudioContext` for WAV export

### String tuning (bass)

Defined in `src/lib/bassTab/bassTheory.ts`. Index 0 = G2 (thinnest), index 3 = E1 (thickest). MIDI notes: G2=43, D2=38, A1=33, E1=28.

### Supabase

Client in `src/integrations/supabase/client.ts`. Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. The chord editor uses it for song storage; the bass tab player does not use Supabase.

### Content

Blog posts in `src/content/blog/` (MDX). Learn articles in `src/content/learn/` (MDX). Song data in `src/data/songs.ts` and Supabase. Presets (bass tab) in `src/data/presets.ts`.
