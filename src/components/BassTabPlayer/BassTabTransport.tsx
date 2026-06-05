import React from 'react'
import { Play, Square, RotateCcw, Repeat, ZoomIn, ZoomOut } from 'lucide-react'
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
}

export function BassTabTransport({
  isPlaying, loop, bpm, snap, sound, totalBars, zoom, volume,
  selectedNoteFret, hasSelectedNote,
  onPlay, onStop, onLoopToggle, onBpmChange, onSnapChange,
  onSoundChange, onBarsChange, onZoomIn, onZoomOut,
  onFretChange, onVolumeChange,
}: TransportProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 select-none flex-shrink-0">

      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={isPlaying ? onStop : onPlay}
          title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
          className={`flex items-center justify-center w-9 h-9 rounded-lg font-bold transition-colors ${
            isPlaying
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isPlaying ? <Square size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={onStop}
          title="Reset to start"
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onLoopToggle}
          title="Toggle loop"
          className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
            loop ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <Repeat size={14} />
        </button>
      </div>

      <div className="h-6 w-px bg-gray-700" />

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-xs font-medium">BPM</span>
        <input
          type="number"
          min={40} max={240} value={bpm}
          onChange={(e) => onBpmChange(Math.max(40, Math.min(240, Number(e.target.value))))}
          className="w-14 bg-gray-800 border border-gray-600 rounded text-white text-sm text-center py-1 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="h-6 w-px bg-gray-700" />

      {/* Snap */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-xs font-medium">Snap</span>
        <select
          value={snap}
          onChange={(e) => onSnapChange(Number(e.target.value) as SnapValue)}
          className="bg-gray-800 border border-gray-600 rounded text-white text-sm py-1 px-2 focus:outline-none focus:border-blue-500"
        >
          {SNAP_OPTIONS.map(o => (
            <option key={o.label} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Sound type */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-xs font-medium">Sound</span>
        <select
          value={sound}
          onChange={(e) => onSoundChange(e.target.value as BassSound)}
          className="bg-gray-800 border border-gray-600 rounded text-white text-sm py-1 px-2 focus:outline-none focus:border-blue-500"
        >
          <option value="electric">Electric</option>
          <option value="picked">Picked</option>
          <option value="synth">Synth</option>
          <option value="slap">Slap</option>
        </select>
      </div>

      {/* Bars */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-xs font-medium">Bars</span>
        <select
          value={totalBars}
          onChange={(e) => onBarsChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded text-white text-sm py-1 px-2 focus:outline-none focus:border-blue-500"
        >
          {[2, 4, 8, 16, 32].map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-xs font-medium">Vol</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-16 accent-blue-500"
        />
      </div>

      <div className="h-6 w-px bg-gray-700" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-xs font-medium">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomOut}
          disabled={zoom <= 0.5}
          className="flex items-center justify-center w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 transition-colors"
        >
          <ZoomOut size={13} />
        </button>
        <button
          onClick={onZoomIn}
          disabled={zoom >= 4}
          className="flex items-center justify-center w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 transition-colors"
        >
          <ZoomIn size={13} />
        </button>
      </div>

      {/* Selected note fret editor */}
      {hasSelectedNote && selectedNoteFret !== null && (
        <>
          <div className="h-6 w-px bg-gray-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 text-xs font-medium">Fret</span>
            <button
              onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))}
              className="w-6 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-base leading-none flex items-center justify-center"
            >−</button>
            <input
              type="number"
              min={0} max={24}
              value={selectedNoteFret}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!isNaN(v)) onFretChange(Math.max(0, Math.min(24, v)))
              }}
              className="w-12 bg-gray-800 border border-gray-600 rounded text-white text-sm text-center py-1 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))}
              className="w-6 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-base leading-none flex items-center justify-center"
            >+</button>
          </div>
        </>
      )}

      <div className="ml-auto text-gray-600 text-xs hidden lg:block">
        Click: add • Drag: move • Edge: resize • Dbl-click: delete • Space: play
      </div>
    </div>
  )
}
