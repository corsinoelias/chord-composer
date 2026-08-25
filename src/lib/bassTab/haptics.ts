export function triggerHaptic(kind: 'tap' | 'longpress' | 'delete' = 'tap') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    navigator.vibrate(kind === 'longpress' ? 18 : kind === 'delete' ? [10, 30, 10] : 8)
  } catch {
    // Vibration API can throw in some embedded/webview contexts — feedback is best-effort.
  }
}
