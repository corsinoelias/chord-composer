import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { columnAtBeat } from '../../lib/tabtext/render'
import type { RenderOptions, RenderedTab, RestStyle } from '../../lib/tabtext/types'
import { MOBILE_BREAKPOINT } from '../../hooks/use-mobile'

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

/**
 * One bar per line on a phone.
 *
 * Four bars of sixteenths is ~70 characters, which at a readable size is three
 * screens wide — the tab becomes a thing you scroll sideways rather than
 * something you can read. One bar fits, and the playhead can then scroll
 * vertically, which a phone is shaped for.
 *
 * Read from `innerWidth` rather than through `useIsMobile`, which reports
 * `false` on its first render: going through that would lay the tab out at four
 * bars and reflow it a frame later.
 */
function defaultBarsPerSystem(): number {
  if (typeof window === 'undefined') return 4
  return window.innerWidth < MOBILE_BREAKPOINT ? 1 : 4
}

function loadOptions(key: string | undefined): RenderOptions {
  const base: RenderOptions = { barsPerSystem: defaultBarsPerSystem() }
  if (!key) return base
  try {
    const raw = localStorage.getItem(key)
    // Stored choices win over the default, but only the ones actually stored.
    return raw ? { ...base, ...(JSON.parse(raw) as RenderOptions) } : base
  } catch {
    return base
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

  /**
   * Applied only when the draft has actually diverged.
   *
   * This is not an optimisation. Blur applies, and *pressing Play blurs the
   * textarea* — so with an unconditional apply, clicking Play rewrote the track
   * from its own text. For anything the text cannot express (a note off the
   * sixteenth grid, a duration) that meant the act of listening quantised the
   * music and cut the notes short. Nothing to apply, nothing applied.
   *
   * It also fires twice for one click on Apply — the button blurs the textarea
   * first, so `onBlur` runs and then `onClick` does. The second call finds the
   * draft no longer dirty, because applying reset it from the track.
   */
  const apply = useCallback(() => {
    if (draft !== canonical) onApply(draft)
  }, [draft, canonical, onApply])

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

  // The horizontal scrollbar a system wider than the panel brings with it. It
  // takes its height out of the box, and with the vertical scroll turned off it
  // hid the last line of the tab — the count line, or a string — under it.
  const [scrollbarH, setScrollbarH] = useState(0)
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    const measure = () => {
      const cs = getComputedStyle(area)
      const borders = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      const h = Math.max(0, area.offsetHeight - area.clientHeight - borders)
      setScrollbarH(prev => (prev === h ? prev : h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(area)
    return () => ro.disconnect()
  }, [draft])
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
    let lastSystem = -1
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

      // Keep the sounding system on screen — once, when the playhead reaches a
      // new one. Asking for this on every frame would fight the user's own
      // scrolling, and the textarea no longer scrolls vertically anyway: it is
      // as tall as the tab, and the panel around it is what moves.
      if (system.index !== lastSystem) {
        lastSystem = system.index
        mark.scrollIntoView({ block: 'nearest' })
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
    setOptions(prev => {
      const next = { ...prev, [key]: value }
      // Saved here rather than in an effect on `options`: an effect also fires
      // on mount, which would store the screen-width default as though the
      // user had picked it — and then a phone would set the desktop layout to
      // one bar per line for good.
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* private mode */ }
      }
      return next
    })
  }, [storageKey])

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
            width: '100%', resize: 'vertical',
            // Tall enough for the whole tab.
            //
            // A fixed 220px is nine lines, which is most of a four-bar drum
            // pattern and about half of a six-string guitar system — so the tab
            // was there but the box showed a slice of it, and the rest needed a
            // scroll nobody knew was there. The panel around this one scrolls
            // instead, which is the thing the eye expects to scroll.
            height: (draft.split('\n').length * LINE_HEIGHT) + PAD * 2 + 2 + scrollbarH,
            minHeight: 220,
            fontFamily: f('mono'), fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
            color: BT.ink,
            border: '1px solid ' + (dirty ? alpha('accent', 0.5) : BT.rule),
            borderRadius: 8, padding: PAD, whiteSpace: 'pre',
            // Only sideways: a system wider than the panel still scrolls, but
            // the vertical scroll belongs to the panel now.
            overflowX: 'auto', overflowY: 'hidden',
          }}
        />
      </div>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Only while there is something to apply. A permanent "Up to date"
            button is a control that never does anything: the textarea's border
            already turns accent when the draft has diverged, and blur applies
            it anyway. */}
        {dirty && (
          <button
            type="button"
            onClick={apply}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + BT.accent, background: BT.accent, color: '#fff',
              fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
            }}
          >
            Apply changes
          </button>
        )}
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
