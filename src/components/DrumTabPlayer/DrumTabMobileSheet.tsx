import React from 'react'
import { Library, Share2, Trash2, Upload, X } from 'lucide-react'
import type { DrumChannel, DrumKitId, DrumMix, DrumPieceId } from '../../lib/drumTab/types'
import { BT, f } from '../../lib/bassTab/theme'
import { Segmented, TextButton } from './barControls'
import { DrumTabInspector } from './DrumTabInspector'
import { DrumTabExportMenu } from './DrumTabExportMenu'

/**
 * Everything the phone's top bar cannot hold.
 *
 * At 390px the desktop top bar is seven controls that wrap onto three rows and
 * still crowd the editor. What stays up there is what you touch while writing —
 * the title, the view picker — and the rest lives here: the pattern's name and
 * kit, the library, share and clear, and the kit mixer, which on a wide screen
 * is a third column.
 *
 * Built as a plain fixed overlay rather than with `ui/drawer.tsx`, matching
 * `DrumTabLibrary`'s own modal and `VirtualPiano/SettingsDrawer` — both of which
 * do the same thing without pulling a sheet library into this tree.
 */

const KITS: { id: DrumKitId; label: string }[] = [
  { id: 'acoustic',   label: 'Acoustic' },
  { id: 'electronic', label: 'Electronic' },
]

interface Props {
  open: boolean
  trackName: string
  kit: DrumKitId
  shareLabel: string
  mix: DrumMix | undefined
  selectedPiece: DrumPieceId | null
  rowVelocity: number | null
  usedPieces: Set<DrumPieceId>
  onClose: () => void
  onNameChange: (name: string) => void
  onKitChange: (kit: DrumKitId) => void
  onOpenLibrary: () => void
  onShare: () => void
  onClear: () => void
  onExportMidi: () => void
  onExportMidiSplit: () => void
  onExportWav: () => void
  onImport: () => void
  exporting: boolean
  onSelectPiece: (piece: DrumPieceId) => void
  onChannelChange: (piece: DrumPieceId, patch: Partial<DrumChannel>) => void
  onRowVelocityChange: (piece: DrumPieceId, velocity: number) => void
}

function DrumTabMobileSheetImpl({
  open, trackName, kit, shareLabel, mix, selectedPiece, rowVelocity, usedPieces,
  onClose, onNameChange, onKitChange, onOpenLibrary, onShare, onClear,
  onExportMidi, onExportMidiSplit, onExportWav, onImport, exporting,
  onSelectPiece, onChannelChange, onRowVelocityChange,
}: Props) {
  if (!open) return null

  const label: React.CSSProperties = {
    fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
    color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pattern settings"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(20, 18, 15, 0.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '86dvh', display: 'flex', flexDirection: 'column',
          background: BT.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
          boxShadow: BT.shadowLg, overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderBottom: '1px solid ' + BT.rule, flexShrink: 0,
        }}>
          <span style={{ fontFamily: f('ui'), fontSize: 14, fontWeight: 700, color: BT.ink, flex: 1 }}>
            Pattern
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer', flex: 'none',
              border: '1px solid ' + BT.rule, background: BT.card, color: BT.muted,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>Name</span>
              <input
                value={trackName}
                onChange={e => onNameChange(e.target.value)}
                aria-label="Pattern name"
                placeholder="Untitled groove"
                style={{
                  padding: '9px 11px', borderRadius: 9,
                  border: '1px solid ' + BT.rule, background: BT.sunken, color: BT.ink,
                  fontFamily: f('ui'), fontSize: 15, fontWeight: 600,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>Kit</span>
              <Segmented tone="light" options={KITS} value={kit} onChange={onKitChange} ariaLabel="Drum kit" />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TextButton tone="light" onClick={() => { onOpenLibrary(); onClose() }} title="Rhythm library">
                <Library size={15} /> Library
              </TextButton>
              <TextButton tone="light" onClick={onShare} title={shareLabel}>
                <Share2 size={15} /> Share
              </TextButton>
              <TextButton tone="light" onClick={onImport} title="Import a MIDI file">
                <Upload size={15} /> Import
              </TextButton>
              <TextButton tone="light" onClick={onClear} title="Clear all hits">
                <Trash2 size={15} /> Clear
              </TextButton>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>Export</span>
              <DrumTabExportMenu
                inline
                onMidi={onExportMidi}
                onMidiSplit={onExportMidiSplit}
                onWav={onExportWav}
                busy={exporting}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid ' + BT.rule }}>
            <DrumTabInspector
              width="100%"
              bordered={false}
              selectedPiece={selectedPiece}
              mix={mix}
              rowVelocity={rowVelocity}
              usedPieces={usedPieces}
              onSelectPiece={onSelectPiece}
              onChannelChange={onChannelChange}
              onRowVelocityChange={onRowVelocityChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Memoised. The player re-renders on every sixteenth to move its position
 * readout; this band only changes when one of its own props does.
 */
export const DrumTabMobileSheet = React.memo(DrumTabMobileSheetImpl)
