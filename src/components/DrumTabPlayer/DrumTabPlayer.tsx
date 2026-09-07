import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CHANNEL, DRUM_STORAGE_KEY, GRID_LABEL_W, GRID_LABEL_W_NARROW,
  STEPS_PER_BEAT, makeHitId, hitsSignature,
  type DrumChannel, type DrumKitId, type DrumPieceId, type DrumTrack, type DrumView,
} from '../../lib/drumTab/types'
import { defaultDrumTrack, getDrumPreset, type DrumPreset } from '../../data/drumPresets'
import { startPlayback, stopPlayback, seekPlayback, setMasterVolume, previewHit } from '../../lib/drumTab/drumAudio'
import { parseDrumTab } from '../../lib/drumTab/drumTabText'
import { encodeTrackToHash, decodeTrackFromHash, copyToClipboard } from '../../lib/drumTab/exportDrumTab'
import { exportDrumMidi } from '../../lib/drumTab/drumMidi'
import { exportDrumWav } from '../../lib/drumTab/exportDrumAudio'
import { importDrumMidi } from '../../lib/drumTab/drumMidiImport'
import { useDrumTrackEditor } from '../../hooks/useDrumTrackEditor'
import { useIsMobile, useIsDesktop, useIsShort, useIsWide, MOBILE_BREAKPOINT } from '../../hooks/use-mobile'
import { analytics } from '../../lib/analytics'
import { BT, BT_VARS, f } from '../../lib/bassTab/theme'
import { DrumTabTopBar } from './DrumTabTopBar'
import { DrumTabTransport } from './DrumTabTransport'
import { DrumTabKitStage } from './DrumTabKitStage'
import { DrumTabGrid } from './DrumTabGrid'
import { DrumTabArrangement } from './DrumTabArrangement'
import { DrumTabInspector } from './DrumTabInspector'
import { DrumTabMobileSheet } from './DrumTabMobileSheet'
import { DrumTabScore } from './DrumTabScore'
import { DrumTabTextEditor } from './DrumTabTextEditor'
import { DrumTabLibrary } from './DrumTabLibrary'
import { ConfirmDialog } from './ConfirmDialog'
import type { UserTab } from '../../lib/drumTab/userTabs'

/**
 * Drum Tab Player — owner of all state, the way `BassTabPlayer` is for the bass.
 *
 * It opens straight into the editor with a groove already loaded (no library
 * step to get past): whatever is in the URL hash, else whatever was last edited
 * in this browser, else the chord player's Rock Básico.
 *
 * **It fills the viewport.** Bands stacked: what the pattern is (top bar), the
 * kit playing it, the pattern itself, how the bars are grouped (the arrangement
 * lane), and the transport. The one thing that is not a band is the rhythm
 * library, which on a wide screen is a rail down the
 * left rather than a dialog — you pick a groove to compare it against the one
 * you have, and a dialog covers exactly the thing being compared. Below `lg` it
 * goes back to being a dialog, because at that width a rail is most of the
 * screen.
 *
 * **The playhead is not React state.** `drumAudio` reports the beat on every
 * animation frame; routing that through `useState` re-rendered this whole tree
 * sixty times a second, which on a phone is most of the frame budget spent
 * repainting a grid whose cells did not change. Instead the float lands in
 * `beatRef` and the components that draw a moving playhead (the grid, the kit,
 * the score) read it from there in their own frame loop and write to the DOM
 * directly. Only `currentSlot` — the sixteenth, so eight updates a second at
 * 120 BPM rather than sixty — is state, and only the two bars that print a
 * position consume it.
 */

/** Height of the site navbar (`h-16` in `Navbar.astro`), which sits above us. */
const NAVBAR_H = 64

const KIT_COLLAPSED_KEY = 'drum-tab-kit-collapsed-v1'
const MIXER_OPEN_KEY = 'drum-tab-mixer-open-v1'

