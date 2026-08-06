import { useState, useMemo, useCallback } from 'react';
import { UploadCloud, FileJson, Check, X, AlertTriangle, ArrowLeft } from 'lucide-react';
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
  const [difficulty, setDifficulty] = useState<Difficulty>('medio');
  const [view, setView] = useState<'chart' | 'text'>('chart');

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [bpmOverride, setBpmOverride] = useState<string>('');
  const [keyOverride, setKeyOverride] = useState<string>('');

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

  // Recomputed whenever the inputs or the overrides change. All three difficulties come
  // out of a single pass, so switching between them costs nothing.
  const built = useMemo(() => {
    if (!ready) return null;
    try {
      const bpm = bpmOverride.trim() ? Number(bpmOverride) : undefined;
      return buildCharts(loaded.beats!, loaded.chords!, loaded.lyrics!, {
        bpm: Number.isFinite(bpm) && bpm! > 0 ? bpm : undefined,
        key: keyOverride.trim() || undefined,
      });
    } catch {
      return null;
    }
  }, [ready, loaded, bpmOverride, keyOverride]);

  const chart = built?.charts[difficulty] ?? null;

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
    const reducerOk = reducer.every(r => r.mismatches.length === 0);

    const chordBeats = chart.spans.reduce((n, s) => n + s.beats, 0);
    const durationOk = chordBeats === built.beatCount;

    const parsed = parseTextMode(text);
    const tokens = parsed.sections.flatMap(s =>
      s.lines.flatMap(l => l.tokens.filter(t => t.chord && !t.isSpace)),
    );
    const roundTripBeats = tokens.reduce((n, t) => n + t.duration, 0);
    const roundTripOk = tokens.length === chart.spans.length && roundTripBeats === chordBeats;

    return {
      reducerOk,
      reducerDetail: reducerOk
        ? 'El reductor reproduce las columnas del proveedor beat a beat'
        : `${reducer.reduce((n, r) => n + r.mismatches.length, 0)} diferencias contra las columnas del proveedor`,
      durationOk,
      durationDetail: `${chordBeats} beats repartidos entre los acordes vs ${built.beatCount} en el origen`,
      roundTripOk,
      roundTripDetail: `${tokens.length}/${chart.spans.length} acordes y ${roundTripBeats}/${chordBeats} beats sobreviven al pegado`,
      parsed,
    };
  }, [built, chart, loaded.chords, text]);

  const canImport = !!(checks?.roundTripOk && chart && title.trim() && artist.trim());

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

          {/* ── Verificación ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border divide-y divide-border">
            {[
              { ok: checks.reducerOk, label: 'Niveles de dificultad', detail: checks.reducerDetail },
              { ok: checks.durationOk, label: 'Duraciones', detail: checks.durationDetail },
              { ok: checks.roundTripOk, label: 'Importación', detail: checks.roundTripDetail },
            ].map(c => (
              <div key={c.label} className="flex items-start gap-2 px-3 py-2">
                {c.ok
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
