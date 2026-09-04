import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { columnAtBeat } from '../../lib/tabtext/render'
import type { RenderOptions, RenderedTab, RestStyle } from '../../lib/tabtext/types'

/**
 * The ASCII tab, editable, with the transport's playhead running over it.
 *
 * Instrument-agnostic on purpose: it takes a `render` function and hands back
 * text to apply, so the drum tab, the bass tab and the guitar tab can all use
 * it. Everything it knows about music comes from `RenderedTab` — the text plus
 * the character position of every column — which is exactly the data the
 * renderer already had to compute in order to print the tab at all.
 *
 * **The playhead is not React state.** Same rule the grid and the score follow:
 * `getBeat()` is read on an animation frame and written straight to a DOM node's
 * style. Routing the beat through `useState` would re-render a textarea sixty
 * times a second and fight the caret.
 *
 * The textarea is a draft, not the model. Typing does not mutate the track on
 * every keystroke — a half-typed bar is not a valid tab — so the draft is
 * applied on blur or with the Apply button, and reset from the track whenever
 * the track changes underneath.
 */

const FONT_SIZE = 13
const LINE_HEIGHT = 22
const PAD = 10

const REST_STYLES: { id: RestStyle; label: string; sample: string }[] = [
  { id: 'dash', label: 'Dashes', sample: '-' },
  { id: 'dot', label: 'Dots', sample: '·' },
  { id: 'space', label: 'Spaces', sample: '␣' },
]

export interface TabTextEditorProps {
  /** Renders the current track at the given options. Must be stable-ish. */
  render: (options: RenderOptions) => RenderedTab
  onApply: (text: string) => void
  /** Live playhead, as in the grid and the score. */
  getBeat?: () => number
  isPlaying?: boolean
  onSeekBeat?: (beat: number) => void
  /** Persists the format choice across sessions. */
  storageKey?: string
  /** Parse feedback for the *draft* — unknown labels only show up while typing. */
  status?: (draft: string, dirty: boolean) => React.ReactNode
  legend?: React.ReactNode
  /** Extra buttons beside Apply / Copy — export menus, mostly. */
  actions?: React.ReactNode
}

function loadOptions(key: string | undefined): RenderOptions {
  if (!key) return {}
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as RenderOptions) : {}
  } catch {
    return {}
  }
}

