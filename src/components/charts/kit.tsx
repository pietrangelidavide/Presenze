// Pezzi comuni dei grafici: misura, assi, descrizione al passaggio, scheda con vista "tabella".
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { dur } from '../../lib/time';
import { Icon } from '../../ui';

/** Larghezza di un elemento, aggiornata quando cambia. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── assi ──
export const MIN_STEPS = [10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 7200, 14400, 28800, 57600, 100000];
export const COUNT_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];

export interface Axis { min: number; max: number; step: number; ticks: number[] }

export function axisFor(min: number, max: number, steps: number[], maxTicks = 5, includeZero = true): Axis {
  let lo = includeZero ? Math.min(0, min) : min;
  let hi = includeZero ? Math.max(0, max) : max;
  if (hi - lo < steps[0]) hi = lo + steps[0];
  let step = steps[steps.length - 1];
  for (const s of steps) if ((hi - lo) / s <= maxTicks) { step = s; break; }
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min: lo, max: hi, step, ticks };
}

/** 120 → "2h", 90 → "1h30", −180 → "−3h", 0 → "0" */
export const axisHours = (v: number): string => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${dur(Math.abs(v))}`);
export const axisSigned = (v: number): string => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${dur(Math.abs(v))}`);

/** Etichette dell'asse x: ne mostra una ogni `k`, in modo che non si tocchino. */
export function labelStep(n: number, plotW: number, longest: number, min = 6.4): number {
  const need = longest * min + 10;
  return Math.max(1, Math.ceil(need / Math.max(1, plotW / Math.max(1, n))));
}

// ── descrizione al passaggio ──
export interface TipRow { label: string; value: string; color?: string }
export interface TipData { x: number; y: number; title: string; rows: TipRow[] }

export function Tip({ tip, width }: { tip: TipData | null; width: number }) {
  if (!tip) return null;
  const right = tip.x > width / 2;
  return (
    <div className="tip" role="status" style={{ top: Math.max(0, tip.y - 8), ...(right ? { right: Math.max(0, width - tip.x + 14) } : { left: tip.x + 14 }) }}>
      <b>{tip.title}</b>
      {tip.rows.map((r, i) => (
        <div className="tr" key={i}>
          <span>{r.color ? <i className="sw" style={{ background: r.color }} /> : null}{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Elemento attivo (passaggio del mouse, tocco o tastiera). Un solo punto di tabulazione per grafico. */
export function useActive(n: number, root: RefObject<HTMLElement | null>, opts: { step?: (shift: boolean) => number } = {}) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => { setActive((a) => (a !== null && a >= n ? null : a)); }, [n]);
  useEffect(() => {
    const h = (e: globalThis.PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setActive(null); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [root]);
  const pointer = useCallback((i: number) => ({
    onPointerEnter: () => setActive(i),
    onPointerDown: () => setActive(i),
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType !== 'touch') setActive((a) => (a === i ? null : a)); },
  }), []);
  const onKeyDown = (e: KeyboardEvent) => {
    const big = opts.step ? opts.step(e.shiftKey) : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(n - 1, (a ?? -1) + big)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? n) - big)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Escape') setActive(null);
  };
  return { active, setActive, pointer, onKeyDown, onBlur: () => setActive(null) };
}

// ── scheda del grafico ──
export interface TableData { head: string[]; rows: (string | number)[][] }

export interface LegendItem { label: string; color?: string; kind?: 'box' | 'tick' | 'dot' }

export function Legend({ items }: { items: LegendItem[] }) {
  if (!items.length) return null;
  return (
    <div className="clegend" aria-label="Legenda">
      {items.map((it) => (
        <span key={it.label}>
          <i className={it.kind === 'tick' ? 'tick' : it.kind === 'dot' ? 'dot' : ''} style={it.color && it.kind !== 'tick' ? { background: it.color } : undefined} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, legend, table, empty, children, className, id }: {
  title: string; subtitle?: string; legend?: LegendItem[]; table?: TableData; empty?: string; children: ReactNode; className?: string; id?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const tid = `${id ?? title}-t`.replace(/\s+/g, '-');
  return (
    <section className={`card chartcard ${className ?? ''}`} aria-labelledby={`${tid}-h`}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`${tid}-h`}>{title}</h2>
          {subtitle ? <p className="card-sub">{subtitle}</p> : null}
        </div>
        {table && !empty ? (
          <div className="seg" role="group" aria-label="Vista" style={{ flex: 'none' }}>
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')} aria-label="Mostra il grafico" title="Grafico"><Icon name="bars" size={16} /></button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} aria-label="Mostra la tabella" title="Tabella"><Icon name="table" size={16} /></button>
          </div>
        ) : null}
      </div>
      {empty ? (
        <div className="empty" style={{ padding: '22px 8px' }}><span>{empty}</span></div>
      ) : view === 'table' && table ? (
        <div className="tbl-wrap" tabIndex={0} aria-label={`${title}: tabella`}>
          <table className="tbl">
            <thead><tr>{table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row" style={{ fontWeight: 600, textAlign: 'left' }}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <>
          {legend ? <Legend items={legend} /> : null}
          {children}
        </>
      )}
    </section>
  );
}

export function barPath(x: number, y: number, w: number, h: number, r: number, end: 'top' | 'bottom' | 'both' | 'none'): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (h <= 0 || w <= 0) return '';
  const t = end === 'top' || end === 'both' ? rr : 0;
  const b = end === 'bottom' || end === 'both' ? rr : 0;
  return `M${x} ${y + t}${t ? `a${t} ${t} 0 0 1 ${t} ${-t}` : ''}h${w - 2 * t}${t ? `a${t} ${t} 0 0 1 ${t} ${t}` : ''}v${h - t - b}${b ? `a${b} ${b} 0 0 1 ${-b} ${b}` : ''}h${-(w - 2 * b)}${b ? `a${b} ${b} 0 0 1 ${-b} ${-b}` : ''}z`;
}
