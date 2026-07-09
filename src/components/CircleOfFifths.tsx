import { useState, useCallback, useMemo, useEffect } from 'react';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { GuitarChordDiagram } from '@/components/GuitarChordDiagram';
import { getChordNotes, getTransposedChordName } from '@/lib/chordNotes';
import { getGuitarVoicing } from '@/data/guitarChords';
import { createSection } from '@/lib/sections';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { MUSICAL_STYLES } from '@/lib/styles';
import { generateChordId } from '@/lib/musicTheory';
import type { Chord, RootNote, Accidental, ChordQuality } from '@/lib/musicTheory';
import { Play, Square } from 'lucide-react';
import { analytics } from '@/lib/analytics';

// ─── Data ─────────────────────────────────────────────────────────────────────

const KEYS       = ['C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯','F'];
const KEYS_FULL  = ['C major','G major','D major','A major','E major','B major',
                    'F♯ major','C♯ major','G♯ major','D♯ major','A♯ major','F major'];
const REL_MINORS = ['Am','Em','Bm','F♯m','C♯m','G♯m','D♯m','A♯m','Fm','Cm','Gm','Dm'];
const PAR_MINORS_OF_MAJOR = ['Cm','Gm','Dm','Am','Em','Bm','F♯m','C♯m','G♯m','D♯m','A♯m','Fm'];

const DIATONIC_MAJ: string[][] = [
  ['C',  'Dm',  'Em',  'F',  'G',  'Am',  'B°'],
  ['G',  'Am',  'Bm',  'C',  'D',  'Em',  'F♯°'],
  ['D',  'Em',  'F♯m', 'G',  'A',  'Bm',  'C♯°'],
  ['A',  'Bm',  'C♯m', 'D',  'E',  'F♯m', 'G♯°'],
  ['E',  'F♯m', 'G♯m', 'A',  'B',  'C♯m', 'D♯°'],
  ['B',  'C♯m', 'D♯m', 'E',  'F♯', 'G♯m', 'A♯°'],
  ['F♯', 'G♯m', 'A♯m', 'B',  'C♯', 'D♯m', 'F°'],
  ['C♯', 'D♯m', 'Fm',  'F♯', 'G♯', 'A♯m', 'C°'],
  ['G♯', 'A♯m', 'Cm',  'C♯', 'D♯', 'Fm',  'G°'],
  ['D♯', 'Fm',  'Gm',  'G♯', 'A♯', 'Cm',  'D°'],
  ['A♯', 'Cm',  'Dm',  'D♯', 'F',  'Gm',  'A°'],
  ['F',  'Gm',  'Am',  'A♯', 'C',  'Dm',  'E°'],
];
const DIATONIC_MIN: string[][] = [
  ['Am', 'B°',  'C',  'Dm', 'Em', 'F',  'G'],
  ['Em', 'F♯°', 'G',  'Am', 'Bm', 'C',  'D'],
  ['Bm', 'C♯°', 'D',  'Em', 'F♯m','G',  'A'],
  ['F♯m','G♯°', 'A',  'Bm', 'C♯m','D',  'E'],
  ['C♯m','D♯°', 'E',  'F♯m','G♯m','A',  'B'],
  ['G♯m','A♯°', 'B',  'C♯m','D♯m','E',  'F♯'],
  ['D♯m','F°',  'G',  'G♯m','A♯m','C',  'D'],
  ['A♯m','C°',  'D',  'D♯m','Fm', 'G',  'A'],
  ['Fm', 'G°',  'G♯', 'A♯m','Cm', 'C♯', 'D♯'],
  ['Cm', 'D°',  'D♯', 'Fm', 'Gm', 'G♯', 'A♯'],
  ['Gm', 'A°',  'A♯', 'Cm', 'Dm', 'D♯', 'F'],
  ['Dm', 'E°',  'F',  'Gm', 'Am', 'A♯', 'C'],
];

