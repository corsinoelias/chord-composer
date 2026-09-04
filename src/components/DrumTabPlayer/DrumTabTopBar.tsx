import React from 'react'
import { Library, MoreHorizontal, Share2, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { DrumKitId, DrumView } from '../../lib/drumTab/types'
import { BT, f } from '../../lib/bassTab/theme'
import { IconButton, Segmented, TextButton } from './barControls'

/**
 * What the pattern *is*: its name, its kit, which view you are reading it in.
 *
 * Split from `DrumTabTransport`, which used to be one flex row that wrapped.
 * At full-screen width a single row leaves the play button stranded next to the
 * share icon; splitting it puts identity at the top and playback at the bottom,
 * where a hand already is.
 *
 * This bar also carries the page's `<h1>`. The editor fills the viewport, so the
 * heading would otherwise sit below the fold — the same reason Virtual Drums
 * keeps its title in its top bar.
 */

const VIEWS: { id: DrumView; label: string }[] = [
  { id: 'score', label: 'Notation' },
  { id: 'grid',  label: 'Grid' },
  { id: 'text',  label: 'Text' },
]

const KITS: { id: DrumKitId; label: string }[] = [
  { id: 'acoustic',   label: 'Acoustic' },
  { id: 'electronic', label: 'Electronic' },
]

interface Props {
  trackName: string
  kit: DrumKitId
  view: DrumView
  shareLabel: string
  /** Hidden on desktop, where the library is a permanent rail. */
  showLibraryButton: boolean
  /** Only offered where the inspector fits at all. */
  showMixerToggle: boolean
  mixerOpen: boolean
  onMixerToggle: () => void
  /**
   * Phone layout: name, kit, library, share and clear move into the sheet, so
   * the bar keeps only the heading and the view picker and fits on one row.
   */
  compact: boolean
  onOpenSheet: () => void
  onNameChange: (name: string) => void
  onKitChange: (kit: DrumKitId) => void
  onViewChange: (view: DrumView) => void
  onOpenLibrary: () => void
  onShare: () => void
  onClear: () => void
}

export function DrumTabTopBar({
  trackName, kit, view, shareLabel, showLibraryButton,
  showMixerToggle, mixerOpen, onMixerToggle, compact, onOpenSheet,
  onNameChange, onKitChange, onViewChange, onOpenLibrary, onShare, onClear,
}: Props) {
  if (compact) {
    return (
      <div style={{
        flexShrink: 0, background: BT.card, borderBottom: '1px solid ' + BT.rule,
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Stays the page heading even here — the track name lives in the
            sheet. Swapping it for the pattern's name would leave the document
            without the h1 the static HTML promises. */}
        <h1 style={{
          margin: 0, fontFamily: f('ui'), fontSize: 14, fontWeight: 700,
          color: BT.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
        }}>
          Drum Tab Player
        </h1>
        <div style={{ flex: 1, minWidth: 4 }} />
        <Segmented tone="light" options={VIEWS} value={view} onChange={onViewChange} ariaLabel="View" />
        <IconButton tone="light" onClick={onOpenSheet} title="Pattern settings">
          <MoreHorizontal size={18} />
        </IconButton>
      </div>
    )
  }

  return (
    <div style={{
      flexShrink: 0, background: BT.card, borderBottom: '1px solid ' + BT.rule,
      padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <h1 style={{
        margin: 0, fontFamily: f('ui'), fontSize: 15, fontWeight: 700,
        color: BT.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap',
      }}>
        Drum Tab Player
      </h1>

      <input
        value={trackName}
        onChange={e => onNameChange(e.target.value)}
        aria-label="Pattern name"
        placeholder="Untitled groove"
        style={{
          width: 190, padding: '6px 10px', borderRadius: 8,
          border: '1px solid ' + BT.rule, background: BT.sunken, color: BT.ink,
          fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
        }}
      />

      <Segmented tone="light" options={KITS} value={kit} onChange={onKitChange} ariaLabel="Drum kit" />

      <div style={{ flex: 1, minWidth: 8 }} />

      <Segmented tone="light" options={VIEWS} value={view} onChange={onViewChange} ariaLabel="View" />

      {showLibraryButton && (
        <TextButton tone="light" onClick={onOpenLibrary} title="Rhythm library">
          <Library size={15} /> Library
        </TextButton>
      )}

      {/* A third column costs the grid real width, so whether it is worth it
          stays the user's call rather than the breakpoint's alone. */}
      {showMixerToggle && (
        <TextButton
          tone="light"
          active={mixerOpen}
          onClick={onMixerToggle}
          title={mixerOpen ? 'Hide the kit mixer' : 'Show the kit mixer'}
        >
          <SlidersHorizontal size={15} /> Mixer
        </TextButton>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton tone="light" onClick={onShare} title={shareLabel}>
          <Share2 size={16} />
        </IconButton>
        <IconButton tone="light" onClick={onClear} title="Clear all hits">
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  )
}
