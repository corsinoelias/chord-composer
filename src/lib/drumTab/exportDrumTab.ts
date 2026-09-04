import type { DrumTrack } from './types'

export { copyToClipboard } from '../bassTab/exportTab'

/**
 * Share link and restore, same scheme as the bass tab's (`#d=<base64 json>`) so
 * both tools' links look and behave alike.
 */
export function encodeTrackToHash(track: DrumTrack): string {
  try {
    return '#d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(track)))))
  } catch {
    return ''
  }
}

export function decodeTrackFromHash(hash: string): DrumTrack | null {
  try {
    const match = hash.match(/[#&]?d=([^&]+)/)
    if (!match) return null
    const json = decodeURIComponent(escape(atob(decodeURIComponent(match[1]))))
    const parsed = JSON.parse(json) as DrumTrack
    if (!parsed || !Array.isArray(parsed.hits)) return null
    return parsed
  } catch {
    return null
  }
}
