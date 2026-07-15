# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start Astro dev server (http://localhost:4321)
npm run build         # Production build
npm run check         # Astro type check
npm run check:schema  # Fails if any page has FAQPage JSON-LD (see note below)
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript-only type check (faster for catching errors)
npm run seed          # Seed songs to Supabase (requires .env)
```

There are no automated tests.

**Never add FAQPage schema.** Google restricted FAQ rich results to government/health
sites in Aug 2023 — this site doesn't qualify. This has already recurred twice (removed
from 3 pages in June, reappeared on 10 new pages by July since each page declared its own
inline `faqSchema` with no shared component). Run `npm run check:schema` before deploying;
visible FAQ content on a page is fine, it just must never be serialized as
`'@type': 'FAQPage'` JSON-LD.

## Architecture

This is an **Astro + React** project deployed on Netlify. Astro handles routing and SSR; React runs as islands. The path alias `@/` maps to `src/`.

### Two independent apps live in one repo

**1. Chord Progression Editor** — mounted at `/editor/` and `/app/`
- Entry: `src/pages/editor/index.astro` → `src/components/EditorApp.tsx` → `src/react-pages/Index.tsx`
- Audio: `src/lib/audioEngine.ts` (Web Audio, drum samples + chord synthesis) + `src/lib/audioEffects.ts` (EQ/reverb/compression chain wired in on context creation)
- Songs persisted to Supabase via `src/lib/songStorageCloud.ts`; `src/lib/songStorage.ts` re-exports it (thin shim — there is no local fallback anymore)
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

### Chord Editor — key data flow

**Chord / Section model**
- `Section` (in `src/lib/sections.ts`): `{ id, name, chords: Chord[], repeatCount, bassVariationId?, pianoVariationId?, guitarVariationId? }`
- `Chord` (in `src/lib/musicTheory.ts`): `{ id, root, accidental, quality, duration (beats), bassNote? }`
- All editor state lives in `Index.tsx` (`sections`, `instruments`, `bpm`, `selectedStyleId`, etc.) — `SectionCard.tsx` receives props and callbacks, holds no state of its own

**Drag-and-drop** — chord reordering uses `@dnd-kit/core` + `@dnd-kit/sortable` wired in `Index.tsx`

**Keyboard shortcuts** — `useKeyboardShortcuts` hook: Space = play/stop, +/- = BPM, M = metronome toggle, Arrow keys = navigate chords

### Audio engine — scheduling model

`scheduleProgression` in `audioEngine.ts` is the core loop. It is **bar-by-bar**: it schedules one chord segment at a time, then queues itself via `setTimeout` for the next segment. This is what enables live parameter changes without restarting.

**What updates when during playback (no restart needed):**
- BPM, metronome, transposition, style pattern, instrument sounds: picked up each bar via dynamic getters (`getBpm`, `getMetronome`, `getTransposition`, `getStyle`, `getInstruments`)
- Section melodic variations (`pianoVariationId`, `bassVariationId`, `guitarVariationId`): picked up each bar via `getPianoScale(sectionId)` / `getBassScale` / `getGuitarScale` — these read from `optionsRef.current?.sections`
- Chord structure changes (adding/removing chords): picked up at **loop end** — `getSections()` is called in `onLoopEnd` to rebuild `chordSegments`

**The `optionsRef` pattern in `PlaybackContext.tsx`** — `play()` stores all options in `optionsRef.current` and `sectionsRef.current`. The dynamic getters passed to `scheduleProgression` close over these refs, so calling `updatePlaybackOptions(updates)` mutates `optionsRef.current` in place and the running scheduler picks up the new values on the next bar without restarting.

### Style system

`StylePattern` (in `src/lib/styles.ts`) defines a rhythm style:
- `rhythm.*` arrays: 16 slots (16th note resolution). `0` = silence, `0.5` = ghost, `1` = accent
- `swing?`: 0-1, opt-in per style (only `jazz_light`/"Jazz Swing" sets it today). Shifts the "and" 8th note of each beat (slot ≡ 2 mod 4) later in time via `getSwingOffset(style, patternSlot, slotDuration)` — 0 = straight (50% of the beat, every other style's behavior), 1 = full triplet swing (66.7%). Applied in both the live scheduler and the offline WAV-export path in `audioEngine.ts`; the 0-1 velocity values in `rhythm.*` are unaffected either way
- `arpeggios.piano/guitar`: per-slot arpeggio cells (`type: 'up'|'down'|'updown'|'random'`, `speed`)
- `fill`: pattern applied on bar 4 / bar 8
- `instrumentSounds`: default sound type IDs per instrument for this style
- `volumes`: per-instrument volume defaults

**Custom styles and overrides** flow: Supabase `user_settings` table → `getUserSettings()` → `initCustomStylesCache()` (called at app init) → in-memory cache in `customStyles.ts` (`getCustomStyles()` / `getStyleOverride()`). Both are then passed into `PlayOptions` and read by `getStyle()` each bar.

**Default style** — a brand-new song (no `?style=` param, no song id in the URL) defaults to `'reggaeton'`, set in `getInitialStyleId()` in `Index.tsx`. This is independent of `MUSICAL_STYLES[0]` (`'pop_1'`), which several components (`ChordEmbed`, `SongChordPlayer`, `resolveActiveStyle`) fall back to when a given style id isn't found — e.g. any content still using the stale, non-existent `style="pop_basic"` id silently resolves to `pop_1` via that fallback, not to the reggaeton default.

**`useStyleInstruments` hook** — when `selectedStyleId` changes it automatically updates instrument sound types and volumes from `style.instrumentSounds` / `style.volumes`, preserving the user's mute/solo state. It skips the first render to avoid overwriting user customizations on load.

### Melodic scale system (`src/lib/bassScale.ts`)

Provides per-section melodic patterns on top of rhythm styles. Each section can have a different variation per instrument (`pianoVariationId`, etc.).
- `BassScaleData.pattern`: `DegreePattern` — velocity array per scale degree (1–8), length = `loopBars * 16` slots
- `resolveVariation(melodic, variationId)` picks the matching variation (or the first if unset)
- Scale semitone offsets from the chord root are in `SCALE_SEMITONES`

### Supabase

Client in `src/lib/supabase.ts`. Requires `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in `.env`. Uses real email/password accounts — `ensureAuth()` returns the current user's id or `null` if logged out; it never creates a session. Saving is gated behind login: the editor works fully without an account, but autosave and song persistence only run once the user signs up/in via `AuthModal`. The chord editor uses it for song storage (`progressions` table) and user settings (custom styles/overrides); the bass tab player does not use Supabase.

### Content

Blog posts in `src/content/blog/` (MDX). Learn articles in `src/content/learn/` (MDX). Song data in `src/data/songs.ts` and Supabase. Presets (bass tab) in `src/data/presets.ts`.
