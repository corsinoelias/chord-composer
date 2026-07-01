import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Lightbulb } from 'lucide-react';
import { parseTextMode } from './textParser';
import type { SongMeta, EditorSection } from './types';

const EXAMPLE_INLINE = `Title: Yesterday
Artist: The Beatles
Key: F
Capo: 2
BPM: 96
Style: Folk
Genre: pop, rock

[Verse 1]
[F]Yesterday, [Em7]all my [A7]troubles seemed so [Dm]far away
[Bb]Now it [C]looks as though they're [F]here to stay

[Chorus]
[Bb]Yesterday [C]love was [F]such an [Dm]easy game to play
[Bb]Now I [C]need a place to [F]hide away`;

const EXAMPLE_ABOVE = `Title: Lord You Are Good
Artist: Israel Houghton
Key: E
BPM: 78
Style: Pop
Genre: worship

Verse
E
Lord You are good
          B               D      A
And Your mercy endureth forever

Chorus
    E       B
We worship You
 D           A
Hallelujah, Hallelujah
    E       B
We worship You
             G   A
For who You are`;

const FORMAT_RULES = [
  { symbol: 'Title:', desc: 'Song title' },
  { symbol: 'Artist:', desc: 'Artist name' },
  { symbol: 'Key:', desc: 'Key, e.g. C, Am, F#' },
  { symbol: 'Capo:', desc: 'Capo fret number, e.g. 2' },
  { symbol: 'BPM:', desc: 'Tempo in beats per minute' },
  { symbol: 'Style:', desc: 'Pop, Rock, Jazz, Folk, Blues, Lo-fi' },
  { symbol: 'Genre:', desc: 'Comma-separated genres' },
  { symbol: '[Verse 1]', desc: 'Section header — or just write "Verse", "Chorus", etc.' },
  { symbol: '[Chorus x2]', desc: 'Repeat a section N times when played — or just write "Chorus x2"' },
  { symbol: '[Am]text', desc: 'Inline chords — or use standard chord-above-lyric format' },
];

interface Props {
  initialText?: string;
  onImport: (meta: Partial<SongMeta>, sections: EditorSection[]) => void;
  onBack: () => void;
}

export default function TextModeStep({ initialText = '', onImport, onBack }: Props) {
  const [text, setText] = useState(initialText);
  const [showGuide, setShowGuide] = useState(!initialText);
  const [copied, setCopied] = useState(false);
  const [exampleFormat, setExampleFormat] = useState<'inline' | 'above'>('above');

  const { meta, sections } = useMemo(() => parseTextMode(text), [text]);

  const hasMeta = Object.keys(meta).length > 0;
  const hasSections = sections.length > 0;
  const canImport = hasMeta || hasSections;

  const activeExample = exampleFormat === 'above' ? EXAMPLE_ABOVE : EXAMPLE_INLINE;

  function handleCopyExample() {
    navigator.clipboard.writeText(activeExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLoadExample() {
    setText(activeExample);
    setShowGuide(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-1">Import from text</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Paste your song with chords — title, artist, key, and sections are detected automatically.
      </p>

      {/* Format guide */}
      <div className="mb-5 rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setShowGuide(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span>How does the format work?</span>
          </div>
          {showGuide
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showGuide && (
          <div className="p-4 bg-muted/20 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FORMAT_RULES.map(r => (
                <div key={r.symbol} className="flex items-start gap-2 text-xs">
                  <code className="shrink-0 bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 font-mono text-[11px]">
                    {r.symbol}
                  </code>
                  <span className="text-muted-foreground mt-0.5">{r.desc}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Example:</span>
                  <div className="flex gap-1">
                    {(['above', 'inline'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setExampleFormat(fmt)}
                        className={`text-[11px] px-2 py-0.5 rounded transition-colors ${exampleFormat === fmt ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {fmt === 'above' ? 'Chords above lyrics' : '[Chord]inline'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleLoadExample}
                    className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                  >
                    Load example
                  </button>
                  <button
                    onClick={handleCopyExample}
                    className="text-xs px-2.5 py-1 border border-border rounded-md text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <pre className="px-4 py-3 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap overflow-x-auto">
                {activeExample}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Title: My Song\nArtist: Artist Name\nKey: Am\nBPM: 120\n\n[Verse 1]\n[Am]Start typing with [F]chords [C]inline [G]here\n\n[Chorus]\n[F]Chords go [C]before the [G]word they sit on`}
        rows={18}
        spellCheck={false}
        className="w-full border border-border rounded-xl px-4 py-3 bg-background text-foreground text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        autoFocus
      />

      {/* Live detection preview */}
      {canImport && (
        <div className="mt-3 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
          <p className="text-[11px] font-semibold text-foreground uppercase tracking-widest">Detected</p>

          {hasMeta && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {meta.title  && <span><strong className="text-foreground">Title:</strong> {meta.title}</span>}
              {meta.artist && <span><strong className="text-foreground">Artist:</strong> {meta.artist}</span>}
              {meta.key    && <span><strong className="text-foreground">Key:</strong> {meta.key}</span>}
              {meta.capo   ? <span><strong className="text-foreground">Capo:</strong> {meta.capo}</span> : null}
              {meta.bpm    && <span><strong className="text-foreground">BPM:</strong> {meta.bpm}</span>}
              {meta.genre?.length ? <span><strong className="text-foreground">Genre:</strong> {meta.genre.join(', ')}</span> : null}
            </div>
          )}

          {hasSections && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {sections.map(s => {
                const chords = s.lines.flatMap(l => l.tokens.filter(t => t.chord)).length;
                return (
                  <span key={s.id} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {s.name} · {chords} {chords === 1 ? 'chord' : 'chords'}{s.repeatCount > 1 ? ` · ×${s.repeatCount}` : ''}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => onImport(meta, sections)}
          disabled={!canImport}
          className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue to editor →
        </button>
      </div>
    </div>
  );
}
