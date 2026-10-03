import type { ReactNode } from 'react';

/**
 * The pieces every settings group is made of — the app's settings_screen.dart: rows on one
 * card with a hairline between them, a name on the left and its control on the right.
 * Styles are .cp-set-* in chord-player.css.
 */

export const SettingsHead = ({ children }: { children: ReactNode }) => <div className="cp-set-head">{children}</div>;

export const SettingsGroup = ({ children }: { children: ReactNode }) => <div className="cp-set-group">{children}</div>;

export function SettingsRow({ title, children, dim, onClick }: {
  title: string;
  children?: ReactNode;
  dim?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="cp-set-title" style={dim ? { opacity: 0.4 } : undefined}>{title}</span>
      {children}
    </>
  );
  return onClick
    ? <button type="button" className="cp-set-row" onClick={onClick}>{body}</button>
    : <div className="cp-set-row">{body}</div>;
}

/** Two or three short choices side by side, the chosen one lifted out of the track. */
export function Segments<T extends string | number>({ label, values, selected, labelOf, onSelect, large, disabled }: {
  label: string;
  values: readonly T[];
  selected: T;
  labelOf: (value: T) => string;
  onSelect: (value: T) => void;
  /** Signs (♯, ♭) are set larger than words, so they read at the same weight. */
  large?: (value: T) => boolean;
  disabled?: boolean;
}) {
  return (
    <div className="cp-seg" role="group" aria-label={label} style={disabled ? { opacity: 0.4 } : undefined}>
      {values.map((value) => {
        const on = value === selected && !disabled;
        return (
          <button
            key={String(value)}
            type="button"
            className={`${on ? 'cp-on' : ''} ${large?.(value) ? 'cp-sign' : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => { if (value !== selected) onSelect(value); }}
          >
            {labelOf(value)}
          </button>
        );
      })}
    </div>
  );
}

export function SwitchControl({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      className={`cp-sw ${on ? 'cp-on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}