export function TabTextEditor({
  render, onApply, getBeat, isPlaying = false, onSeekBeat,
  storageKey, status, legend, actions,
}: TabTextEditorProps) {
  const [options, setOptions] = useState<RenderOptions>(() => loadOptions(storageKey))
  const rendered = useMemo(() => render(options), [render, options])
  const canonical = rendered.text

  const [draft, setDraft] = useState(canonical)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setDraft(canonical) }, [canonical])

  const dirty = draft !== canonical

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify(options)) } catch { /* private mode */ }
  }, [storageKey, options])

  // Fires twice for one click on Apply — the button blurs the textarea first, so
  // `onBlur` runs and then `onClick` does. Deliberately not defended against
  // here: the consumer's `onApply` ignores a tab that matches the track it
  // already has, which is a guard no stale closure can slip past.
  const apply = useCallback(() => { onApply(draft) }, [draft, onApply])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked */ }
  }, [draft])

  // ── Metrics ───────────────────────────────────────────────────────────────
  // One character's width, measured rather than assumed: the mono stack differs
  // per platform, and a highlight placed on a guessed advance drifts a column
  // to the right by the end of a long system.
  const rulerRef = useRef<HTMLSpanElement>(null)
  const [charW, setCharW] = useState(0)
  useEffect(() => {
    const el = rulerRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width / 100
      if (w > 0) setCharW(prev => (Math.abs(prev - w) < 0.01 ? prev : w))
    }
    measure()
    if (typeof document !== 'undefined' && 'fonts' in document) {
      ;(document as Document & { fonts: FontFaceSet }).fonts.ready.then(measure).catch(() => {})
    }
  }, [])

  // ── Playhead ──────────────────────────────────────────────────────────────
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const markRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Read by the frame loop, so changing them does not restart it.
  const stateRef = useRef({ rendered, dirty, charW })
  stateRef.current = { rendered, dirty, charW }

  useEffect(() => {
    const mark = markRef.current
    if (!mark) return
    if (!isPlaying || !getBeat) {
      mark.style.opacity = '0'
      return
    }

    let raf = 0
    const frame = () => {
      const { rendered: r, dirty: isDirty, charW: cw } = stateRef.current
      // A dirty draft and the column map describe different tabs. Rather than
      // highlight the wrong column, the playhead steps aside until Apply.
      if (isDirty || cw <= 0) {
        mark.style.opacity = '0'
        raf = requestAnimationFrame(frame)
        return
      }
      const column = columnAtBeat(r.columns, getBeat())
      const system = column ? r.systems[column.system] : null
      if (!column || !system) {
        mark.style.opacity = '0'
        raf = requestAnimationFrame(frame)
        return
      }
      mark.style.opacity = '1'
      mark.style.transform = `translate(${column.x * cw}px, ${system.firstLine * LINE_HEIGHT}px)`
      mark.style.width = `${Math.max(cw, column.width * cw)}px`
      mark.style.height = `${system.rowLines * LINE_HEIGHT}px`

      // Keep the sounding system on screen, but only when it has left it —
      // scrolling on every frame would fight the user's own scrolling.
      const area = areaRef.current
      if (area) {
        const top = system.firstLine * LINE_HEIGHT
        const bottom = top + system.rowLines * LINE_HEIGHT
        if (top < area.scrollTop || bottom > area.scrollTop + area.clientHeight) {
          area.scrollTop = Math.max(0, top - LINE_HEIGHT)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getBeat])

  /** The overlay is painted in the textarea's content box, so it must scroll with it. */
  const syncScroll = useCallback(() => {
    const area = areaRef.current
    const overlay = overlayRef.current
    if (!area || !overlay) return
    overlay.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`
  }, [])

  /** Click on a column to move the playhead there, like the score's cursor. */
  const handleClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!onSeekBeat || dirty || charW <= 0) return
    const area = areaRef.current
    if (!area) return
    const box = area.getBoundingClientRect()
    const x = e.clientX - box.left - PAD + area.scrollLeft
    const line = Math.floor((e.clientY - box.top - PAD + area.scrollTop) / LINE_HEIGHT)
    const system = rendered.systems.find(
      s => line >= s.firstLine && line < s.firstLine + s.rowLines,
    )
    if (!system) return
    const col = rendered.columns.find(
      c => c.system === system.index && x >= c.x * charW && x < (c.x + c.width) * charW,
    )
    if (col) onSeekBeat(col.beat)
  }, [onSeekBeat, dirty, charW, rendered])

  const set = useCallback(<K extends keyof RenderOptions>(key: K, value: RenderOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }, [])

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
    border: '1px solid ' + (active ? BT.accent : BT.rule),
    background: active ? BT.accentWash : BT.card,
    color: active ? BT.ink : BT.muted,
    fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
  })

  const restStyle = options.rest ?? 'dash'
  const spaced = (options.spacing ?? 'compact') === 'spaced'
  const ruler = options.ruler ?? true

  return (
    <div style={{
      background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* ── Format ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Rests
        </span>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Rest character">
          {REST_STYLES.map(style => (
            <button
              key={style.id}
              type="button"
              onClick={() => set('rest', style.id)}
              aria-pressed={restStyle === style.id}
              style={chip(restStyle === style.id)}
            >
              <span style={{ fontFamily: f('mono') }}>{style.sample}</span> {style.label}
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 18, background: BT.rule }} />
        <button type="button" onClick={() => set('spacing', spaced ? 'compact' : 'spaced')} aria-pressed={spaced} style={chip(spaced)}>
          Spaced
        </button>
        <button type="button" onClick={() => set('ruler', !ruler)} aria-pressed={ruler} style={chip(ruler)}>
          Count line
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: f('ui'), fontSize: 12, color: BT.muted }}>
          Bars/line
          <select
            value={options.barsPerSystem ?? 4}
            onChange={e => set('barsPerSystem', Number(e.target.value))}
            style={{
              background: BT.sunken, color: BT.ink, border: '1px solid ' + BT.rule,
              borderRadius: 6, padding: '3px 6px', fontFamily: f('ui'), fontSize: 12,
            }}
          >
            {[1, 2, 4, 8].map(n => <option key={n} value={n}>{n}</option>)}
            <option value={0}>All</option>
          </select>
        </label>
      </div>

      {/* ── The tab ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {/* Off-screen ruler: 100 characters wide, so one character is 1/100th. */}
        <span
          ref={rulerRef}
          aria-hidden
          style={{
            position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
            fontFamily: f('mono'), fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
          }}
        >
          {'0'.repeat(100)}
        </span>

        <div
          aria-hidden
          style={{
            position: 'absolute', inset: PAD, overflow: 'hidden', pointerEvents: 'none',
            borderRadius: 8,
          }}
        >
          <div ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, willChange: 'transform' }}>
            <div
              ref={markRef}
              style={{
                position: 'absolute', top: 0, left: 0, opacity: 0,
                background: alpha('accent', 0.22),
                borderLeft: '2px solid ' + BT.accent,
                borderRadius: 2,
              }}
            />
          </div>
        </div>

        <textarea
          ref={areaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={apply}
          onScroll={syncScroll}
          onClick={handleClick}
          spellCheck={false}
          aria-label="Tab, as text"
          style={{
            position: 'relative', background: 'transparent',
            width: '100%', minHeight: 220, resize: 'vertical',
            fontFamily: f('mono'), fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
            color: BT.ink,
            border: '1px solid ' + (dirty ? alpha('accent', 0.5) : BT.rule),
            borderRadius: 8, padding: PAD, whiteSpace: 'pre', overflow: 'auto',
          }}
        />
      </div>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          style={{
            padding: '6px 14px', borderRadius: 8, cursor: dirty ? 'pointer' : 'default',
            border: '1px solid ' + (dirty ? BT.accent : BT.rule),
            background: dirty ? BT.accent : BT.sunken,
            color: dirty ? '#fff' : BT.dim,
            fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
          }}
        >
          {dirty ? 'Apply changes' : 'Up to date'}
        </button>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid ' + BT.rule, background: BT.card, color: BT.ink,
            fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
          }}
        >
          {copied ? 'Copied' : 'Copy tab'}
        </button>
        {actions}
        {status?.(draft, dirty)}
      </div>

      {legend && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
          paddingTop: 8, borderTop: '1px solid ' + BT.rule,
        }}>
          {legend}
        </div>
      )}
    </div>
  )
}

export default TabTextEditor
