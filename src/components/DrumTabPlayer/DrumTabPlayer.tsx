import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DRUM_STORAGE_KEY, STEPS_PER_BEAT, makeHitId, hitsSignature,
  type DrumKitId, type DrumPieceId, type DrumTrack, type DrumView, type LoopRange,
} from '../../lib/drumTab/types'
import { defaultDrumTrack, getDrumPreset, type DrumPreset } from '../../data/drumPresets'
import { startPlayback, stopPlayback, setMasterVolume, previewHit } from '../../lib/drumTab/drumAudio'
import { parseDrumTab } from '../../lib/drumTab/drumTabText'
import { encodeTrackToHash, decodeTrackFromHash, copyToClipboard } from '../../lib/drumTab/exportDrumTab'
import { useDrumTrackEditor } from '../../hooks/useDrumTrackEditor'
import { useIsMobile, useIsDesktop } from '../../hooks/use-mobile'
import { analytics } from '../../lib/analytics'
import { BT, BT_VARS, f } from '../../lib/bassTab/theme'
import { DrumTabTopBar } from './DrumTabTopBar'
import { DrumTabTransport } from './DrumTabTransport'
import { DrumTabKitStage } from './DrumTabKitStage'
import { DrumTabGrid } from './DrumTabGrid'
import { DrumTabScore } from './DrumTabScore'
import { DrumTabTextEditor } from './DrumTabTextEditor'
import { DrumTabLibrary } from './DrumTabLibrary'
import type { UserTab } from '../../lib/drumTab/userTabs'

/**
 * Drum Tab Player — owner of all state, the way `BassTabPlayer` is for the bass.
 *
 * It opens straight into the editor with a groove already loaded (no library
 * step to get past): whatever is in the URL hash, else whatever was last edited
 * in this browser, else the chord player's Rock Básico.
 *
 * **It fills the viewport.** Four bands stacked: what the pattern is (top bar),
 * the kit playing it, the pattern itself, and the transport. The one thing that
 * is not a band is the rhythm library, which on a wide screen is a rail down the
 * left rather than a dialog — you pick a groove to compare it against the one
 * you have, and a dialog covers exactly the thing being compared. Below `lg` it
 * goes back to being a dialog, because at that width a rail is most of the
 * screen.
 */

/** Height of the site navbar (`h-16` in `Navbar.astro`), which sits above us. */
const NAVBAR_H = 64

const KIT_COLLAPSED_KEY = 'drum-tab-kit-collapsed-v1'

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

/** Expanded on a first visit — the kit is the thing that says what this page is. */
function loadKitCollapsed(): boolean {
  try { return localStorage.getItem(KIT_COLLAPSED_KEY) === '1' } catch { return false }
}

