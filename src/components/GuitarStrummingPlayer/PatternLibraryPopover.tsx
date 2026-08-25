import { previewOf } from '@/lib/guitarStrum/strumPatterns';
import type { GridSize, PatternEntry, StrumMode } from '@/lib/guitarStrum/types';

interface Props {
  mode: StrumMode;
  steps: GridSize;
  library: PatternEntry[];
  currentId: string | null;
  patternName: string;
  onNameChange: (name: string) => void;
  onSelect: (entry: PatternEntry) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onSave: () => void;
  saveLabel: string;
}

const PRIMARY = 'hsl(262 83% 52%)';
const BORDER = 'hsl(220 13% 87%)';

export function PatternLibraryPopover({
  mode, steps, library, currentId, patternName, onNameChange, onSelect, onDelete, onNew, onSave, saveLabel,
}: Props) {
  const visible = library.filter(p => p.mode === mode && (p.custom || p.steps === steps));

  return (
    <div style={{
      position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, width: 320, maxHeight: '58vh',
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: '0 18px 50px hsl(224 30% 12% / 0.22)',
      display: 'flex', flexDirection: 'column', animation: 'cs-rise 140ms ease-out',
    }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(220 10% 42%)' }}>
          {mode === 'strum' ? 'Strum patterns' : 'Arpeggio patterns'}
        </span>
        <button
          type="button" onClick={onNew}
          style={{ marginLeft: 'auto', border: `1px solid ${BORDER}`, background: '#fff', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >New</button>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {visible.map(entry => (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button" onClick={() => onSelect(entry)}
              style={{
                flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${currentId === entry.id ? PRIMARY : 'transparent'}`,
                background: currentId === entry.id ? 'hsl(262 83% 97%)' : 'transparent',
                color: currentId === entry.id ? PRIMARY : 'hsl(220 20% 14%)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{entry.name}</span>
              <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 12, letterSpacing: '0.1em', opacity: 0.6 }}>{previewOf(entry)}</span>
            </button>
            {entry.custom && (
              <button
                type="button" onClick={() => onDelete(entry.id)} title="Delete"
                style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'hsl(220 13% 62%)', fontSize: 13, cursor: 'pointer' }}
              >×</button>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: '0 0 auto', display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid hsl(220 13% 90%)' }}>
        <input
          type="text" value={patternName} onChange={e => onNameChange(e.target.value)} placeholder="Pattern name"
          style={{ flex: '1 1 auto', minWidth: 0, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
        />
        <button
          type="button" onClick={onSave}
          style={{ flex: '0 0 auto', border: 'none', background: PRIMARY, color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >{saveLabel}</button>
      </div>
    </div>
  );
}