/** URL hash → last session → the default groove. Same cascade as the bass tab. */
function loadInitialTrack(presetId?: string): DrumTrack {
  if (presetId) {
    const preset = getDrumPreset(presetId)
    if (preset) return preset.build()
  }
  if (typeof window !== 'undefined') {
    const fromHash = decodeTrackFromHash(window.location.hash)
    if (fromHash) return fromHash
    try {
      const raw = localStorage.getItem(DRUM_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as DrumTrack
        if (saved && Array.isArray(saved.hits)) return saved
      }
    } catch { /* private mode, corrupt entry — fall through to the default */ }
  }
  return defaultDrumTrack()
}

/**
 * Notation on a phone, the grid everywhere else.
 *
 * A phone's grid is one bar wide with a pager under it: it is the view you use
 * to *write* a beat, and it can only ever show you a quarter of a four-bar one.
 * The score fits the whole pattern on a screen that narrow because it wraps
 * onto systems, so it is the view that actually answers "what is this groove",
 * which is what someone opening the page on a phone is asking.
 *
 * Read synchronously rather than from `useIsMobile`, which reports `false` on
 * its first render: going through that would open the grid and swap it out a
 * frame later, and would also throw away a view the user had picked since.
 * Safe here because the editor mounts `client:only`, so there is no server
 * render for this to disagree with.
 */
function initialView(): DrumView {
  if (typeof window === 'undefined') return 'grid'
  return window.innerWidth < MOBILE_BREAKPOINT ? 'score' : 'grid'
}

/** Expanded on a first visit — the kit is the thing that says what this page is. */
function loadKitCollapsed(): boolean {
  try { return localStorage.getItem(KIT_COLLAPSED_KEY) === '1' } catch { return false }
}

/** Open by default: an empty third column teaches nobody that it exists. */
function loadMixerOpen(): boolean {
  try { return localStorage.getItem(MIXER_OPEN_KEY) !== '0' } catch { return true }
}