export function DrumTabPlayer({ initialPreset }: { initialPreset?: string } = {}) {
  const isMobile  = useIsMobile()
  const isDesktop = useIsDesktop()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialTrack = useMemo(() => loadInitialTrack(initialPreset), [])

  const {
    track, setTrack, canUndo, canRedo,
    addHit, deleteHit, replaceHits,
    setTotalBars, setBpm, loadTrack, clearAll, undo, redo,
  } = useDrumTrackEditor(initialTrack)

  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [view, setView]               = useState<DrumView>('grid')
  const [loop, setLoop]               = useState(true)
  const [metronome, setMetronome]     = useState(false)
  const [volume, setVolume]           = useState(0.9)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [presetId, setPresetId]       = useState(initialTrack.id)
  const [shareLabel, setShareLabel]   = useState('Copy share link')
  const [barPage, setBarPage]         = useState(0)
  const [kitCollapsed, setKitCollapsed] = useState(loadKitCollapsed)
  const [selectedPiece, setSelectedPiece] = useState<DrumPieceId | null>(null)

  /**
   * The rail has nothing to close. It has to be a stable identity rather than an
   * inline arrow: the rail stays mounted and re-renders with this component,
   * which during playback is every frame, and a fresh callback each time defeats
   * the memo that keeps 30-odd preset thumbnails from re-rendering with it.
   */
  const noClose = useCallback(() => {}, [])

  // Getters the running scheduler reads each frame, so toggling loop or the
  // metronome mid-playback takes effect without restarting the transport.
  const loopRef = useRef(loop); loopRef.current = loop
  const metroRef = useRef(metronome); metroRef.current = metronome
  const trackRef = useRef(track); trackRef.current = track
  const viewRef = useRef(view); viewRef.current = view

  useEffect(() => { setMasterVolume(volume) }, [volume])
  useEffect(() => () => { stopPlayback() }, [])

  useEffect(() => {
    try { localStorage.setItem(KIT_COLLAPSED_KEY, kitCollapsed ? '1' : '0') } catch { /* private mode */ }
  }, [kitCollapsed])

  // Keep the page in range when bars are removed.
  useEffect(() => {
    setBarPage(p => Math.max(0, Math.min(p, track.totalBars - 1)))
  }, [track.totalBars])

  const stop = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(0)
  }, [])

  const play = useCallback(() => {
    const t = trackRef.current
    setIsPlaying(true)
    analytics.drumTabPlay(viewRef.current)
    const getLoopRange = (): LoopRange | null => null
    startPlayback(
      t, 0,
      beat => setCurrentBeat(beat),
      () => { setIsPlaying(false); setCurrentBeat(0) },
      () => loopRef.current,
      () => metroRef.current,
      getLoopRange,
    ).catch(() => { setIsPlaying(false) })
  }, [])

  const togglePlay = useCallback(() => {
    if (isPlaying) stop()
    else play()
  }, [isPlaying, play, stop])

  // Restart the transport when the pattern itself changes mid-playback: the
  // scheduler snapshots and sorts the hit list on start, so an edit made while
  // it runs would otherwise not be heard until the next loop.
  const hitCount = track.hits.length
  useEffect(() => {
    if (!isPlaying) return
    stopPlayback()
    const t = trackRef.current
    startPlayback(
      t, 0,
      beat => setCurrentBeat(beat),
      () => { setIsPlaying(false); setCurrentBeat(0) },
      () => loopRef.current,
      () => metroRef.current,
      () => null,
    ).catch(() => { setIsPlaying(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitCount, track.bpm, track.kit, track.totalBars])

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
    previewHit(trackRef.current.kit, pieceId, velocity)
  }, [addHit, deleteHit])

  const setRowVelocity = useCallback((pieceId: DrumPieceId, velocity: number) => {
    setTrack(t => ({
      ...t,
      hits: t.hits.map(h => h.pieceId === pieceId ? { ...h, velocity } : h),
    }))
  }, [setTrack])

  const previewRow = useCallback((pieceId: DrumPieceId) => {
    const t = trackRef.current
    const existing = t.hits.find(h => h.pieceId === pieceId)
    previewHit(t.kit, pieceId, existing?.velocity ?? 0.9)
  }, [])

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
    if (bars === current.totalBars && hitsSignature(parsed.hits) === hitsSignature(current.hits)) return
    replaceHits(parsed.hits, bars)
    analytics.drumTabTextApplied()
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

  const handleShare = useCallback(async () => {
    const hash = encodeTrackToHash(trackRef.current)
    if (!hash) { setShareLabel('Could not build a link'); return }
    const url = window.location.origin + window.location.pathname + hash
    window.history.replaceState(null, '', hash)
    const ok = await copyToClipboard(url)
    setShareLabel(ok ? 'Link copied' : 'Copy failed')
    if (ok) analytics.drumTabShared()
    setTimeout(() => setShareLabel('Copy share link'), 2200)
  }, [])

  const setKit = useCallback((kit: DrumKitId) => {
    setTrack(t => ({ ...t, kit }))
  }, [setTrack])

  const setName = useCallback((name: string) => {
    setTrack(t => ({ ...t, name }))
  }, [setTrack])

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

  // On a phone the grid shows one bar at a time; on desktop it scrolls.
  const barWindow = isMobile ? { start: barPage, count: 1 } : null

  const editorPane = (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
    }}>
      {view === 'grid' && (
        <>
          <DrumTabGrid
            track={track}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            barWindow={barWindow}
            selectedPiece={selectedPiece}
            onToggleCell={toggleCell}
            onSetRowVelocity={setRowVelocity}
            onPreviewRow={previewRow}
            onSelectRow={setSelectedPiece}
          />
          {barWindow && track.totalBars > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
              {Array.from({ length: track.totalBars }, (_, bar) => (
                <button
                  key={bar}
                  type="button"
                  onClick={() => setBarPage(bar)}
                  aria-label={'Bar ' + (bar + 1)}
                  aria-pressed={bar === barPage}
                  style={{
                    minWidth: 34, padding: '5px 0', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid ' + (bar === barPage ? BT.accent : BT.rule),
                    background: bar === barPage ? BT.accentWash : BT.card,
                    color: BT.ink, fontFamily: f('mono'), fontSize: 12,
                  }}
                >
                  {bar + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'score' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <DrumTabScore
            track={track}
            zoom={1}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            onSeekBeat={beat => setCurrentBeat(beat)}
          />
        </div>
      )}

      {view === 'text' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <DrumTabTextEditor track={track} onApply={applyText} />
        </div>
      )}
    </div>
  )

  return (
    <div style={{
      ...BT_VARS,
      background: BT.paper,
      // A phone keeps the page scrolling normally; from `md` up the editor is the
      // screen. Same shape Virtual Drums uses, and the same navbar allowance.
      height: isMobile ? 'auto' : `calc(100dvh - ${NAVBAR_H}px)`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <DrumTabTopBar
        trackName={track.name}
        kit={track.kit}
        view={view}
        shareLabel={shareLabel}
        showLibraryButton={!isDesktop}
        onNameChange={setName}
        onKitChange={setKit}
        onViewChange={setView}
        onOpenLibrary={() => setLibraryOpen(true)}
        onShare={handleShare}
        onClear={clearAll}
      />

      <DrumTabKitStage
        kit={track.kit}
        track={track}
        currentBeat={currentBeat}
        isPlaying={isPlaying}
        collapsed={kitCollapsed}
        onToggleCollapse={() => setKitCollapsed(c => !c)}
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
        onTogglePlay={togglePlay}
        onBpmChange={bpm => setBpm(bpm, isPlaying)}
        onLoopChange={setLoop}
        onMetronomeChange={setMetronome}
        onVolumeChange={setVolume}
        onTotalBarsChange={setTotalBars}
        onUndo={undo}
        onRedo={redo}
      />

      {!isDesktop && (
        <DrumTabLibrary
          open={libraryOpen}
          currentId={presetId}
          currentTrack={track}
          onClose={() => setLibraryOpen(false)}
          onLoad={handleLoadPreset}
          onLoadUserTab={handleLoadUserTab}
        />
      )}
    </div>
  )
}

export default DrumTabPlayer
