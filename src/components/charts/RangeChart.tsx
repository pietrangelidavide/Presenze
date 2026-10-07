import { useRef } from 'react';
import { Tip, axisFor, labelStep, useActive, useWidth, type TipRow } from './kit';
import { clock, dur } from '../../lib/time';

export interface RangeDatum {
  key: string; label: string; short: string;
  inMin: number | null; outMin: number | null;
  color: string; muted?: boolean; rows?: TipRow[];
}

interface Props { data: RangeDatum[]; height?: number; ariaLabel: string }

const M = { l: 46, r: 10, t: 10, b: 26 };

/** Barre sospese tra ingresso e uscita: in alto le ore del mattino, in basso quelle della sera. */
export function RangeChart({ data, height = 260, ariaLabel }: Props) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const n = data.length;
  const a = useActive(n, rootRef);
  const width = Math.max(240, W || 320);
  const plotW = width - M.l - M.r;
  const plotH = height - M.t - M.b;

  const ins = data.map((d) => d.inMin).filter((v): v is number => v !== null);
  const outs = data.map((d) => d.outMin).filter((v): v is number => v !== null);
  const lo = ins.length ? Math.floor((Math.min(...ins) - 20) / 60) * 60 : 7 * 60;
  const hi = outs.length ? Math.ceil((Math.max(...outs) + 20) / 60) * 60 : 19 * 60;
  const ax = axisFor(lo, hi, [60, 120, 180], 6, false);
  const y = (v: number) => M.t + ((v - ax.min) / (ax.max - ax.min)) * plotH;
  const band = plotW / Math.max(1, n);
  const barW = Math.max(3, Math.min(26, band * 0.62));
  const every = labelStep(n, plotW, Math.max(...data.map((d) => d.short.length), 1));

  const tip = (() => {
    if (a.active === null) return null;
    const d = data[a.active];
    const rows: TipRow[] = [];
    if (d.inMin !== null) rows.push({ label: 'Ingresso', value: clock(d.inMin), color: d.color });
    if (d.outMin !== null) rows.push({ label: 'Uscita', value: clock(d.outMin), color: d.color });
    if (d.inMin !== null && d.outMin !== null) rows.push({ label: 'Presenza', value: dur(d.outMin - d.inMin) });
    if (d.rows) rows.push(...d.rows);
    return { x: M.l + band * a.active + band / 2, y: d.inMin !== null ? y(d.inMin) : M.t, title: d.label, rows };
  })();

  return (
    <div className="chartwrap" ref={wrapRef}>
      <div ref={rootRef} style={{ position: 'relative' }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-roledescription="grafico a barre sospese" tabIndex={0}
          aria-label={`${ariaLabel}. ${n} barre. Usa le frecce per scorrere, oppure apri la vista tabella.`}
          onKeyDown={a.onKeyDown} onBlur={a.onBlur} style={{ touchAction: 'pan-y' }}>
          {ax.ticks.map((t) => (
            <g key={t}><line className="grid" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} /><text x={M.l - 8} y={y(t) + 4} textAnchor="end">{clock(t)}</text></g>
          ))}
          {data.map((d, i) => {
            if (d.inMin === null || d.outMin === null) return null;
            const x = M.l + band * i + (band - barW) / 2;
            const top = y(d.inMin), h = Math.max(3, y(d.outMin) - top);
            return <rect key={d.key} x={x} y={top} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={d.color} opacity={d.muted ? 0.4 : 1} />;
          })}
          {data.map((d, i) => (i % every === 0 ? <text key={d.key} x={M.l + band * i + band / 2} y={height - 8} textAnchor="middle">{d.short}</text> : null))}
          {data.map((d, i) => (
            <rect key={d.key} className="hit" x={M.l + band * i} y={M.t} width={band} height={plotH} {...a.pointer(i)} style={a.active === i ? { fill: 'color-mix(in srgb, var(--text) 8%, transparent)' } : undefined} />
          ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </div>
  );
}
