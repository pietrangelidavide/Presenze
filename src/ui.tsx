import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Mode } from './lib/types';
import { initials } from './lib/profile';
import { MODE_LABEL } from './lib/types';

// ── icone (24×24, tratto) ──
const PATHS: Record<string, string> = {
  today: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.2 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M4 20V11M10 20V4M16 20v-7M22 20H2',
  permit: 'M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M5 9l7 7 7-7',
  x: 'M6 6l12 12M18 6L6 18',
  office: 'M4 21V5a1 1 0 011-1h8a1 1 0 011 1v16M14 9h5a1 1 0 011 1v11M3 21h18M8 8h2M8 12h2M8 16h2',
  smart: 'M3 11l9-8 9 8M5 9.5V20h14V9.5M10 20v-6h4v6',
  vacation: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  sick: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  holiday: 'M5 21V4M5 4h13l-2.5 4.5L18 13H5',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  alert: 'M12 4l9.5 16.5h-19zM12 10v4.5M12 17.6v.1',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  table: 'M3 5h18v14H3zM3 10h18M9 5v14',
  bars: 'M5 20v-7M12 20V5M19 20v-10',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.6v.1',
  play: 'M8 5l11 7-11 7z',
  stop: 'M7 7h10v10H7z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.2 2',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2',
  moon: 'M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z',
  auto: 'M12 3a9 9 0 100 18V3z',
  note: 'M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 11a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4z',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 20a7.5 7.5 0 0115 0',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z',
  video: 'M3.5 7h11v10h-11zM14.5 11l6-3.5v9l-6-3.5',
  team: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.4a3.5 3.5 0 010 6.7M18 14.3a6.5 6.5 0 013.5 5.7',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export const MODE_COLOR: Record<Mode, string> = {
  office: 'var(--v-ufficio)', smart: 'var(--v-smart)', vacation: 'var(--v-ferie)', sick: 'var(--v-malattia)', holiday: 'var(--v-festivo)',
};

export function ModeDot({ mode }: { mode: Mode }) {
  return <i className="mode-dot" style={{ background: MODE_COLOR[mode] }} />;
}

export function ModeChip({ mode, pressed, onClick }: { mode: Mode; pressed?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      <ModeDot mode={mode} />
      {MODE_LABEL[mode]}
    </button>
  );
}

// ── finestra a comparsa ──
const openSheets: object[] = [];

export function Sheet({ title, onClose, children, footer, labelledBy }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const me = {};
    openSheets.push(me);
    const prev = document.activeElement as HTMLElement | null;
    const body = document.body;
    const overflow = body.style.overflow;
    body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === me) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openSheets.splice(openSheets.indexOf(me), 1);
      body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? 'sheet-title'} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id={labelledBy ?? 'sheet-title'}>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Chiudi"><Icon name="x" /></button>
        </div>
        {children}
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="toggle">
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint ? <div className="muted" style={{ fontSize: 13 }}>{hint}</div> : null}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Il marchio di Presenze: lo stesso disegno dell'icona dell'app (public/icon.svg, generata da scripts/icons.mjs), così interfaccia e schermata Home restano d'accordo. */
export function BrandMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  // Ogni copia ha il suo gradiente: con un id solo, una copia nascosta (display:none) lo rende invisibile alle altre.
  const gid = `bm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={`brand-mark ${className}`} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4DA8FF" /><stop offset="1" stopColor="#0A5ED6" /></linearGradient></defs>
      <rect width="512" height="512" rx="112" fill={`url(#${gid})`} />
      <circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="40" />
      <circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeDasharray="622 830" transform="rotate(-90 256 256)" />
      <path d="M194 262l45 45 82-94" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Anello di avanzamento: da 0 a 1 (oltre 1 resta pieno). Il colore è quello del testo (`color`) e può essere cambiato dal CSS con `.ring.ok`. */
export function Ring({ value, label, tone, children }: { value: number; label: string; tone?: 'ok' | 'smart'; children?: ReactNode }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div className={`ring ${tone ?? ''}`} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="50" cy="50" r={R} fill="none" strokeWidth="11" />
        <circle className="ring-arc" cx="50" cy="50" r={R} fill="none" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(C * v).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 50 50)" style={{ opacity: v > 0 ? 1 : 0 }} />
      </svg>
      <div className="ring-in" aria-hidden="true">{children}</div>
    </div>
  );
}

/** Foto del profilo, rotonda. Senza foto mostra le iniziali. Da sola è decorativa: il nome va scritto accanto o nell'etichetta del pulsante. */
export function Avatar({ src, name, email, size = 40, className = '' }: { src: string | null | undefined; name?: string | null; email?: string | null; size?: number; className?: string }) {
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : initials(name, email)}
    </span>
  );
}
