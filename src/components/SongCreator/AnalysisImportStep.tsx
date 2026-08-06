import { useState, useMemo, useCallback } from 'react';
import { UploadCloud, FileJson, Check, X, AlertTriangle, Info, ArrowLeft, ChevronDown, ChevronRight, Link2, Loader2 } from 'lucide-react';
import {
  buildCharts,
  renderChordAbove,
  serializeChart,
  validateAgainstSource,
  type Difficulty,
  type SongChart,
  type RawBeat,
  type RawChordBeat,
  type RawLyricWord,
} from '@/lib/import/chartImport';
import { parseTextMode } from './textParser';
import type { AudioRange, EditorSection, SongMeta } from './types';

// Imports a beat-aligned chord/lyric analysis (the three JSON files a chord-detection
// tool exports) straight into the editor. The heavy lifting is the same library the
// `npm run import:chart` CLI uses — it has no Node dependencies, so it runs here as-is.

type SlotKind = 'beats' | 'chords' | 'lyrics';

const SLOTS: { kind: SlotKind; file: string; what: string }[] = [
  { kind: 'beats', file: 'beats.json', what: 'El pulso: en qué segundo cae cada beat' },
  { kind: 'chords', file: 'chords.json', what: 'El acorde que suena en cada beat' },
  { kind: 'lyrics', file: 'lyrics.json', what: 'La letra, palabra por palabra, con sus tiempos' },
];

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'facil', label: 'Fácil' },
  { id: 'medio', label: 'Medio' },
  { id: 'avanzado', label: 'Avanzado' },
];

// Each file has a distinctive shape, so dropping all three at once and sorting them out
// here beats making someone match file to slot by hand.
function detectKind(json: unknown): SlotKind | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as Record<string, unknown>;
  if ('curr_beat_time' in first && 'chord_complex_pop' in first) return 'chords';
  if ('time' in first && 'beatNum' in first) return 'beats';
  if ('line_id' in first && 'text' in first) return 'lyrics';
  return null;
}

interface Loaded {
  beats?: RawBeat[];
  chords?: RawChordBeat[];
  lyrics?: RawLyricWord[];
}

// The real seconds each section occupies in the recording. This is what the estimated
// per-section split in audioSeeding.ts is trying to approximate — here it is measured,
// so an imported song needs no estimating at all.
function sectionTimeSpans(chart: SongChart): (AudioRange | null)[] {
  return chart.sections.map(section => {
    const spans = section.lines.flatMap(l => l.anchors.map(a => a.span));
    if (spans.length === 0) return null;
    return {
      startSec: Math.min(...spans.map(s => s.startTime)),
      endSec: Math.max(...spans.map(s => s.endTime)),
    };
  });
}

interface Props {
  onImport: (meta: Partial<SongMeta>, sections: EditorSection[]) => void;
  onBack: () => void;
}

