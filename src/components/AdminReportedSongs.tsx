import { useEffect, useState } from 'react';

interface ReportedSong {
  id: string;
  slug: string;
  title: string;
  artist: string;
  composer_name: string | null;
  is_published: boolean;
  report_count: number;
  reported_at: string | null;
  report_reason: string | null;
}

// Localhost-only review queue for songs flagged via ReportSongButton — see
// src/pages/api/admin/list-reported and src/pages/api/admin/update-song (reused as-is
// for the unpublish action, same pattern as the rest of this admin surface).
export default function AdminReportedSongs() {
  const [songs, setSongs] = useState<ReportedSong[] | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    fetch('/api/admin/list-reported/')
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setSongs(data.songs);
      })
      .catch(() => setError('Failed to load reported songs'));
  }

  useEffect(() => { load(); }, []);

  async function unpublish(song: ReportedSong) {
    setBusySlug(song.slug);
    try {
      const res = await fetch('/api/admin/update-song/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: song.id, payload: { is_published: false } }),
      });
      if (res.ok) load();
    } finally {
      setBusySlug(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!songs) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (songs.length === 0) return <p className="text-sm text-muted-foreground">No reported songs.</p>;

  return (
    <div className="space-y-3">
      {songs.map((song) => (
        <div key={song.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {song.title} — {song.artist}
                {!song.is_published && <span className="ml-2 text-xs text-muted-foreground">(unpublished)</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                /songs/{song.slug}/ · reported {song.report_count}× · composer: {song.composer_name ?? '(same as artist)'}
              </p>
              {song.report_reason && (
                <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{song.report_reason}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`/songs/new/?edit=${song.slug}`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-accent/50"
              >
                Edit
              </a>
              {song.is_published && (
                <button
                  type="button"
                  onClick={() => unpublish(song)}
                  disabled={busySlug === song.slug}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground disabled:opacity-50"
                >
                  {busySlug === song.slug ? 'Unpublishing…' : 'Unpublish'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
