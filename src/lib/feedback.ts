/**
 * The one way to open the feedback widget, from anywhere: an Astro page's inline
 * <script>, a React island, an event handler in the editor.
 *
 * Going through a CustomEvent rather than lifting the modal's state into a shared store
 * keeps the two sides independent — the triggers work with the island absent (they just
 * do nothing) and the island works with every trigger absent. Same shape as
 * SuggestSongForm's OPEN_EVENT, for the same reason.
 *
 * Dependency-free on purpose: this module is imported by the small script that runs on
 * every page, so anything it pulls in ships everywhere.
 */

export const FEEDBACK_OPEN_EVENT = 'feedback:open';

export interface OpenFeedbackDetail {
  /** Which UI opened the widget — 'footer', 'contact', 'editor'… Tags the stored row and
   *  the GA4 events so entry points can be compared. Never named `source`: reserved by
   *  GA4, see src/lib/analytics.ts. */
  entryPoint: string;
  /** Whatever is diagnostic where the widget was opened from (song id, style id, bpm…).
   *  Stored as jsonb; the API drops it whole if it serializes over 2KB. */
  context?: Record<string, unknown>;
  /** Preselects the report type, e.g. a "Report a bug" link opening straight on 'bug'. */
  kind?: 'bug' | 'idea' | 'other';
}

declare global {
  interface Window {
    /** Handoff for the one case an event alone cannot cover: the island is client:idle, so
     *  a click in the first moment after load can fire before the listener exists and
     *  would silently do nothing. The detail is parked here and hydration drains it.
     *  `window` rather than a module-level variable because page scripts and the island are
     *  separate bundles with separate module instances. */
    __pendingFeedback?: OpenFeedbackDetail;
  }
}

export function openFeedback(detail: OpenFeedbackDetail): void {
  if (typeof window === 'undefined') return;
  window.__pendingFeedback = detail;
  window.dispatchEvent(new CustomEvent<OpenFeedbackDetail>(FEEDBACK_OPEN_EVENT, { detail }));
}
