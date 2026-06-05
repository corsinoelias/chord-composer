import React from 'react'
import { Play, Square, RotateCcw, Repeat, ZoomIn, ZoomOut, Undo2, Redo2, Trash2, Download, Share2 } from 'lucide-react'
import { type BassSound, type SnapValue, SNAP_OPTIONS } from '../../lib/bassTab/types'

interface TransportProps {
  isPlaying: boolean
  loop: boolean
  bpm: number
  snap: SnapValue
  sound: BassSound
  totalBars: number
  zoom: number
  volume: number
  selectedNoteFret: number | null
  hasSelectedNote: boolean
  canUndo: boolean
  canRedo: boolean
  onPlay: () => void
  onStop: () => void
  onLoopToggle: () => void
  onBpmChange: (bpm: number) => void
  onSnapChange: (snap: SnapValue) => void
  onSoundChange: (sound: BassSound) => void
  onBarsChange: (bars: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFretChange: (fret: number) => void
  onVolumeChange: (vol: number) => void
  onUndo: () => void
  onRedo: () => void
  onClearAll: () => void
  onExportAscii: () => void
  onShareUrl: () => void
}

export function BassTabTransport({
  isPlaying, loop, bpm, snap, sound, totalBars, zoom, volume,
  selectedNoteFret, hasSelectedNote, canUndo, canRedo,
  onPlay, onStop, onLoopToggle, onBpmChange, onSnapChange,
  onSoundChange, onBarsChange, onZoomIn, onZoomOut,
  onFretChange, onVolumeChange,
  onUndo, onRedo, onClearAll, onExportAscii, onShareUrl,
}: TransportProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-700 select-none flex-shrink-0">

      {/* Transport */}
      <div className="flex items-center gap-1">
        <button
          onClick={isPlaying ? onStop : onPlay}
          title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
          className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold transition-colors ${
            isPlaying ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isPlaying ? <Square size={13} /> : <Play size={13} />}
        </button>
        <button onClick={onStop} title="Reset" className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
          <RotateCcw size={13} />
        </button>
        <button
          onClick={onLoopToggle}
          title="Loop"
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${loop ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
        >
          <Repeat size={13} />
        </button>
      </div>

      <div className="h-5 w-px bg-gray-700" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          className="flex items-center justify-center w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-25 transition-colors"
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
          className="flex items-center justify-center w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-25 transition-colors"
        >
          <Redo2 size={13} />
        </button>
      </div>

      <div className="h-5 w-px bg-gray-700" />

      {/* BPM */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs">BPM</span>
        <input
          type="number" min={40} max={240} value={bpm}
          onChange={(e) => onBpmChange(Math.max(40, Math.min(240, Number(e.target.value))))}
          className="w-14 bg-gray-800 border border-gray-600 rounded text-white text-xs text-center py-1 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="h-5 w-px bg-gray-700" />

      {/* Snap */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs">Snap</span>
        <select
          value={snap}
          onChange={(e) => onSnapChange(Number(e.target.value) as SnapValue)}
          className="bg-gray-800 border border-gray-600 rounded text-white text-xs py-1 px-1.5 focus:outline-none focus:border-blue-500"
        >
          {SNAP_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Sound */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs">Sound</span>
        <select
          value={sound}
          onChange={(e) => onSoundChange(e.target.value as BassSound)}
          className="bg-gray-800 border border-gray-600 rounded text-white text-xs py-1 px-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="electric">Electric</option>
          <option value="picked">Picked</option>
          <option value="synth">Synth</option>
          <option value="slap">Slap</option>
        </select>
      </div>

      {/* Bars */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs">Bars</span>
        <select
          value={totalBars}
          onChange={(e) => onBarsChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded text-white text-xs py-1 px-1.5 focus:outline-none focus:border-blue-500"
        >
          {[2, 4, 8, 16, 32].map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs">Vol</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-14 accent-violet-500"
        />
      </div>

      <div className="h-5 w-px bg-gray-700" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs w-8 text-right">{Math.round(zoom * 100)}%</span>
        <button onClick={onZoomOut} disabled={zoom <= 0.5} className="flex items-center justify-center w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 transition-colors">
          <ZoomOut size={12} />
        </button>
        <button onClick={onZoomIn} disabled={zoom >= 4} className="flex items-center justify-center w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 transition-colors">
          <ZoomIn size={12} />
        </button>
      </div>

      {/* Selected note fret editor */}
      {hasSelectedNote && selectedNoteFret !== null && (
        <>
          <div className="h-5 w-px bg-gray-700" />
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">Fret</span>
            <button onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))} className="w-6 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm flex items-center justify-center">−</button>
            <input
              type="number" min={0} max={24} value={selectedNoteFret}
              onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onFretChange(Math.max(0, Math.min(24, v))) }}
              className="w-12 bg-gray-800 border border-gray-600 rounded text-white text-xs text-center py-1 focus:outline-none focus:border-blue-500"
            />
            <button onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))} className="w-6 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm flex items-center justify-center">+</button>
          </div>
        </>
      )}

      {/* Right-side actions */}
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={onExportAscii} title="Export ASCII Tab" className="flex items-center justify-center w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
          <Download size={13} />
        </button>
        <button onClick={onShareUrl} title="Copy share URL" className="flex items-center justify-center w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
          <Share2 size={13} />
        </button>
        <button
          onClick={onClearAll}
          title="Clear all notes"
          className="flex items-center justify-center w-8 h-8 rounded bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
