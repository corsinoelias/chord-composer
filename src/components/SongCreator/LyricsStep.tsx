import { useState } from 'react';
import { parseLyricsToSections } from './lyricsParser';
import type { EditorSection } from './types';
import { Info } from 'lucide-react';

interface Props {
  initialText: string;
  onNext: (sections: EditorSection[], rawText: string) => void;
  onBack: () => void;
}

const PLACEHOLDER = `Verse 1
Yesterday all my troubles
Seemed so far away

Chorus
Oh I believe in yesterday

Verse 2
Suddenly I'm not half the man
I used to be`;

export default function LyricsStep({ initialText, onNext, onBack }: Props) {
  const [text, setText] = useState(initialText);

  const sections = parseLyricsToSections(text);
  const hasContent = text.trim().length > 0;

  function handleNext() {
    if (!hasContent) return;
    onNext(sections, text);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-1">Paste your lyrics</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Name your sections (Verse 1, Chorus, Bridge…) to separate them.
      </p>

      {/* Hint */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Paste the lyrics here. You'll add chords in the next step.
          Put section names like <strong className="text-foreground">Verse 1</strong>, <strong className="text-foreground">Chorus</strong>, <strong className="text-foreground">Bridge</strong> on their own line to split sections. Blank lines are ignored.
        </p>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={16}
        className="w-full border border-border rounded-xl px-4 py-3 bg-background text-foreground text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
      />

      {/* Section preview */}
      {hasContent && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Detected sections:</span>
          {sections.map(s => (
            <span key={s.id} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={!hasContent}
          className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next: Add chords →
        </button>
      </div>
    </div>
  );
}
