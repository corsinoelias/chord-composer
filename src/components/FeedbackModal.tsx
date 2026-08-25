import { useCallback, useEffect, useRef, useState } from 'react';
import { FEEDBACK_OPEN_EVENT, type OpenFeedbackDetail } from '@/lib/feedback';
import { getCachedAuth } from '@/lib/authCache';
import { analytics } from '@/lib/analytics';

// Mounted once in BaseLayout (client:idle) so any page can open it — see src/lib/feedback.
//
// Hand-rolled rather than built on ui/dialog + sonner like AuthModal is: this island loads
// on EVERY page including the blog and the SEO landing pages, and pulling
// @radix-ui/react-dialog and a toaster into that bundle would cost every one of them real
// weight for a form most visitors never open. The markup below is the small subset of
// Dialog this actually needs (backdrop, Escape, focus in, focus restored, scroll lock).

type Status = 'idle' | 'sending' | 'sent' | 'error';
type Kind = 'bug' | 'idea' | 'other';

const KINDS: { id: Kind; label: string; placeholder: string }[] = [
  {
    id: 'bug',
    label: 'Bug',
    placeholder: "What happened, and what did you expect instead? If you can, what you clicked right before it.",
  },
  {
    id: 'idea',
    label: 'Idea',
    placeholder: 'What would you like to be able to do?',
  },
  {
    id: 'other',
    label: 'Other',
    placeholder: 'Anything else you want to tell us.',
  },
];

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 2000;

export default function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const entryPoint = useRef('unknown');
  const context = useRef<Record<string, unknown> | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // The element focused when the widget opened, so Escape/Cancel hands focus back to the
  // button that opened it instead of dumping it at the top of the document.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnFocusTo.current?.focus();
    returnFocusTo.current = null;
  }, []);

  useEffect(() => {
    function openWith(detail: OpenFeedbackDetail) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      entryPoint.current = detail.entryPoint;
      context.current = detail.context;
      if (detail.kind) setKind(detail.kind);
      setStatus('idle');
      setError(null);
      setOpen(true);
      setSignedIn(Boolean(getCachedAuth()));
      analytics.feedbackOpened(detail.entryPoint);
      requestAnimationFrame(() => textarea.current?.focus());
    }

    function onOpen(event: Event) {
      // The dispatcher parks the same detail on window for the not-yet-hydrated case;
      // clear it here so an already-handled click can't be replayed on a later mount.
      delete window.__pendingFeedback;
      const detail = (event as CustomEvent<OpenFeedbackDetail>).detail;
      if (detail) openWith(detail);
    }

    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);

    // Drain a click that landed before this island hydrated.
    const pending = window.__pendingFeedback;
    if (pending) {
      delete window.__pendingFeedback;
      openWith(pending);
    }

    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, []);

  // Escape to dismiss, and the background locked so a scroll gesture over the backdrop
  // doesn't move the page underneath.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  /**
   * The access token, loaded only when there is a cached session AND the reporter actually
   * submits. supabase-js is a heavy import and this island is on every page, so it stays
   * behind a dynamic import that a signed-out visitor never triggers. Sending it lets the
   * API attribute the report to the account server-side — a user_id in the body would be
   * unverifiable and is never sent.
   */
  async function accessToken(): Promise<string | null> {
    if (!getCachedAuth()) return null;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase!.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      // Signed-in attribution is a bonus; never let it cost us the report.
      return null;
    }
  }

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length < MIN_MESSAGE) {
      setError(`Please describe it in at least ${MIN_MESSAGE} characters.`);
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      const token = await accessToken();
      const res = await fetch('/api/feedback/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind,
          message: trimmed,
          replyEmail: email.trim(),
          website: honeypot,
          pageUrl: window.location.href,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          context: context.current,
          entryPoint: entryPoint.current,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't send — please try again.");
        setStatus('error');
        return;
      }
      setStatus('sent');
      analytics.feedbackSubmitted(kind, entryPoint.current);
    } catch {
      setError("Couldn't send — check your connection and try again.");
      setStatus('error');
    }
  }

  if (!open) return null;

  const active = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-heading"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
        aria-hidden="true"
      />

      <div className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 shadow-xl">
        {status === 'sent' ? (
          <>
            <h2 id="feedback-heading" className="text-base font-bold text-foreground mb-1">
              Thanks — got it.
            </h2>
            <p className="text-sm text-muted-foreground">
              {email.trim()
                ? "We read every report. If we need more detail, we'll email you."
                : 'We read every report. Reports are worked through newest first.'}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={close}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => { setMessage(''); setStatus('idle'); setError(null); }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Send another
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-1">
              <h2 id="feedback-heading" className="text-base font-bold text-foreground">
                Send feedback
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mt-1 -mr-1 p-1 text-muted-foreground hover:text-foreground"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Found a bug or have an idea? No account needed.
            </p>

            <div role="radiogroup" aria-label="Type of feedback" className="flex gap-1.5 mb-4">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    kind === k.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <label htmlFor="feedback-message" className="block text-xs font-semibold text-foreground mb-1.5">
              What happened? <span className="text-muted-foreground font-normal">(required)</span>
            </label>
            <textarea
              id="feedback-message"
              ref={textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={MAX_MESSAGE}
              placeholder={active.placeholder}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 mb-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <label htmlFor="feedback-email" className="block text-xs font-semibold text-foreground mb-1.5">
              Email <span className="text-muted-foreground font-normal">(optional — only so we can reply)</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              placeholder="you@example.com"
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Honeypot — hidden from humans, filled in by form-filling bots. Positioned
                off-screen rather than display:none, which some bots specifically skip. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 w-px h-px overflow-hidden">
              <label htmlFor="feedback-website">Website</label>
              <input
                id="feedback-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {/* Said plainly rather than buried in the privacy policy: the report carries
                the page you were on and your screen size, which is what makes a bug report
                actionable — and people deserve to know before they hit send. */}
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              Sent with this page&apos;s address and your screen size so we can reproduce it
              {signedIn ? ', and linked to your account' : ''}.
            </p>

            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={submit}
                disabled={message.trim().length < MIN_MESSAGE || status === 'sending'}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
              <button
                type="button"
                onClick={close}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive mt-2">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