const ROMAN_MAJ  = ['I',  'ii',  'iii', 'IV', 'V',  'vi',  'vii°'];
const ROMAN_MIN  = ['i',  'ii°', 'III', 'iv', 'v',  'VI',  'VII'];
const FUNCS_MAJ  = ['tonic','supertonic','mediant','subdominant','dominant','submediant','leading tone'];
const FUNCS_MIN  = ['tonic','supertonic','mediant','subdominant','dominant','submediant','subtonic'];

// ─── SVG constants ────────────────────────────────────────────────────────────
const CX = 125, CY = 125;
const R_O_STROKE = 76, R_O_SW = 28;
const R_I_STROKE = 48, R_I_SW = 30;
const R_O_OUT = R_O_STROKE + R_O_SW / 2;  // 90
const R_O_IN  = R_O_STROKE - R_O_SW / 2;  // 62
const R_I_OUT = R_I_STROKE + R_I_SW / 2;  // 63
const R_I_IN  = R_I_STROKE - R_I_SW / 2;  // 33
const STEP = 30, HALF = 14.5;

function rad(d: number) { return (d * Math.PI) / 180; }
function pt(r: number, deg: number): [number, number] {
  return [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))];
}
function wedge(r1: number, r2: number, center: number): string {
  const a1 = center - HALF, a2 = center + HALF;
  const [ax,ay]=pt(r1,a1),[bx,by]=pt(r2,a1),[cx2,cy2]=pt(r2,a2),[dx,dy]=pt(r1,a2);
  return `M${ax} ${ay}L${bx} ${by}A${r2} ${r2} 0 0 1 ${cx2} ${cy2}L${dx} ${dy}A${r1} ${r1} 0 0 0 ${ax} ${ay}Z`;
}
function keyAngle(i: number) { return i * STEP - 90; }

// ─── Unicode symbols → ASCII for URLs / chord parser ─────────────────────────
function toAsciiChord(name: string): string {
  return name.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/°/g, 'dim');
}

