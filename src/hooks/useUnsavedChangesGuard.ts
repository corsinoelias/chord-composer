import { useEffect } from 'react'

/**
 * Warns via the browser's native "leave page?" dialog when shouldWarn is true.
 * The dialog's text/buttons can't be customized (browsers locked this down
 * industry-wide after it was abused for social-engineering pop-ups) — this is
 * the real, unavoidable extent of what a beforeunload guard can offer.
 */
export function useUnsavedChangesGuard(shouldWarn: boolean) {
  useEffect(() => {
    if (!shouldWarn) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldWarn])
}
