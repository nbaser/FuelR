import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fmtPace, parsePace } from '../lib/zones';

export function Card({ title, icon, children, actions, className = '' }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2>
            {icon && <span className="card-icon">{icon}</span>}
            {title}
          </h2>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Unsichtbarer Rahmen, um einen Abschnitt per natives <fieldset disabled> komplett zu sperren (grau + inaktiv) */
export function Fieldset({ disabled, children, className = '' }: { disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <fieldset disabled={disabled} className={`bare-fieldset ${className}`}>
      {children}
    </fieldset>
  );
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const fmt = (v?: number) => (v == null || !isFinite(v) ? '' : String(v).replace('.', ','));

export function NumInput({
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  placeholder,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(fmt(value));
  const editing = useRef(false);
  useEffect(() => {
    // Beim Tippen darf das Feld leer bleiben, auch wenn die App intern schon einen Standardwert einsetzt
    if (editing.current && text.trim() === '') return;
    const parsed = Number(text.replace(',', '.'));
    if (text === '' ? value != null : parsed !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="num">
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '');
          setText(t);
          if (t.trim() === '') return onChange(undefined);
          const n = Number(t.replace(',', '.'));
          if (isFinite(n)) onChange(n);
        }}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          if (value == null) return setText('');
          let v = value;
          if (min != null) v = Math.max(min, v);
          if (max != null) v = Math.min(max, v);
          if (step >= 1) v = Math.round(v);
          if (v !== value) onChange(v);
          setText(fmt(v));
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function NumField(props: Parameters<typeof NumInput>[0] & { label: ReactNode; hint?: ReactNode }) {
  const { label, hint, ...rest } = props;
  return (
    <Field label={label} hint={hint}>
      <NumInput {...rest} />
    </Field>
  );
}

export function Stepper({ value, onChange, min = 0, max = 30, muted }: { value: number; onChange: (v: number) => void; min?: number; max?: number; muted?: boolean }) {
  return (
    <div className={`stepper ${muted ? 'muted-val' : ''}`}>
      <button type="button" aria-label="weniger" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="mehr" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/** Pace-Eingabe m:ss (Wert in Sekunden pro km) */
export function PaceInput({ value, onChange, placeholder = 'm:ss' }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState(value ? fmtPace(value) : '');
  useEffect(() => {
    if (parsePace(text) !== value) setText(value ? fmtPace(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="num">
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() ? parsePace(e.target.value) : undefined);
        }}
      />
      <span className="unit">/km</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <input id={id} type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'carb' | 'water' | 'salt' | 'energy' | 'warn' }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Kleine Inline-Icons (Stroke), damit keine Icon-Bibliothek nötig ist */
export const Icon = {
  bike: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="17" r="3.5" />
      <circle cx="18.5" cy="17" r="3.5" />
      <path d="M5.5 17 9 9h6l3.5 8M9 9 12 17h-1M14 6h2.5l-1.5 3" />
    </svg>
  ),
  run: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="14" cy="4.5" r="2" />
      <path d="M7 21l3-6 3 2v4M10 15l1.5-6 3.5 3h3M6 11l2.5-2.5h3" />
    </svg>
  ),
  drop: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 11v6M9 14l3 3 3-3" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  ),
  save: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v5h7V3M8 21v-7h8v7" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  ),
};