// ─── Parse display chord name → Chord object ─────────────────────────────────
function toChord(name: string): Chord | null {
  const s = toAsciiChord(name).trim();
  const m = s.match(/^([A-G])([#b]?)(m|dim|°|maj7|m7|7|aug)?$/);
  if (!m) return null;
  const root = m[1] as RootNote;
  const accidental = (m[2] ?? '') as Accidental;
  const q = m[3] ?? '';
  const quality: ChordQuality =
    q === 'm' ? 'min' : (q === 'dim' || q === '°') ? 'dim' :
    q === 'm7' ? 'min7' : q === 'maj7' ? 'maj7' : q === '7' ? '7' :
    q === 'aug' ? 'aug' : 'maj';
  return { id: generateChordId(), root, accidental, quality, duration: 2 };
}

// ─── Selection type ───────────────────────────────────────────────────────────
type Sel = { type: 'major' | 'minor'; idx: number } | null;

// ─── Inner component (uses PlaybackContext) ───────────────────────────────────
function CircleOfFifthsInner() {
  const { state: playbackState, play, stop } = usePlayback();
  const { isPlaying, currentChordIndex } = playbackState;

  const [sel,         setSel]         = useState<Sel>(null);
  const [hover,       setHover]       = useState<{ type: 'major'|'minor'; idx: number } | null>(null);
  const [hoveredDeg,  setHoveredDeg]  = useState<number | null>(null);

  const isMajorSel = sel?.type === 'major';
  const isMinorSel = sel?.type === 'minor';
  const selIdx     = sel?.idx ?? -1;

  const diatonic = isMajorSel ? DIATONIC_MAJ[selIdx]
    : isMinorSel ? DIATONIC_MIN[selIdx]
    : null;
  const roman    = isMajorSel ? ROMAN_MAJ : ROMAN_MIN;
  const funcs    = isMajorSel ? FUNCS_MAJ : FUNCS_MIN;

  const keyName = sel === null ? '' :
    isMajorSel ? KEYS_FULL[selIdx] : `${REL_MINORS[selIdx]} natural minor`;
  const relKey  = sel === null ? '' :
    isMajorSel ? REL_MINORS[selIdx] : KEYS[selIdx];
  const parKey  = sel === null ? '' :
    isMajorSel ? PAR_MINORS_OF_MAJOR[selIdx] : KEYS[selIdx] + ' major';

  // Stop playback when selection changes
  useEffect(() => { stop(); }, [sel]);
  // Stop on unmount
  useEffect(() => () => { stop(); }, []);

  // Current playing chord (drives visualization)
  const currentPlayingChord = useMemo<Chord | null>(() => {
    if (!isPlaying || currentChordIndex < 0 || !diatonic) return null;
    return toChord(diatonic[currentChordIndex % diatonic.length]);
  }, [isPlaying, currentChordIndex, diatonic]);

  const activeNotes = useMemo(
    () => currentPlayingChord ? getChordNotes(currentPlayingChord, 0) : [],
    [currentPlayingChord],
  );
  const guitarVoicing = useMemo(
    () => currentPlayingChord ? getGuitarVoicing(currentPlayingChord, 0) : null,
    [currentPlayingChord],
  );
  const chordDisplayName = useMemo(
    () => currentPlayingChord ? getTransposedChordName(currentPlayingChord, 0) : '',
    [currentPlayingChord],
  );

  // Play full diatonic sequence using PlaybackContext
  const playDiatonic = useCallback(async () => {
    if (!diatonic) return;
    if (isPlaying) { stop(); return; }
    analytics.toolWidgetUsed('circle_of_fifths');
    const chords = diatonic.map(toChord).filter(Boolean) as Chord[];
    if (chords.length === 0) return;
    const section = { ...createSection('Scale'), chords };
    const style = MUSICAL_STYLES.find(s => s.id === 'pop_basic') ?? MUSICAL_STYLES[0];
    try {
      await play([section], {
        bpm: 80,
        metronome: false,
        instruments: getDefaultInstrumentStates(),
        styleId: style.id,
        transposition: 0,
        liveEditedStyle: null,
        customStyles: [],
        loopingSectionIndex: null,
      });
    } catch {/* user stopped */}
  }, [diatonic, isPlaying, play, stop]);

  // SVG helpers
  function outerFill(i: number) {
    if (sel?.type === 'major' && sel.idx === i) return 'rgba(20,20,20,0.8)';
    if (hover?.type === 'major' && hover.idx === i) return 'rgba(255,255,255,0.14)';
    return 'transparent';
  }
  function innerFill(i: number) {
    if (sel?.type === 'minor' && sel.idx === i) return 'rgba(20,20,20,0.7)';
    if (hover?.type === 'minor' && hover.idx === i) return 'rgba(255,255,255,0.1)';
    return 'transparent';
  }

  const outerDots = sel === null ? [] : isMajorSel
    ? [{ i: selIdx, label:'I' }, { i:(selIdx+11)%12, label:'IV' }, { i:(selIdx+1)%12, label:'V' }]
    : [{ i: selIdx, label:'III' }, { i:(selIdx+11)%12, label:'VI' }, { i:(selIdx+1)%12, label:'VII' }];

  const innerDots = sel === null ? [] : isMajorSel
    ? [{ i:selIdx, label:'vi' }, { i:(selIdx+1)%12, label:'iii' }, { i:(selIdx+11)%12, label:'ii' }, { i:(selIdx+2)%12, label:'vii°' }]
    : [{ i:selIdx, label:'i' }, { i:(selIdx+11)%12, label:'iv' }, { i:(selIdx+1)%12, label:'v' }, { i:(selIdx+2)%12, label:'ii°' }];

  const noPtr: React.CSSProperties = { pointerEvents:'none', userSelect:'none' };

  return (
    <div className="flex flex-col items-center gap-6 w-full">

      {/* SVG circle */}
      <svg viewBox="29 29 192 192" className="w-full" style={{ maxWidth: 440 }}
        aria-label="Interactive Circle of Fifths">

        <circle cx={CX} cy={CY} r={R_I_IN} fill="hsl(var(--card))" />
        <circle cx={CX} cy={CY} r={R_O_STROKE} stroke="hsl(var(--primary))"
          strokeWidth={R_O_SW} fill="none" />
        <circle cx={CX} cy={CY} r={R_I_STROKE} stroke="hsl(var(--primary))"
          strokeWidth={R_I_SW} strokeOpacity={0.3} fill="none" />

        {KEYS.map((_,i) => (
          <path key={`o${i}`} d={wedge(R_O_IN, R_O_OUT, keyAngle(i))}
            fill={outerFill(i)}
            style={{ cursor:'pointer', transition:'fill 0.15s' }}
            onClick={() => { stop(); setSel(s => s?.type==='major'&&s.idx===i ? null : {type:'major',idx:i}); }}
            onMouseEnter={() => setHover({type:'major',idx:i})}
            onMouseLeave={() => setHover(null)} />
        ))}
        {REL_MINORS.map((_,i) => (
          <path key={`r${i}`} d={wedge(R_I_IN, R_I_OUT, keyAngle(i))}
            fill={innerFill(i)}
            style={{ cursor:'pointer', transition:'fill 0.15s' }}
            onClick={() => { stop(); setSel(s => s?.type==='minor'&&s.idx===i ? null : {type:'minor',idx:i}); }}
            onMouseEnter={() => setHover({type:'minor',idx:i})}
            onMouseLeave={() => setHover(null)} />
        ))}

        {KEYS.map((key,i) => {
          const [lx,ly] = pt(R_O_STROKE, keyAngle(i));
          return (
            <text key={`ol${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="700" fill="#fff" style={noPtr}>{key}</text>
          );
        })}

        {REL_MINORS.map((key,i) => {
          const [lx,ly] = pt(R_I_STROKE, keyAngle(i));
          const active = sel !== null && [selIdx,(selIdx+1)%12,(selIdx+11)%12,(selIdx+2)%12].includes(i);
          return (
            <text key={`il${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fontSize="6.5" fontWeight="500"
              fill={active ? '#fff' : 'rgba(255,255,255,0.55)'}
              style={{ ...noPtr, transition:'fill 0.15s' }}>{key}</text>
          );
        })}

        {outerDots.map(({i,label}) => {
          const [x,y] = pt(R_O_OUT, keyAngle(i));
          return (
            <g key={`od${label}`} transform={`translate(${x},${y})`} style={noPtr}>
              <circle r="6" fill="#FFD36E" />
              <text textAnchor="middle" fill="#444" fontSize="5.5" fontWeight="700" y="2">{label}</text>
            </g>
          );
        })}
        {innerDots.map(({i,label}) => {
          const [x,y] = pt(R_I_IN, keyAngle(i));
          return (
            <g key={`id${label}`} transform={`translate(${x},${y})`} style={noPtr}>
              <circle r="5.5" fill="#FFD36E" />
              <text textAnchor="middle" fill="#444" fontSize="4.5" fontWeight="700" y="1.8">{label}</text>
            </g>
          );
        })}

        <g stroke="hsl(var(--background))" strokeWidth="1.5" transform="rotate(15 125 125)">
          {[0,30,60,90,120,150].map(d => (
            <line key={d} x1="125" y1="0" x2="125" y2="250" transform={`rotate(${d} 125 125)`} />
          ))}
        </g>

        <text x={CX} y={CY-5} textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5" fontWeight="600" fill="hsl(var(--muted-foreground))" style={noPtr}>Circle of</text>
        <text x={CX} y={CY+6} textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5" fontWeight="600" fill="hsl(var(--muted-foreground))" style={noPtr}>Fifths</text>
      </svg>

      {sel === null && (
        <p className="text-sm text-muted-foreground">
          Click an outer key (major) or inner ring (minor) ↑
        </p>
      )}

      {/* Visualization panel — shown during playback */}
      {isPlaying && (
        <div className="w-full max-w-lg rounded-xl border border-border bg-card/60 px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground text-center mb-3">
            Now playing
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {guitarVoicing && (
              <GuitarChordDiagram
                voicing={guitarVoicing}
                chordName={chordDisplayName}
                className="w-28 sm:w-32 flex-shrink-0"
              />
            )}
            <PianoKeyboard
              activeNotes={activeNotes}
              chordName={guitarVoicing ? undefined : chordDisplayName}
              className="w-full max-w-xs sm:max-w-sm"
            />
          </div>
        </div>
      )}

      {/* Info panel */}
      {sel !== null && diatonic && (
        <div className="w-full max-w-lg rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">{keyName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Relative {isMajorSel ? 'minor' : 'major'}:&nbsp;
                <span className="text-foreground font-medium">{relKey}</span>
                <span className="mx-1.5 opacity-40">·</span>
                Parallel {isMajorSel ? 'minor' : 'major'}:&nbsp;
                <span className="text-foreground font-medium">{parKey}</span>
              </p>
            </div>
            <button onClick={() => { stop(); setSel(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none px-1 mt-0.5"
              aria-label="Close">×</button>
          </div>

          {/* Degree table — column hover highlights the full degree */}
          <div className="overflow-x-auto">
            <div style={{ minWidth: 360 }}>
              {/* Key name header */}
              <div className="border-y border-border/60 bg-primary/8 px-4 py-2 text-center">
                <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                  Chords in&nbsp;
                </span>
                <span className="text-xs font-bold text-foreground">{keyName}</span>
              </div>

              {/* 7-column grid */}
              <div className="grid grid-cols-7 divide-x divide-border/40">

                {/* Roman numerals row */}
                {roman.map((r, j) => {
                  const isUpperCase = r[0] === r[0].toUpperCase() && r[0] !== r[0].toLowerCase();
                  return (
                    <div
                      key={`r${j}`}
                      className={`py-2.5 text-center font-bold border-b border-border/60 transition-colors ${
                        hoveredDeg === j ? 'bg-primary/10 text-primary' : 'text-foreground'
                      }`}
                      style={{ fontSize: isUpperCase ? 14 : 12, letterSpacing: '0.04em' }}
                      onMouseEnter={() => setHoveredDeg(j)}
                      onMouseLeave={() => setHoveredDeg(null)}
                    >
                      {r}
                    </div>
                  );
                })}

                {/* Function names row */}
                {funcs.map((fn, j) => (
                  <div
                    key={`f${j}`}
                    className={`py-2 px-0.5 text-center text-[10px] font-medium italic border-b border-border/60 leading-snug transition-colors ${
                      hoveredDeg === j ? 'bg-primary/10 text-primary/70' : 'text-muted-foreground bg-muted/20'
                    }`}
                    onMouseEnter={() => setHoveredDeg(j)}
                    onMouseLeave={() => setHoveredDeg(null)}
                  >
                    {fn}
                  </div>
                ))}

                {/* Chord names row */}
                {diatonic.map((chord, j) => (
                  <a
                    key={`c${j}`}
                    href={`/chord-player/?chords=${encodeURIComponent(toAsciiChord(chord))}`}
                    title={`Open ${chord} in editor`}
                    className={`py-3 text-center text-base font-bold font-mono transition-colors block ${
                      hoveredDeg === j ? 'bg-primary/10 text-primary' : 'text-foreground hover:text-primary'
                    }`}
                    onMouseEnter={() => setHoveredDeg(j)}
                    onMouseLeave={() => setHoveredDeg(null)}
                  >
                    {chord}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 pb-4 flex items-center gap-3 flex-wrap">
            <button onClick={playDiatonic}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isPlaying
                  ? 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}>
              {isPlaying
                ? <><Square className="w-3.5 h-3.5" />Stop</>
                : <><Play className="w-3.5 h-3.5" />Play all 7 chords</>
              }
            </button>
            <a
              href={`/chord-player/?chords=${encodeURIComponent(diatonic.map(toAsciiChord).join(' '))}`}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Open progression in editor →
            </a>
          </div>
        </div>
      )}

      <div className="flex items-center gap-5 text-xs text-muted-foreground flex-wrap justify-center">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-primary" />Outer: major keys
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{background:'hsl(var(--primary) / 0.3)'}} />Inner: relative minors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{background:'#FFD36E'}} />Scale degrees
        </span>
      </div>
    </div>
  );
}

// ─── Export wrapped in PlaybackProvider ───────────────────────────────────────
export function CircleOfFifths() {
  return (
    <PlaybackProvider>
      <CircleOfFifthsInner />
    </PlaybackProvider>
  );
}
