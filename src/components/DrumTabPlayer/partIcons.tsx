import type { CSSProperties, ReactNode } from 'react'
import type { DrumPieceId } from '../../lib/drumTab/types'

/**
 * Line-art glyphs per drum part — lucide only ships a generic `Drum`, so these
 * let the player tell a kick from a hi-hat from a crash at a glance. Rendered
 * like a lucide icon (24 viewBox, currentColor stroke; size and colour come from
 * className/style).
 *
 * Lived inside `RhythmEditor.tsx` until the Drum Tab Player needed the same set;
 * both import from here now.
 */

export type PartIconProps = { className?: string; style?: CSSProperties }
export type PartIcon = (props: PartIconProps) => JSX.Element

const makePartIcon = (children: ReactNode): PartIcon =>
  function PartIconImpl({ className, style }: PartIconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {children}
      </svg>
    )
  }

export const KickIcon = makePartIcon(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.3" /></>)
export const SnareIcon = makePartIcon(<><ellipse cx="12" cy="8" rx="7" ry="2.2" /><path d="M5 8v5a7 2.2 0 0 0 14 0V8" /><path d="M5 11h14" /></>)
export const SnareStickIcon = makePartIcon(<><path d="M5 6.5l13 11" /><path d="M19 6.5l-13 11" /></>)
export const HiHatIcon = makePartIcon(<><path d="M4 10.5h16" /><path d="M5.5 12.5h13" /><path d="M12 12.5v5.5" /><path d="M9 19.5h6" /></>)
export const HiHatOpenIcon = makePartIcon(<><path d="M4 8.5h16" /><path d="M4 12.8h16" /><path d="M12 12.8v5" /><path d="M9 19.5h6" /></>)
export const HiHatFootIcon = makePartIcon(<><path d="M5.5 10.5h13" /><path d="M6.5 12.5h11" /><path d="M12 12.5v4.5" /><path d="M7 20l5-2 5 2" /></>)
export const TomIcon = makePartIcon(<><ellipse cx="12" cy="7.5" rx="6.5" ry="2" /><path d="M5.5 7.5v6a6.5 2 0 0 0 13 0v-6" /></>)
export const FloorTomIcon = makePartIcon(<><ellipse cx="12" cy="7" rx="6" ry="1.8" /><path d="M6 7v7a6 1.8 0 0 0 12 0V7" /><path d="M7 15l-1.5 5M17 15l1.5 5" /></>)
export const RideIcon = makePartIcon(<><ellipse cx="12" cy="10" rx="9" ry="2.2" /><circle cx="12" cy="10" r="1" /><path d="M12 12v7" /><path d="M9 20h6" /></>)
export const CrashIcon = makePartIcon(<><ellipse cx="12" cy="11" rx="9" ry="2" transform="rotate(-14 12 11)" /><path d="M12 12.8V19" /><path d="M9 20h6" /></>)
export const BellIcon = makePartIcon(<><ellipse cx="12" cy="10" rx="9" ry="2.2" /><path d="M9.4 10a2.6 1.9 0 0 1 5.2 0" /><path d="M12 12v7" /><path d="M9 20h6" /></>)

export const PART_ICON: Record<DrumPieceId, PartIcon> = {
  'kick':       KickIcon,
  'snare':      SnareIcon,
  'stick':      SnareStickIcon,
  'tom-hi':     TomIcon,
  'tom-lo':     TomIcon,
  'tom-floor':  FloorTomIcon,
  'hh-closed':  HiHatIcon,
  'hh-open':    HiHatOpenIcon,
  'hh-foot':    HiHatFootIcon,
  'crash-edge': CrashIcon,
  'crash-body': CrashIcon,
  'crash-bell': BellIcon,
  'ride-edge':  RideIcon,
  'ride-body':  RideIcon,
  'ride-bell':  BellIcon,
}
