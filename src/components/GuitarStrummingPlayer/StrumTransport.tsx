import type { CSSProperties } from 'react';
import type { GridSize, StrumMode } from '@/lib/guitarStrum/types';

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  countIn: boolean;
  onToggleCountIn: () => void;
  sustain: number;
  onSustainChange: (seconds: number) => void;
  mode: StrumMode;
  onModeChange: (mode: StrumMode) => void;
  steps: GridSize;
  onStepsChange: (steps: GridSize) => void;
}

const PRIMARY = 'hsl(262 83% 52%)';
const BORDER = 'hsl(220 13% 87%)';
const MUTED = 'hsl(220 10% 42%)';

function tabStyle(on: boolean): CSSProperties {
  return {
    border: 'none', borderRadius: 7, padding: '6px 13px', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? '#fff' : 'transparent', color: on ? PRIMARY : MUTED,
    boxShadow: on ? '0 1px 3px hsl(220 20% 10% / 0.12)' : 'none',
  };
}

const SUSTAIN_OPTIONS: [string, number][] = [['Short', 0.7], ['Medium', 1.3], ['Long', 2.2]];

export function StrumTransport({
  playing, onTogglePlay, bpm, onBpmChange, countIn, onToggleCountIn,
  sustain, onSustainChange, mode, onModeChange, steps, onStepsChange,
}: Props) {
  return (
    <header style={{
      flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px',
      padding: '10px 18px', background: '#fff', borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginRight: 'auto' }}>
        <span style={{ fontFamily: "'Lora', ui-serif, Georgia, serif", fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Strum &amp; Arpeggio</span>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>Guitar</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={onTogglePlay}
          title="Space"
          style={{
            width: 46, height: 46, flex: '0 0 auto', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingLeft: playing ? 0 : 3,
            background: playing ? 'hsl(224 26% 16%)' : PRIMARY, color: '#fff',
            boxShadow: `0 6px 18px ${playing ? 'hsl(224 26% 16% / 0.3)' : 'hsl(262 83% 52% / 0.32)'}`,
          }}
        >{playing ? '■' : '▶'}</button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 17, lineHeight: 1 }}>{bpm}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: MUTED }}>bpm</span>
          </div>
          <input
            type="range" min={40} max={220} step={1} value={bpm}
            onChange={e => onBpmChange(parseInt(e.target.value, 10))}
            aria-label="Tempo"
            style={{ width: 132, accentColor: PRIMARY, margin: 0 }}
          />
        </div>

        <button
          type="button" onClick={onToggleCountIn} title="4-beat count-in"
          style={{
            whiteSpace: 'nowrap', fontFamily: "'Space Mono', ui-monospace, monospace", borderRadius: 9,
            padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${countIn ? PRIMARY : BORDER}`,
            background: countIn ? 'hsl(262 83% 97%)' : '#fff',
            color: countIn ? PRIMARY : 'hsl(220 13% 62%)',
          }}
        >1·2·3·4</button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: MUTED }}>Sustain</span>
          <div style={{ display: 'flex', background: 'hsl(220 14% 92%)', borderRadius: 8, padding: 3, gap: 3 }}>
            {SUSTAIN_OPTIONS.map(([label, value]) => {
              const on = Math.abs(sustain - value) < 0.01;
              return (
                <button
                  key={label} type="button" onClick={() => onSustainChange(value)}
                  style={{
                    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    background: on ? '#fff' : 'transparent', color: on ? PRIMARY : MUTED,
                    boxShadow: on ? '0 1px 3px hsl(220 20% 10% / 0.12)' : 'none',
                  }}
                >{label}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', background: 'hsl(220 14% 92%)', borderRadius: 9, padding: 3, gap: 3 }}>
          <button type="button" onClick={() => onModeChange('strum')} style={tabStyle(mode === 'strum')}>Strum</button>
          <button type="button" onClick={() => onModeChange('arp')} style={tabStyle(mode === 'arp')}>Arpeggio</button>
        </div>
        <div style={{ display: 'flex', background: 'hsl(220 14% 92%)', borderRadius: 9, padding: 3, gap: 3 }}>
          <button type="button" onClick={() => onStepsChange(8)} title="Eighth notes" style={tabStyle(steps === 8)}>8</button>
          <button type="button" onClick={() => onStepsChange(16)} title="Sixteenth notes" style={tabStyle(steps === 16)}>16</button>
        </div>
      </div>
    </header>
  );
}
