import type { CSSProperties } from 'react';
import type { ArpPatternData, GridSize, StrumMode, StrumPatternData } from '@/lib/guitarStrum/types';
import { STRING_LABELS } from '@/lib/guitarStrum/strumTheory';

interface Props {
  mode: StrumMode;
  steps: GridSize;
  strumPattern: StrumPatternData;
  arpPattern: ArpPatternData;
  activeStep: number;
  mutedStrings: boolean[];
  onCycleStep: (index: number) => void;
  onToggleArpCell: (stringIndex: number, step: number) => void;
  patternLabel: string;
  patternPopoverOpen: boolean;
  onTogglePatternPopover: () => void;
  assigned: boolean;
  assignDisabled: boolean;
  assignLabel: string;
  onAssignToggle: () => void;
  dirty: boolean;
  onSavePattern: () => void;
  onClearPattern: () => void;
}

const PRIMARY = 'hsl(262 83% 52%)';
const BORDER = 'hsl(220 13% 87%)';
const MUTED = 'hsl(220 10% 42%)';
const GLYPHS = ['·', '↓', '↑', '✕'];
const BEATS_8 = ['1', '&', '2', '&', '3', '&', '4', '&'];
const BEATS_16 = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];

export function StrumPatternGrid({
  mode, steps, strumPattern, arpPattern, activeStep, mutedStrings,
  onCycleStep, onToggleArpCell,
  patternLabel, patternPopoverOpen, onTogglePatternPopover,
  assigned, assignDisabled, assignLabel, onAssignToggle,
  dirty, onSavePattern, onClearPattern,
}: Props) {
  const isStrum = mode === 'strum';
  const beats = steps === 8 ? BEATS_8 : BEATS_16;
  const cellH = isStrum ? 46 : 22;
  const perBracket = steps / 4;

  const beatRowStyle: CSSProperties = {
    display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 5,
    marginLeft: isStrum ? 0 : 21,
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
          {isStrum ? 'Strum' : 'Arpeggio'}
        </span>
        <button
          type="button" onClick={onTogglePatternPopover}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 38, padding: '0 12px',
            borderRadius: 9, cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${patternPopoverOpen ? PRIMARY : BORDER}`,
            background: patternPopoverOpen ? 'hsl(262 83% 97%)' : '#fff',
            color: patternPopoverOpen ? PRIMARY : 'hsl(220 20% 12%)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>{patternLabel}</span>
          <span style={{ fontSize: 12, lineHeight: 1, opacity: 0.5 }}>▾</span>
        </button>
        <div style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button" onClick={onAssignToggle} disabled={assignDisabled}
            style={{
              whiteSpace: 'nowrap', height: 36, padding: '0 13px', borderRadius: 9, fontSize: 12, fontWeight: 600,
              cursor: assignDisabled ? 'not-allowed' : 'pointer',
              border: `1px solid ${assigned ? PRIMARY : BORDER}`,
              background: assigned ? 'hsl(262 83% 97%)' : '#fff',
              color: assignDisabled ? 'hsl(220 13% 72%)' : assigned ? PRIMARY : 'hsl(220 20% 20%)',
            }}
          >{assignLabel}</button>
          <button
            type="button" onClick={onSavePattern} title="Save pattern"
            style={{
              width: 36, height: 36, borderRadius: 9, cursor: 'pointer', fontSize: 14,
              border: `1px solid ${dirty ? PRIMARY : BORDER}`,
              background: dirty ? PRIMARY : '#fff', color: dirty ? '#fff' : MUTED,
            }}
          >↓</button>
          <button
            type="button" onClick={onClearPattern} title="Clear the grid"
            style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${BORDER}`, background: '#fff', color: MUTED, fontSize: 15, cursor: 'pointer' }}
          >⌫</button>
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 132, overflowY: 'auto', display: 'flex', gap: 12 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isStrum ? (
            <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 5 }}>
              {strumPattern.map((value, i) => {
                const active = activeStep === i;
                return (
                  <button
                    key={i} type="button" onClick={() => onCycleStep(i)} title="Click: ↓ → ↑ → ✕ → silence"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: cellH,
                      borderRadius: 9, cursor: 'pointer', fontSize: 20, fontWeight: 700, transition: 'background 90ms, border-color 90ms',
                      border: `1px solid ${active ? PRIMARY : value ? 'hsl(262 60% 84%)' : BORDER}`,
                      background: active ? PRIMARY : value ? 'hsl(262 83% 97%)' : /^[1-4]$/.test(beats[i]) ? 'hsl(220 20% 97%)' : '#fff',
                      color: active ? '#fff' : value ? PRIMARY : 'hsl(220 13% 72%)',
                    }}
                  >{GLYPHS[value]}</button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Rows run high e (top) to low E (bottom) on screen — standard tab reading
                  order — while arpPattern itself stays indexed low-E-first to match
                  GuitarVoicing.frets; only the display order is reversed here. */}
              {[5, 4, 3, 2, 1, 0].map(stringIndex => {
                const row = arpPattern[stringIndex];
                return (
                <div key={stringIndex} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 14, flex: '0 0 auto', fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: 'hsl(220 10% 48%)' }}>
                    {STRING_LABELS[stringIndex]}
                  </span>
                  <div style={{ flex: '1 1 auto', display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 5 }}>
                    {row.map((on, step) => {
                      const active = activeStep === step;
                      const mute = mutedStrings[stringIndex];
                      return (
                        <button
                          key={step} type="button" onClick={() => onToggleArpCell(stringIndex, step)}
                          style={{
                            minWidth: 0, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                            border: `1px solid ${active ? PRIMARY : BORDER}`,
                            background: on ? (mute ? 'hsl(220 13% 82%)' : active ? PRIMARY : 'hsl(262 83% 64%)') : active ? 'hsl(262 83% 97%)' : '#fff',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <div style={beatRowStyle}>
            {beats.map((label, i) => {
              const active = activeStep === i;
              const strong = /^[1-4]$/.test(label);
              return (
                <span key={i} style={{
                  textAlign: 'center', fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 11,
                  fontWeight: strong ? 700 : 400,
                  color: active ? PRIMARY : strong ? 'hsl(220 20% 30%)' : 'hsl(220 10% 58%)',
                }}>{label}</span>
              );
            })}
          </div>
          <div style={beatRowStyle}>
            {[0, 1, 2, 3].map(k => (
              <span key={k} style={{
                gridColumn: `span ${perBracket}`, height: 5, margin: '1px 26%',
                border: `1px solid ${activeStep >= 0 && Math.floor(activeStep / perBracket) === k ? 'hsl(262 60% 74%)' : 'hsl(220 13% 84%)'}`,
                borderTop: 'none', borderRadius: '0 0 4px 4px',
              }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