export default function AnalysisImportStep({ onImport, onBack }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({});
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medio');
  const [view, setView] = useState<'chart' | 'text'>('chart');

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [bpmOverride, setBpmOverride] = useState<string>('');
  const [keyOverride, setKeyOverride] = useState<string>('');

  // Algorithm knobs — the same ones the CLI takes as flags.
  const [showTuning, setShowTuning] = useState(false);
  const [slash, setSlash] = useState(false);
  const [minBeats, setMinBeats] = useState(1);
  const [gapBeats, setGapBeats] = useState(2);
  const [sectionGap, setSectionGap] = useState(6);

  // Section renames, keyed by the generated name rather than by position: changing
  // sectionGap regroups the song, and an index-keyed rename would then land on a
  // different block.
  const [renames, setRenames] = useState<Record<string, string>>({});

  const ready = !!(loaded.beats && loaded.chords && loaded.lyrics);

  const acceptFiles = useCallback(async (files: FileList | File[]) => {
    const errors: string[] = [];
    const next: Loaded = {};

    for (const file of Array.from(files)) {
      try {
        const json = JSON.parse(await file.text());
        const kind = detectKind(json);
        if (!kind) {
          errors.push(`${file.name}: no reconozco el formato.`);
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[kind] = json;
      } catch {
        errors.push(`${file.name}: no es un JSON válido.`);
      }
    }

    setLoaded(prev => ({ ...prev, ...next }));
    setFileErrors(errors);
  }, []);

  // Goes through our own endpoint: fetching these straight from the browser fails on any
  // host that doesn't send CORS headers, which is most of them.
  const fetchFromUrl = useCallback(async () => {
    const target = url.trim();
    if (!target) return;
    setFetching(true);
    setFileErrors([]);
    try {
      // Trailing slash matters: the site is configured with trailingSlash: 'always'.
      const res = await fetch(`/api/import-chart/fetch/?url=${encodeURIComponent(target)}`);
      const body = await res.json();
      if (!res.ok) {
        setFileErrors([`${target}: ${body?.error ?? 'no se pudo descargar'}`]);
        return;
      }
      const kind = detectKind(body);
      if (!kind) {
        setFileErrors([`${target}: es JSON válido pero no reconozco el formato.`]);
        return;
      }
      setLoaded(prev => ({ ...prev, [kind]: body }));
      setUrl('');
    } catch {
      setFileErrors([`${target}: no se pudo descargar.`]);
    } finally {
      setFetching(false);
    }
  }, [url]);

  // Recomputed whenever the inputs or the overrides change. All three difficulties come
  // out of a single pass, so switching between them costs nothing.
  const built = useMemo(() => {
    if (!ready) return null;
    try {
      const bpm = bpmOverride.trim() ? Number(bpmOverride) : undefined;
      return buildCharts(loaded.beats!, loaded.chords!, loaded.lyrics!, {
        bpm: Number.isFinite(bpm) && bpm! > 0 ? bpm : undefined,
        key: keyOverride.trim() || undefined,
        includeBass: slash,
        minBeats,
        gapBeats,
        sectionGapBeats: sectionGap,
      });
    } catch {
      return null;
    }
  }, [ready, loaded, bpmOverride, keyOverride, slash, minBeats, gapBeats, sectionGap]);

  const generated = built?.charts[difficulty] ?? null;

  // Renames are applied to the chart before anything is serialized, so the preview, the
  // text and the import all agree.
  const chart = useMemo(() => {
    if (!generated) return null;
    return {
      ...generated,
      sections: generated.sections.map(s => ({ ...s, name: renames[s.name]?.trim() || s.name })),
    };
  }, [generated, renames]);

  // A section header that looks like a chord name is read back as a chord, not a header
  // (see isSectionLine in textParser.ts), which would silently swallow the section.
  const badNames = useMemo(
    () => (chart?.sections ?? [])
      .map(s => s.name)
      .filter(n => /^[A-G][#b]?(m|maj|min|dim|aug|sus[24]?|add|M|b)?[0-9]*$/.test(n) && n.length <= 8),
    [chart],
  );

  const metaForText = useMemo(() => ({
    title: title.trim() || undefined,
    artist: artist.trim() || undefined,
    key: built?.key,
    bpm: built?.bpm,
  }), [title, artist, built]);

  const text = useMemo(
    () => (chart ? serializeChart(chart, metaForText) : ''),
    [chart, metaForText],
  );

  // ── Validation: the same three checks the CLI prints ────────────────────────
  const checks = useMemo(() => {
    if (!built || !chart || !loaded.chords) return null;

    const reducer = validateAgainstSource(loaded.chords);
    const reducerDiffs = reducer.reduce((n, r) => n + r.mismatches.length, 0);

    const chordBeats = chart.spans.reduce((n, s) => n + s.beats, 0);
    const durationOk = chordBeats + built.noChordBeats === built.beatCount;

    const parsed = parseTextMode(text);
    const tokens = parsed.sections.flatMap(s =>
      s.lines.flatMap(l => l.tokens.filter(t => t.chord && !t.isSpace)),
    );
    const roundTripBeats = tokens.reduce((n, t) => n + t.duration, 0);
    const roundTripOk = tokens.length === chart.spans.length && roundTripBeats === chordBeats;

    return {
      reducerDiffs,
      reducerDetail: reducerDiffs === 0
        ? 'Idéntico a las columnas del proveedor'
        : `${reducerDiffs} acordes distintos a los del proveedor. No es un error: en los charts de referencia un semidisminuido se escribe como menor en el nivel fácil, y seguimos la referencia.`,
      durationOk,
      durationDetail: `${chordBeats} beats de acordes + ${built.noChordBeats} de silencio = ${chordBeats + built.noChordBeats} de ${built.beatCount} en el origen`,
      roundTripOk,
      roundTripDetail: `${tokens.length}/${chart.spans.length} acordes y ${roundTripBeats}/${chordBeats} beats sobreviven al pegado`,
      parsed,
    };
  }, [built, chart, loaded.chords, text]);

  const canImport = !!(checks?.roundTripOk && chart && title.trim() && artist.trim() && badNames.length === 0);

  const handleImport = () => {
    if (!canImport || !chart || !checks || !built) return;
    const sections = checks.parsed.sections;

    // Attach the measured section boundaries. Matching is positional, so anything that
    // makes the counts disagree means the mapping can't be trusted — better no ranges
    // than ranges pointing at the wrong part of the recording.
    const spans = sectionTimeSpans(chart);
    const aligned = sections.length === spans.length;
    const withRanges = aligned
      ? sections.map((s, i) => (spans[i] ? { ...s, audioRange: spans[i]! } : s))
      : sections;

    const all = spans.filter(Boolean) as AudioRange[];
    const wholeRange = aligned && all.length > 0
      ? { startSec: Math.min(...all.map(r => r.startSec)), endSec: Math.max(...all.map(r => r.endSec)) }
      : undefined;

    onImport(
      {
        title: title.trim(),
        artist: artist.trim(),
        key: built.key || undefined,
        bpm: built.bpm || undefined,
        ...(wholeRange ? { audioWholeRange: wholeRange } : {}),
      },
      withRanges,
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Importar desde un análisis</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Soltá los tres JSON que exporta el analizador de acordes. Se arma el chart con
          la duración real de cada acorde y anclado a la palabra sobre la que cae.
        </p>
      </div>

      {/* ── Carga ─────────────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); acceptFiles(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed transition-colors p-6 text-center
          ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
      >
        <UploadCloud className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-foreground font-medium">Arrastrá los tres archivos acá</p>
        <p className="text-xs text-muted-foreground mt-1">
          No importa el orden ni el nombre: se reconocen por su contenido.
        </p>
        <label className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-pointer transition-colors">
          Elegir archivos
          <input
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={e => e.target.files && acceptFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Carga desde URL — uno por vez, se clasifica igual que un archivo */}
      <div className="flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchFromUrl()}
          placeholder="…o pegá la URL pública de uno de los JSON"
          aria-label="URL de un archivo del análisis"
          className="flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={fetchFromUrl}
          disabled={!url.trim() || fetching}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {fetching && <Loader2 className="w-3 h-3 animate-spin" />}
          Traer
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SLOTS.map(slot => {
          const has = !!loaded[slot.kind];
          return (
            <div
              key={slot.kind}
              className={`rounded-lg border p-3 ${has ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
            >
              <div className="flex items-center gap-1.5">
                {has
                  ? <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <FileJson className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-xs font-mono font-medium text-foreground">{slot.file}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{slot.what}</p>
            </div>
          );
        })}
      </div>

      {fileErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          {fileErrors.map((e, i) => (
            <p key={i} className="text-xs text-destructive flex items-center gap-1.5">
              <X className="w-3 h-3 shrink-0" />{e}
            </p>
          ))}
        </div>
      )}

      {ready && !built && (
        <p className="text-sm text-destructive">
          Los tres archivos cargaron pero no se pudo armar el chart. Puede que no
          correspondan a la misma canción.
        </p>
      )}

      {built && chart && checks && (
        <>
          {/* ── Datos de la canción ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Título</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Requerido"
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Artista</label>
              <input
                value={artist}
                onChange={e => setArtist(e.target.value)}
                placeholder="Requerido"
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                BPM <span className="font-normal">· detectado {built.detectedBpm}</span>
              </label>
              <input
                value={bpmOverride}
                onChange={e => setBpmOverride(e.target.value)}
                placeholder={String(built.detectedBpm)}
                inputMode="numeric"
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Tonalidad <span className="font-normal">· detectada {built.detectedKey ?? '—'}</span>
              </label>
              <input
                value={keyOverride}
                onChange={e => setKeyOverride(e.target.value)}
                placeholder={built.detectedKey ?? 'C'}
                className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            El BPM no es solo un dato: fija las tolerancias con las que se decide qué
            acorde pertenece a qué línea y dónde empieza cada sección. Cambialo y mirá
            cómo se reacomoda el chart.
          </p>

          {/* ── Nivel ───────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
              {DIFFICULTIES.map(d => {
                const c = built.charts[d.id];
                return (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors
                      ${difficulty === d.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {d.label}
                    <span className="ml-1.5 font-normal opacity-60">
                      {new Set(c.spans.map(s => s.label)).size}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {chart.spans.length} acordes · {new Set(chart.spans.map(s => s.label)).size} distintos ·{' '}
              {chart.sections.length} secciones
            </p>
          </div>

          {/* ── Ajustes del algoritmo ───────────────────────────────────── */}
          <div className="rounded-xl border border-border">
            <button
              onClick={() => setShowTuning(v => !v)}
              aria-expanded={showTuning}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              {showTuning ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Ajustes del algoritmo
              <span className="font-normal opacity-70">
                · bajos {slash ? 'sí' : 'no'} · mínimo {minBeats} · hueco {gapBeats} · sección {sectionGap}
              </span>
            </button>

            {showTuning && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slash}
                    onChange={e => setSlash(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">Conservar acordes con bajo propio</span>
                    <span className="block text-xs text-muted-foreground">
                      D/A, F#m/A… Solo en avanzado. El análisis los trae y el motor los
                      toca, pero los charts de referencia los descartan.
                    </span>
                  </span>
                </label>

                {[
                  {
                    label: 'Duración mínima de un acorde', value: minBeats, set: setMinBeats, min: 1, max: 8,
                    help: 'Los acordes más cortos que esto se absorben en el vecino. En 1 se conservan todos, que suele ser lo correcto: un acorde de un beat puede ser real.',
                  },
                  {
                    label: 'Hueco para línea instrumental', value: gapBeats, set: setGapBeats, min: 1, max: 8,
                    help: 'Cuánto silencio tiene que haber alrededor de un acorde para que salga en su propia línea en vez de pegarse a la letra vecina.',
                  },
                  {
                    label: 'Silencio que abre una sección', value: sectionGap, set: setSectionGap, min: 2, max: 32,
                    help: 'Cuánto silencio separa dos bloques de letra para considerarlos secciones distintas. Bajarlo parte más la canción.',
                  },
                ].map(k => (
                  <div key={k.label}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">{k.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="range"
                          min={k.min}
                          max={k.max}
                          value={k.value}
                          onChange={e => k.set(Number(e.target.value))}
                          className="w-32"
                          aria-label={k.label}
                        />
                        <span className="text-xs font-mono tabular-nums w-10 text-right text-muted-foreground">
                          {k.value} {k.value === 1 ? 'beat' : 'beats'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{k.help}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Nombres de sección ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-foreground">
                Nombres de sección
                <span className="font-normal text-muted-foreground"> · nada en el análisis dice cuál es verso y cuál coro</span>
              </p>
              {Object.keys(renames).length > 0 && (
                <button
                  onClick={() => setRenames({})}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Restablecer
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {generated?.sections.map(s => {
                const firstLyric = s.lines.find(l => l.lyric)?.lyric?.text;
                return (
                  <div key={s.name}>
                    <input
                      value={renames[s.name] ?? s.name}
                      onChange={e => setRenames(p => ({ ...p, [s.name]: e.target.value }))}
                      aria-label={`Nombre de la sección ${s.name}`}
                      className="w-full border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 truncate" title={firstLyric}>
                      {firstLyric ?? 'Instrumental'}
                    </p>
                  </div>
                );
              })}
            </div>
            {badNames.length > 0 && (
              <p className="text-xs text-destructive mt-2">
                «{badNames.join('», «')}» se lee como nombre de acorde, no como
                encabezado de sección, y la sección se perdería. Usá otro nombre.
              </p>
            )}
          </div>

          {/* ── Verificación ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border divide-y divide-border">
            {[
              // Only the last two gate the import. The first is a similarity readout:
              // where we differ from the provider we're matching the reference charts.
              { ok: true, info: true, label: 'Niveles de dificultad', detail: checks.reducerDetail },
              { ok: checks.durationOk, label: 'Duraciones', detail: checks.durationDetail },
              { ok: checks.roundTripOk, label: 'Importación', detail: checks.roundTripDetail },
            ].map(c => (
              <div key={c.label} className="flex items-start gap-2 px-3 py-2">
                {c.info
                  ? <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  : c.ok
                    ? <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{c.label}</p>
                  <p className={`text-xs ${c.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Vista previa ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-1 mb-2 p-1 bg-muted/50 rounded-lg border border-border w-fit">
              {([['chart', 'Acordes sobre la letra'], ['text', 'Texto que se importa']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded transition-colors
                    ${view === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <pre className="text-[11px] font-mono leading-relaxed bg-muted/30 border border-border rounded-lg p-3 max-h-96 overflow-auto whitespace-pre">
              {view === 'chart' ? renderChordAbove(chart) : text}
            </pre>
          </div>

          {/* ── Tramos de audio medidos ─────────────────────────────────── */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground">
              Cada sección se importa con el segundo exacto en que empieza en la grabación
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Salen medidos del análisis, no estimados, así que no hay que revisarlos.
              Adjuntá después la <strong className="text-foreground font-medium">misma grabación</strong> que
              analizaste como referencia vocal y todo va a quedar en su lugar. Si adjuntás
              otra versión, los tiempos no valen.
            </p>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <button
          onClick={handleImport}
          disabled={!canImport}
          title={!chart ? undefined : !title.trim() || !artist.trim() ? 'Faltan el título y el artista' : undefined}
          className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Importar al editor
        </button>
      </div>
    </div>
  );
}
