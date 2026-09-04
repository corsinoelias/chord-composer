import type { DrumPieceId } from './drumSynth'

/**
 * Making the kit SVG react to a hit — the animation map, the flash, and the
 * cymbal-zone hit test.
 *
 * This lived inside `VirtualDrums.tsx` until the Drum Tab Player grew a kit
 * stage of its own. Both mount the same markup from `kitSvg.ts`, so both need
 * the same element ids and the same easing curves; a second copy would drift
 * the moment one of them gained a piece. The crowd reaction stays in
 * `VirtualDrums` — it belongs to the Dark Stage scene, not to the kit.
 *
 * Everything here is DOM-level and takes the container element explicitly, so
 * it makes no assumption about which component mounted the SVG.
 */

type AnimKind = 'drum' | 'cym' | 'hho' | 'hhc' | 'hhf'

/** piece → [element id in the SVG, how it moves, swing amplitude in degrees] */
export const ANIM: Partial<Record<DrumPieceId, [string, AnimKind, number?]>> = {
  'kick': ['an-kick', 'drum'], 'snare': ['an-snare', 'drum'], 'stick': ['an-snare', 'drum'],
  'tom-hi': ['an-tomhi', 'drum'], 'tom-lo': ['an-tomlo', 'drum'], 'tom-floor': ['an-tomfloor', 'drum'],
  'crash-edge': ['an-crash', 'cym', 6], 'crash-body': ['an-crash', 'cym', 3.5], 'crash-bell': ['an-crash', 'cym', 1.4],
  'ride-edge': ['an-ride', 'cym', 4], 'ride-body': ['an-ride', 'cym', 2.2], 'ride-bell': ['an-ride', 'cym', 1],
  'hh-closed': ['an-hhtop', 'hhc'], 'hh-open': ['an-hhtop', 'hho'], 'hh-foot': ['an-hhtop', 'hhf'],
}

/**
 * Play the hit animation for one piece inside `root`.
 *
 * Uses the Web Animations API rather than CSS classes on purpose: a groove can
 * retrigger the same piece twice within 60 ms, and `el.animate()` restarts
 * cleanly where a class toggle needs a forced reflow to do the same.
 */
export function animateKitHit(root: Element | null, id: DrumPieceId): void {
  if (!root) return
  const spec = ANIM[id]
  if (!spec) return
  const [elId, kind, amp = 0] = spec

  const flash = root.querySelector<SVGElement>('#fl-' + elId.slice(3))
  if (flash) flash.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' })

  const el = root.querySelector<SVGElement>('#' + elId)
  if (!el) return

  if (kind === 'drum') {
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }],
      { duration: 130, easing: 'ease-out' },
    )
  } else if (kind === 'cym') {
    el.animate([
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${-amp}deg)` },
      { transform: `rotate(${amp * 0.6}deg)` },
      { transform: `rotate(${-amp * 0.35}deg)` },
      { transform: 'rotate(0deg)' },
    ], { duration: 850, easing: 'ease-out' })
  } else if (kind === 'hho') {
    el.animate([
      { transform: 'translateY(0px) rotate(0deg)' },
      { transform: 'translateY(-10px) rotate(-2deg)' },
      { transform: 'translateY(-8px) rotate(1.5deg)' },
      { transform: 'translateY(0px) rotate(0deg)' },
    ], { duration: 550, easing: 'ease-out' })
  } else if (kind === 'hhc') {
    el.animate([
      { transform: 'rotate(0deg)' }, { transform: 'rotate(-1.5deg)' },
      { transform: 'rotate(1deg)' }, { transform: 'rotate(0deg)' },
    ], { duration: 260, easing: 'ease-out' })
  } else if (kind === 'hhf') {
    el.animate([
      { transform: 'translateY(-6px)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0px)' },
    ], { duration: 200, easing: 'ease-out' })
  }
}

/**
 * Centres and radii, in SVG user units, of the two multi-zone cymbals. A real
 * cymbal sounds different at the bell, the body and the edge, so a click has to
 * be measured against the drawn ellipse rather than just hitting its group.
 */
const CYMBAL_ZONES = {
  crash: { x: 452, y: 205, rx: 128, ry: 30 },
  ride:  { x: 1215, y: 235, rx: 148, ry: 36 },
} as const

/**
 * Which piece a pointer event landed on, zone included.
 *
 * Returns `null` when the event missed every `data-hit` target, so callers can
 * ignore clicks on the backdrop instead of triggering a stray drum.
 */
export function pieceFromPointer(
  root: Element | null,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): DrumPieceId | null {
  const el = target instanceof Element ? target.closest('[data-hit]') : null
  if (!el) return null

  const id = el.getAttribute('data-hit') as DrumPieceId
  const family = id.split('-')[0]
  if (family !== 'crash' && family !== 'ride') return id

  // Zone by normalised distance from the cymbal's centre: bell, body, edge.
  try {
    const svg = root?.querySelector('svg')
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return id
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    const c = CYMBAL_ZONES[family]
    const d = Math.sqrt(((pt.x - c.x) / c.rx) ** 2 + ((pt.y - c.y) / c.ry) ** 2)
    return (family + (d < 0.32 ? '-bell' : d < 0.75 ? '-body' : '-edge')) as DrumPieceId
  } catch {
    return id   // no CTM (detached node, jsdom) — the group's own piece is close enough
  }
}
