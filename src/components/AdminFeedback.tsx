import { useEffect, useState } from 'react';

interface FeedbackRow {
  id: string;
  kind: 'bug' | 'idea' | 'other';
  message: string;
  reply_email: string | null;
  user_id: string | null;
  page_url: string | null;
  user_agent: string | null;
  viewport: string | null;
  context: Record<string, unknown> | null;
  entry_point: string | null;
  status: 'new' | 'triaged' | 'done' | 'wontfix';
  created_at: string;
}

type StatusFilter = 'new' | 'triaged' | 'done' | 'wontfix' | 'all';

const FILTERS: StatusFilter[] = ['new', 'triaged', 'done', 'wontfix', 'all'];

// Which status buttons to offer on a row — never the one it already has.
const NEXT_STATUSES: FeedbackRow['status'][] = ['triaged', 'done', 'wontfix', 'new'];

const KIND_STYLES: Record<FeedbackRow['kind'], string> = {
  bug: 'bg-destructive/10 text-destructive',
  idea: 'bg-primary/10 text-primary',
  other: 'bg-muted text-muted-foreground',
};

// Localhost-only review queue for reports filed via FeedbackModal — see
// src/pages/api/admin/list-feedback and .../update-feedback. Same pattern as
// AdminReportedSongs, which is the only admin surface this app has.
export default function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('new');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetch(`/api/admin/list-feedback/?status=${filter}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setRows(data.feedback);
      })
      .catch(() => { if (!cancelled) setError('Failed to load feedback'); });
    // Guards against a slow response for an abandoned filter landing after a fast one for
    // the current filter and overwriting it.
    return () => { cancelled = true; };
  }, [filter]);

  async function setStatus(row: FeedbackRow, status: FeedbackRow['status']) {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/update-feedback/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status }),
      });
      if (!res.ok) return;
      // Drop it from the list locally instead of refetching: under any single-status
      // filter the row no longer belongs, and a refetch would make the whole list flash.
      setRows((current) =>
        current === null
          ? null
          : filter === 'all'
            ? current.map((r) => (r.id === row.id ? { ...r, status } : r))
            : current.filter((r) => r.id !== row.id),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && rows?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      )}

      <div className="space-y-3">
        {rows?.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${KIND_STYLES[row.kind]}`}>
                {row.kind}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
              {row.entry_point && (
                <span className="text-xs text-muted-foreground">· via {row.entry_point}</span>
              )}
              {row.status !== 'new' && (
                <span className="text-xs text-muted-foreground">· {row.status}</span>
              )}
            </div>

            <p className="text-sm text-foreground whitespace-pre-wrap">{row.message}</p>

            <div className="text-xs text-muted-foreground mt-3 space-y-0.5">
              {row.page_url && (
                <p className="break-all">
                  {/* noreferrer so opening a reported page from here can't show up in its
                      own analytics as traffic from the admin queue. */}
                  <a href={row.page_url} target="_blank" rel="noopener noreferrer" className="underline">
                    {row.page_url}
                  </a>
                </p>
              )}
              <p>
                {row.viewport ?? 'no viewport'}
                {row.user_id ? ' · signed in' : ' · anonymous'}
                {row.reply_email && (
                  <>
                    {' · '}
                    <a href={`mailto:${row.reply_email}`} className="underline">{row.reply_email}</a>
                  </>
                )}
              </p>
              {row.user_agent && <p className="break-all opacity-70">{row.user_agent}</p>}
              {row.context && (
                <pre className="mt-1 p-2 rounded bg-muted/50 overflow-x-auto text-[11px]">
                  {JSON.stringify(row.context, null, 2)}
                </pre>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {NEXT_STATUSES.filter((s) => s !== row.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => setStatus(row, s)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
