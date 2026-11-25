import { ChevronLeft } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { back } from '../router';
import { useUi } from '../store';

export function Header({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <div className="header">
      <button className="icon-btn" aria-label="Volver" onClick={onBack ?? back}>
        <ChevronLeft size={26} />
      </button>
      <h1>{title}</h1>
      {right}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  numeric,
  type = 'text',
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
  numeric?: boolean;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type={type}
          inputMode={numeric ? 'decimal' : undefined}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => numeric && e.target.select()}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

export function OptionCard({
  active,
  title,
  desc,
  onClick,
  icon,
}: {
  active: boolean;
  title: string;
  desc?: string;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button className={`option ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}>
      {icon && <span className="badge">{icon}</span>}
      <div className="grow">
        <strong>{title}</strong>
        {desc && <span>{desc}</span>}
      </div>
    </button>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 16 }}>
      <div className="spinner" />
      {label && <span className="muted small">{label}</span>}
    </div>
  );
}
