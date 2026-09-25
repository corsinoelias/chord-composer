import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';

interface Props {
  songSlug: string;
}

// Post-publish moderation: publishing itself stays self-service (see SongCreator), this
// is the counterpart that lets a visitor flag a factual error for a human to review — see
// src/pages/api/report-song and src/pages/api/admin/list-reported.
export default function ReportSongButton({ songSlug }: Props) {
  const [open, setOpen] = useState(false);
  // The header's "···" menu asks for this form too (song-report-open): open it and bring it into view.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    };
    window.addEventListener('song-report-open', onOpen);
    return () => window.removeEventListener('song-report-open', onOpen);
  }, []);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit() {
    if (!reason.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/report-song/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: songSlug, reason: reason.trim().slice(0, 500) }),
      });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return <p className="text-xs text-muted-foreground">Thanks — we'll take a look.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
        Report an issue with this song
      </button>
    );
  }

  return (
    <div ref={rootRef} className="rounded-xl border border-border bg-card p-4 max-w-md">
      <label htmlFor="report-reason" className="block text-xs font-semibold text-foreground mb-2">
        What's wrong with this song?
      </label>
      <textarea
        id="report-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. wrong composer credit, incorrect chords in verse 2..."
        rows={3}
        maxLength={500}
        className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={submit}
          disabled={!reason.trim() || status === 'sending'}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {status === 'error' && <span className="text-xs text-destructive">Couldn't send — try again.</span>}
      </div>
    </div>
  );
}