export function DrumTabPlayer({ initialPreset }: { initialPreset?: string } = {}) {
  const isMobile  = useIsMobile()
  const isDesktop = useIsDesktop()
  const isWide    = useIsWide()
  const isShort   = useIsShort()

  /**
   * A phone in landscape is wide enough for the desktop top bar and far too
   * short for it: at 844×390 it wrapped onto two rows and, with the kit band
   * under it, left the grid a couple of rows hidden behind the transport. Width
   * decides how much fits on a row; height decides how many rows there are.
   */
  const compactBars = isMobile || isShort

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialTrack = useMemo(() => loadInitialTrack(initialPreset), [])

  const {
    track, setTrack, canUndo, canRedo,
    addHit, deleteHit, replaceHits,
    setTotalBars, setSections, setBpm, loadTrack, clearAll, undo, redo,
  } = useDrumTrackEditor(initialTrack)

  const [isPlaying, setIsPlaying]     = useState(false)
  const [view, setView]               = useState<DrumView>(initialView)
  const [loop, setLoop]               = useState(true)
  const [metronome, setMetronome]     = useState(false)
  const [volume, setVolume]           = useState(0.9)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [presetId, setPresetId]       = useState(initialTrack.id)
  const [shareLabel, setShareLabel]   = useState('Copy share link')
  const [barPage, setBarPage]         = useState(0)
  const [kitCollapsed, setKitCollapsed] = useState(loadKitCollapsed)
  /**
   * On a short screen the kit starts as the icon strip and opens only if asked.
   * It is a separate, unsaved opt-in rather than a forced `kitCollapsed`: the
   * saved preference belongs to the screen it was set on, and a phone turned
   * sideways for one bar should not rewrite how the kit opens on a desktop.
   */
  const [kitOpenWhenShort, setKitOpenWhenShort] = useState(false)
  const [selectedPiece, setSelectedPiece] = useState<DrumPieceId | null>(null)
  const [mixerOpen, setMixerOpen] = useState(loadMixerOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  /**
   * Things the app did that leave nothing on screen to see — a link on the
   * clipboard, a file in the downloads folder — say so here. Before this,
   * Share's only feedback was the tooltip on the button you had just moved
   * off, which is feedback nobody reads.
   */
  const [toast, setToast] = useState<string | null>(null)
  /** Clearing every hit asks first; it is the one control here that discards work. */
  const [clearAsk, setClearAsk] = useState(false)
  /** Phone transport: folded to Play/BPM/position until asked to open. */
  const [transportExpanded, setTransportExpanded] = useState(false)

  // ── The playhead ──────────────────────────────────────────────────────────
  /** The live float, written every animation frame and never rendered from. */
  const beatRef = useRef(0)
  /** The sixteenth, for the two bars that print a position. */
  const [currentSlot, setCurrentSlot] = useState(0)
  const currentBeat = currentSlot / STEPS_PER_BEAT

  const getBeat = useCallback(() => beatRef.current, [])

  const handleBeat = useCallback((beat: number) => {
    beatRef.current = beat
    const slot = Math.floor(beat * STEPS_PER_BEAT + 1e-6)
    setCurrentSlot(prev => (prev === slot ? prev : slot))
  }, [])

  /**
   * The rail has nothing to close. It has to be a stable identity rather than an
   * inline arrow: the rail stays mounted and re-renders with this component,
   * which during playback is every frame, and a fresh callback each time defeats
   * the memo that keeps 30-odd preset thumbnails from re-rendering with it.
   */
  const noClose = useCallback(() => {}, [])

  // Getters the running scheduler reads each pass, so toggling loop or the
  // metronome — or editing the pattern itself — takes effect without restarting.
  const loopRef = useRef(loop); loopRef.current = loop
  const metroRef = useRef(metronome); metroRef.current = metronome
  const trackRef = useRef(track); trackRef.current = track
  const viewRef = useRef(view); viewRef.current = view

  const getTrack = useCallback(() => trackRef.current, [])
  const getLoop = useCallback(() => loopRef.current, [])
  const getMetronome = useCallback(() => metroRef.current, [])
  const getLoopRange = useCallback(() => null, [])

  useEffect(() => { setMasterVolume(volume) }, [volume])
  useEffect(() => () => { stopPlayback() }, [])

  useEffect(() => {
    try { localStorage.setItem(KIT_COLLAPSED_KEY, kitCollapsed ? '1' : '0') } catch { /* private mode */ }
  }, [kitCollapsed])

  useEffect(() => {
    try { localStorage.setItem(MIXER_OPEN_KEY, mixerOpen ? '1' : '0') } catch { /* private mode */ }
  }, [mixerOpen])

  // Keep the page in range when bars are removed.
  useEffect(() => {
    setBarPage(p => Math.max(0, Math.min(p, track.totalBars - 1)))
  }, [track.totalBars])

  const stop = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
    handleBeat(0)
  }, [handleBeat])

  const play = useCallback(() => {
    const t = trackRef.current
    const totalBeats = t.totalBars * t.beatsPerBar
    // Resume from wherever the cursor was left — a click in the score, a bar
    // tapped in the pager — rather than always from the top.
    const from = beatRef.current > 0 && beatRef.current < totalBeats - 1e-6 ? beatRef.current : 0
    setIsPlaying(true)
    analytics.drumTabPlay(viewRef.current)
    startPlayback(from, {
      getTrack, getLoop, getMetronome, getLoopRange,
      onBeat: handleBeat,
      onEnd: () => setIsPlaying(false),
    }).catch(() => { setIsPlaying(false) })
  }, [getTrack, getLoop, getMetronome, getLoopRange, handleBeat])

  const togglePlay = useCallback(() => {
    if (isPlaying) stop()
    else play()
  }, [isPlaying, play, stop])

  /**
   * Move the playhead. While the transport runs this repositions it inside the
   * lookahead window instead of restarting it, so tapping a bar or clicking the
   * score jumps there without a gap.
   */
  const seekToBeat = useCallback((beat: number) => {
    handleBeat(beat)
    seekPlayback(beat)
  }, [handleBeat])

  // Nothing restarts the transport any more: `getTrack` hands the scheduler the
  // live track on every pass, so a cell drawn, a fader moved, a kit swapped, a
  // bar added or the BPM dragged is heard on the next sixteenth.

  // ── Editing ───────────────────────────────────────────────────────────────
  const toggleCell = useCallback((pieceId: DrumPieceId, slot: number) => {
    const existing = trackRef.current.hits.find(
      h => h.pieceId === pieceId && Math.round(h.startBeat * STEPS_PER_BEAT) === slot,
    )
    if (existing) {
      deleteHit(existing.id)
      return
    }
    // A new hit inherits the row's current level, so drawing into a row that is
    // already set to a ghost level doesn't jump back to full velocity.
    const sameRow = trackRef.current.hits.find(h => h.pieceId === pieceId)
    const velocity = sameRow?.velocity ?? 0.9
    addHit({ id: makeHitId(), pieceId, startBeat: slot / STEPS_PER_BEAT, velocity })
    // Audition the stroke you just drew — unless the transport is about to play
    // it for you anyway, where the extra hit reads as a flam against the beat.
    if (!isPlaying) previewHit(trackRef.current.kit, pieceId, velocity, trackRef.current.mix)
  }, [addHit, deleteHit, isPlaying])

  const setRowVelocity = useCallback((pieceId: DrumPieceId, velocity: number) => {
    setTrack(t => ({
      ...t,
      hits: t.hits.map(h => h.pieceId === pieceId ? { ...h, velocity } : h),
    }))
  }, [setTrack])

  const previewRow = useCallback((pieceId: DrumPieceId) => {
    const t = trackRef.current
    const existing = t.hits.find(h => h.pieceId === pieceId)
    previewHit(t.kit, pieceId, existing?.velocity ?? 0.9, t.mix)
  }, [])

  /**
   * Change one piece's channel. Not pushed to undo history: a fader is dragged
   * dozens of times to find a balance, and filling the 60-step history with
   * those would bury the pattern edits undo is actually for.
   */
  const setChannel = useCallback((pieceId: DrumPieceId, patch: Partial<DrumChannel>) => {
    setTrack(t => ({
      ...t,
      mix: {
        ...t.mix,
        [pieceId]: { ...DEFAULT_CHANNEL, ...t.mix?.[pieceId], ...patch },
      },
    }))
  }, [setTrack])

  /** Pieces the pattern uses, for dimming the rest of the mixer. */
  const usedPieces = useMemo(
    () => new Set(track.hits.map(h => h.pieceId)),
    [track.hits],
  )

  /** The selected row's written velocity, or null when it has no strokes yet. */
  const selectedRowVelocity = useMemo(() => {
    if (!selectedPiece) return null
    return track.hits.find(h => h.pieceId === selectedPiece)?.velocity ?? null
  }, [track.hits, selectedPiece])

  /**
   * Striking a piece on the kit stage: it sounds, and its row becomes the
   * current one so the grid scrolls it into view ready to write into.
   */
  const hitPiece = useCallback((pieceId: DrumPieceId) => {
    setSelectedPiece(pieceId)
    previewRow(pieceId)
  }, [previewRow])

  /**
   * Applying the text view is idempotent: if the tab describes what the track
   * already holds, nothing happens and no undo entry is recorded.
   *
   * This matters because Apply fires twice for one user action — clicking the
   * button blurs the textarea first, so `onBlur` and `onClick` both run — and
   * guarding inside the text editor could not fix it: the second handler is a
   * closure captured before the first one's re-render, so it still believed it
   * had something new to apply. The second application recorded a "before"
   * snapshot of the already-edited track, which is what made undo look broken.
   * Comparing the music itself is the guard that cannot go stale.
   */
  const applyText = useCallback((text: string) => {
    const current = trackRef.current
    const parsed = parseDrumTab(text, current.beatsPerBar)
    const bars = Math.max(1, parsed.bars || current.totalBars)

    // Section comments (`// Verse`) are written into the tab and read back out
    // of it. Applied separately from the hits because a tab can carry only the
    // names — a text with no comment lines at all means "unchanged", not
    // "delete the arrangement", which is what dropping this branch would do to
    // anyone who pasted four bars into a track that had sections.
    const sectionsChanged = parsed.sections.length > 0 &&
      JSON.stringify(parsed.sections) !== JSON.stringify(current.sections ?? [])
    if (sectionsChanged) setSections(parsed.sections)

    if (bars === current.totalBars && hitsSignature(parsed.hits) === hitsSignature(current.hits)) return
    replaceHits(parsed.hits, bars)
    analytics.drumTabTextApplied()
  }, [replaceHits, setSections])

  /**
   * Plain → flam → drag → plain, on one stroke.
   *
   * Goes through `replaceHits` rather than mutating the hit in place because
   * that is what records the undo step — and an articulation is exactly the
   * kind of edit you want to be able to take back, since it is two clicks away
   * from the one you meant.
   */
  const cycleArticulation = useCallback((pieceId: DrumPieceId, slot: number) => {
    const current = trackRef.current
    const order = [undefined, 'flam', 'drag'] as const
    const next = current.hits.map(hit => {
      if (hit.pieceId !== pieceId) return hit
      if (Math.round(hit.startBeat * STEPS_PER_BEAT) !== slot) return hit
      const at = order.indexOf(hit.articulation)
      return { ...hit, articulation: order[(at + 1) % order.length] }
    })
    replaceHits(next, current.totalBars)
    previewHit(current.kit, pieceId, 0.9, current.mix)
  }, [replaceHits])

  const handleLoadPreset = useCallback((preset: DrumPreset) => {
    stop()
    loadTrack(preset.build())
    setPresetId(preset.id)
    setBarPage(0)
    analytics.drumTabPresetLoaded(preset.name, preset.source)
  }, [loadTrack, stop])

  /**
   * A saved tab carries its own track, so unlike a preset there is nothing to
   * build. `presetId` is cleared to the tab's id so no included rhythm keeps
   * showing as the active one.
   */
  const handleLoadUserTab = useCallback((tab: UserTab) => {
    stop()
    loadTrack(tab.track)
    setPresetId(tab.id)
    setBarPage(0)
    analytics.drumTabUserTabLoaded()
  }, [loadTrack, stop])

  /**
   * Export reads the track through `trackRef` rather than closing over it, so
   * these callbacks keep a stable identity — the top bar is memoised, and this
   * component re-renders on every sixteenth to move its position readout.
   */
  const [exporting, setExporting] = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const handleExportMidi = useCallback(() => {
    exportDrumMidi(trackRef.current)
    analytics.drumTabExport('midi')
    showToast('MIDI file downloaded')
  }, [showToast])

  const handleExportMidiSplit = useCallback(() => {
    exportDrumMidi(trackRef.current, { splitByPiece: true })
    analytics.drumTabExport('midi')
    showToast('MIDI downloaded — one track per piece')
  }, [showToast])

  const handleExportWav = useCallback(async () => {
    setExporting(true)
    try {
      await exportDrumWav(trackRef.current)
      analytics.drumTabExport('wav')
      showToast('WAV downloaded')
    } catch {
      // Rendering can fail where the browser will not open an audio context at
      // all; saying so beats a button that spins and then does nothing.
      showToast('Could not render the audio')
    } finally {
      setExporting(false)
    }
  }, [showToast])

  /**
   * Clear is the one control here that throws work away, so it asks. Undo would
   * bring the pattern back, but only for someone who knows that — and the
   * button sits next to Share, one icon away from a misfire.
   */
  const askClear = useCallback(() => setClearAsk(true), [])

  const confirmClear = useCallback(() => {
    setClearAsk(false)
    clearAll()
    showToast('Pattern cleared — undo brings it back')
  }, [clearAll, showToast])

  const cancelClear = useCallback(() => setClearAsk(false), [])

  // ── Import ────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)

  const openImport = useCallback(() => fileInputRef.current?.click(), [])

  /**
   * A `.mid` becomes the whole track — tempo, metre and bars included — rather
   * than being merged into the one that is open. Merging would need an answer
   * to "at which bar?" that the file does not carry, and loading is undoable.
   */
  const importFile = useCallback(async (file: File) => {
    try {
      const parsed = importDrumMidi(await file.arrayBuffer(), file.name)
      if (!parsed.track.hits.length) {
        showToast('No drum notes in that file')
        return
      }
      stop()
      loadTrack({
        ...trackRef.current,
        ...parsed.track,
        id: `midi-${Date.now().toString(36)}`,
        sections: undefined,
      })
      setBarPage(0)
      analytics.drumTabImport('midi')
      showToast(
        `Imported ${parsed.track.hits.length} hits` +
        (parsed.skipped ? ` · ${parsed.skipped} non-drum notes skipped` : ''),
      )
    } catch {
      // Bad file, SMPTE timing, or not a MIDI file at all — all of which look
      // the same to someone who just dragged the wrong thing in.
      showToast('Could not read that MIDI file')
    }
  }, [loadTrack, showToast, stop])

  const handleDrop = useCallback((e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0]
    if (!file || !/\.midi?$/i.test(file.name)) { setDropping(false); return }
    e.preventDefault()
    setDropping(false)
    void importFile(file)
  }, [importFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDropping(true)
  }, [])

  const handleShare = useCallback(async () => {
    const hash = encodeTrackToHash(trackRef.current)
    if (!hash) {
      setShareLabel('Could not build a link')
      showToast('This pattern is too big to fit in a link')
      return
    }
    const url = window.location.origin + window.location.pathname + hash
    window.history.replaceState(null, '', hash)
    const ok = await copyToClipboard(url)
    setShareLabel(ok ? 'Link copied' : 'Copy failed')
    showToast(ok
      ? 'Share link copied — it carries the whole pattern'
      : 'Could not reach the clipboard. The link is in the address bar.')
    if (ok) analytics.drumTabShared()
    setTimeout(() => setShareLabel('Copy share link'), 2200)
  }, [showToast])

  const setKit = useCallback((kit: DrumKitId) => {
    setTrack(t => ({ ...t, kit }))
  }, [setTrack])

  const setName = useCallback((name: string) => {
    setTrack(t => ({ ...t, name }))
  }, [setTrack])

  /** Live: the scheduler reads the tempo per pass, so no stop, no gap. */
  const handleBpmChange = useCallback((bpm: number) => setBpm(bpm, false), [setBpm])

  // Space toggles playback, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  // ── The phone's one-bar window ────────────────────────────────────────────
  // On a phone the grid shows one bar at a time; on desktop it scrolls.
  const barWindow = useMemo(
    () => (isMobile ? { start: barPage, count: 1 } : null),
    [isMobile, barPage],
  )
  // One gutter width for the grid and the lane, so their bars stay in column.
  const labelW = isMobile ? GRID_LABEL_W_NARROW : GRID_LABEL_W

  const slotsPerBar = track.beatsPerBar * STEPS_PER_BEAT
  const currentBar = Math.min(track.totalBars - 1, Math.floor(currentSlot / slotsPerBar))

  /**
   * The pager follows the transport. Without this the phone showed bar 1 for
   * the whole of a four-bar groove and you had to chase the beat by hand — the
   * numbers were a pager, not a position.
   *
   * It follows the *bar*, not the beat, so it costs one render per bar.
   */
  useEffect(() => {
    if (!isPlaying || !isMobile) return
    setBarPage(p => (p === currentBar ? p : currentBar))
  }, [isPlaying, isMobile, currentBar])

  /** Tapping a bar is a seek, not just a page turn — otherwise the follow above
   *  would drag the view straight back to wherever playback had got to. */
  const jumpToBar = useCallback((bar: number) => {
    setBarPage(bar)
    seekToBeat(bar * trackRef.current.beatsPerBar)
  }, [seekToBeat])

  // ── Stable handlers, so the memoised bands can skip a slot's re-render ─────
  const toggleMixer   = useCallback(() => setMixerOpen(o => !o), [])
  const openSheet     = useCallback(() => setSheetOpen(true), [])
  const closeSheet    = useCallback(() => setSheetOpen(false), [])
  const openLibrary   = useCallback(() => setLibraryOpen(true), [])
  const closeLibrary  = useCallback(() => setLibraryOpen(false), [])
  const toggleKit     = useCallback(() => {
    if (isShort) setKitOpenWhenShort(o => !o)
    else setKitCollapsed(c => !c)
  }, [isShort])
  const toggleTransportExpand = useCallback(() => setTransportExpanded(e => !e), [])

  const editorPane = (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
    }}>
      {view === 'grid' && (
        <>
          <DrumTabGrid
            track={track}
            getBeat={getBeat}
            isPlaying={isPlaying}
            barWindow={barWindow}
            selectedPiece={selectedPiece}
            labelW={labelW}
            showRowVelocity={!isMobile}
            onToggleCell={toggleCell}
            onCycleArticulation={cycleArticulation}
            onSetRowVelocity={setRowVelocity}
            onPreviewRow={previewRow}
            onSelectRow={setSelectedPiece}
          />
          {barWindow && track.totalBars > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
              {Array.from({ length: track.totalBars }, (_, bar) => {
                const isPage    = bar === barPage
                const isSounding = isPlaying && bar === currentBar
                return (
                  <button
                    key={bar}
                    type="button"
                    onClick={() => jumpToBar(bar)}
                    aria-label={'Bar ' + (bar + 1)}
                    aria-pressed={isPage}
                    aria-current={isSounding ? 'true' : undefined}
                    style={{
                      minWidth: 34, padding: '5px 0', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid ' + (isPage ? BT.accent : BT.rule),
                      background: isPage ? BT.accentWash : BT.card,
                      // The bar being played is underlined even when the pager
                      // is showing another one, which happens for the moment
                      // between tapping ahead and the seek landing.
                      boxShadow: isSounding ? 'inset 0 -3px 0 ' + BT.accent : 'none',
                      color: BT.ink, fontFamily: f('mono'), fontSize: 12,
                    }}
                  >
                    {bar + 1}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {view === 'score' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <DrumTabScore
            track={track}
            zoom={1}
            getBeat={getBeat}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            loop={loop}
            onSeekBeat={seekToBeat}
          />
        </div>
      )}

      {view === 'text' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <DrumTabTextEditor
            track={track}
            onApply={applyText}
            getBeat={getBeat}
            isPlaying={isPlaying}
            onSeekBeat={seekToBeat}
          />
        </div>
      )}

      {/* Structure belongs to the track, not to a view, so it stays put as you
          switch between grid, notation and text. On a phone it doubles as the
          navigator: tapping a section takes the one-bar window to it.

          The exception is a screen too short for it: the lane is a fixed 62px,
          which on a phone in landscape is most of what the grid has left. It is
          the one band here that is about arranging rather than playing, the
          bar buttons still navigate without it, and turning the phone upright
          brings it back. */}
      {!isShort && (
        <DrumTabArrangement
          totalBars={track.totalBars}
          sections={track.sections}
          currentBar={isPlaying ? currentBar : -1}
          labelW={labelW}
          compact={isMobile}
          onJumpToBar={isMobile ? jumpToBar : undefined}
          onChange={setSections}
        />
      )}
    </div>
  )

  return (
    <div
      // Dropping a `.mid` anywhere on the editor loads it. The button in the
      // top bar does the same thing for anyone who does not think to drag.
      onDragOver={handleDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={handleDrop}
      style={{
        ...BT_VARS,
        background: BT.paper,
        // The editor is the screen at every size, phone included — `dvh` rather
        // than `vh` so a mobile browser's collapsing address bar does not leave
        // the transport hanging off the bottom. Same shape `BassTabPlayer` uses.
        height: `calc(100dvh - ${NAVBAR_H}px)`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        outline: dropping ? '2px dashed ' + BT.accent : 'none',
        outlineOffset: -6,
      }}>
      <DrumTabTopBar
        trackName={track.name}
        kit={track.kit}
        view={view}
        shareLabel={shareLabel}
        showLibraryButton={!isDesktop}
        showMixerToggle={isWide}
        mixerOpen={mixerOpen}
        onMixerToggle={toggleMixer}
        compact={compactBars}
        onOpenSheet={openSheet}
        onNameChange={setName}
        onKitChange={setKit}
        onViewChange={setView}
        onOpenLibrary={openLibrary}
        onShare={handleShare}
        onExportMidi={handleExportMidi}
        onExportMidiSplit={handleExportMidiSplit}
        onExportWav={handleExportWav}
        exporting={exporting}
        onImport={openImport}
        onClear={askClear}
      />

      <DrumTabKitStage
        kit={track.kit}
        track={track}
        getBeat={getBeat}
        isPlaying={isPlaying}
        collapsed={isShort ? !kitOpenWhenShort : kitCollapsed}
        onToggleCollapse={toggleKit}
        selectedPiece={selectedPiece}
        onSelectPiece={hitPiece}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {isDesktop && (
          <DrumTabLibrary
            variant="rail"
            open
            currentId={presetId}
            currentTrack={track}
            onClose={noClose}
            onLoad={handleLoadPreset}
            onLoadUserTab={handleLoadUserTab}
          />
        )}
        {editorPane}
        {/* Third column only where there is room for one: below 1440px it would
            squeeze the sixteenths under the width they need to stay clickable,
            and the grid would scroll sideways to pay for the panel. */}
        {isWide && mixerOpen && (
          <DrumTabInspector
            selectedPiece={selectedPiece}
            mix={track.mix}
            rowVelocity={selectedRowVelocity}
            usedPieces={usedPieces}
            onSelectPiece={hitPiece}
            onChannelChange={setChannel}
            onRowVelocityChange={setRowVelocity}
          />
        )}
      </div>

      <DrumTabTransport
        isPlaying={isPlaying}
        bpm={track.bpm}
        loop={loop}
        metronome={metronome}
        volume={volume}
        totalBars={track.totalBars}
        beatsPerBar={track.beatsPerBar}
        currentBeat={currentBeat}
        canUndo={canUndo}
        canRedo={canRedo}
        compact={isMobile && !transportExpanded}
        onToggleExpand={isMobile ? toggleTransportExpand : undefined}
        onTogglePlay={togglePlay}
        onBpmChange={handleBpmChange}
        onLoopChange={setLoop}
        onMetronomeChange={setMetronome}
        onVolumeChange={setVolume}
        onTotalBarsChange={setTotalBars}
        onUndo={undo}
        onRedo={redo}
      />

      {compactBars && (
        <DrumTabMobileSheet
          open={sheetOpen}
          trackName={track.name}
          kit={track.kit}
          shareLabel={shareLabel}
          mix={track.mix}
          selectedPiece={selectedPiece}
          rowVelocity={selectedRowVelocity}
          usedPieces={usedPieces}
          onClose={closeSheet}
          onNameChange={setName}
          onKitChange={setKit}
          onOpenLibrary={openLibrary}
          onShare={handleShare}
          onExportMidi={handleExportMidi}
          onExportMidiSplit={handleExportMidiSplit}
          onExportWav={handleExportWav}
          exporting={exporting}
          onImport={openImport}
          onClear={askClear}
          onSelectPiece={hitPiece}
          onChannelChange={setChannel}
          onRowVelocityChange={setRowVelocity}
        />
      )}

      {!isDesktop && (
        <DrumTabLibrary
          open={libraryOpen}
          currentId={presetId}
          currentTrack={track}
          onClose={closeLibrary}
          onLoad={handleLoadPreset}
          onLoadUserTab={handleLoadUserTab}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void importFile(file)
          // Cleared so choosing the same file twice fires the change event.
          e.target.value = ''
        }}
      />

      <ConfirmDialog
        open={clearAsk}
        title="Clear every hit?"
        body="The kit, the tempo and the bars stay; the pattern goes. Undo brings it back."
        confirmLabel="Clear pattern"
        destructive
        onConfirm={confirmClear}
        onCancel={cancelClear}
      />

      {/* Sits above the transport rather than at the bottom of the window: the
          editor fills the viewport, so `bottom: 40` would put this behind the
          play button it is reporting on. */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
            zIndex: 90, maxWidth: 'calc(100vw - 32px)',
            background: BT.accentHi, color: '#fff',
            borderRadius: 10, padding: '9px 18px',
            fontFamily: f('ui'), fontSize: 13, fontWeight: 500,
            boxShadow: BT.shadowLg, pointerEvents: 'none', textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

export default DrumTabPlayer
