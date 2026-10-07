import { useRef } from 'react';
import { COUNT_STEPS, MIN_STEPS, Tip, axisFor, axisHours, barPath, labelStep, useActive, useWidth, type TipRow } from './kit';

export interface BarSeries { key: string; name: string; color: string }

export interface BarDatum {
  key: string;
  label: string;               // titolo nella descrizione
  short: string;               // etichetta sull'asse
  values: number[];            // un valore per serie
  marker?: number | null;      // tacca "previste"
  muted?: boolean;             // periodo non ancora arrivato
  rows?: TipRow[];             // righe in più nella descrizione
}

interface Props {
  data: BarDatum[];
  series: BarSeries[];
  stacked?: boolean;
  height?: number;
  unit?: 'min' | 'count';
  format: (v: number) => string;            // valore nella descrizione
  axisFormat?: (v: number) => string;       // valore sull'asse
  signed?: { pos: string; neg: string };    // barre colorate in base al segno (una sola serie)
  refLine?: { value: number; label: string };   // linea di riferimento (es. limite smart working)
  markerName?: string;
  overFlag?: (d: BarDatum) => boolean;      // barre da evidenziare (es. oltre il limite)
  ariaLabel: string;
  zeroLabel?: string;
}

const M = { l: 46, r: 10, t: 10, b: 26 };

export function BarChart({ data, series, stacked, height = 230, unit = 'min', format, axisFormat, signed, refLine, markerName = 'Previste', overFlag, ariaLabel }: Props) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const n = data.length;
  const st = stacked ?? series.length > 1;
  const a = useActive(n, rootRef);

  const width = Math.max(240, W || 320);
  const plotW = width - M.l - M.r;
  const plotH = height - M.t - M.b;

  // dominio verticale
  const totals = data.map((d) => (st ? d.values.reduce((t, v) => t + Math.max(0, v), 0) : Math.max(0, ...d.values)));
  const negs = data.map((d) => Math.min(0, ...d.values));
  const maxV = Math.max(0, ...totals, ...data.map((d) => d.marker ?? 0), refLine?.value ?? 0);
  const minV = Math.min(0, ...negs);
  const ax = axisFor(minV, maxV, unit === 'min' ? MIN_STEPS : COUNT_STEPS, 5);
  const y = (v: number) => M.t + (1 - (v - ax.min) / (ax.max - ax.min)) * plotH;
  const y0 = y(0);

  const band = plotW / Math.max(1, n);
  const barW = Math.max(2, Math.min(34, band * 0.68));
  const every = labelStep(n, plotW, Math.max(...data.map((d) => d.short.length), 1));
  const fmtAxis = axisFormat ?? (unit === 'min' ? axisHours : (v: number) => String(v));

  const tipFor = (i: number) => {
    const d = data[i];
    const rows: TipRow[] = [];
    d.values.forEach((v, k) => {
      if (series.length === 1 || v !== 0) rows.push({ label: series[k].name, value: format(v), color: signed ? (v >= 0 ? signed.pos : signed.neg) : series[k].color });
    });
    if (d.marker !== undefined && d.marker !== null && d.marker > 0) rows.push({ label: markerName, value: format(d.marker) });
    if (st && series.length > 1) rows.push({ label: 'Totale', value: format(d.values.reduce((t, v) => t + v, 0)) });
    if (d.rows) rows.push(...d.rows);
    const top = Math.min(...d.values.map((v) => y(Math.max(0, v))), y0);
    return { x: M.l + band * i + band / 2, y: top, title: d.label, rows };
  };
  const tip = a.active !== null ? tipFor(a.active) : null;

  const desc = `${ariaLabel}. ${n} ${n === 1 ? 'barra' : 'barre'}. Usa le frecce per scorrere i valori, oppure apri la vista tabella.`;

  return (
    <div className="chartwrap" ref={wrapRef}>
      <div ref={rootRef} style={{ position: 'relative' }}>
        <svg
          width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-roledescription="grafico a barre" aria-label={desc}
          tabIndex={0} onKeyDown={a.onKeyDown} onBlur={a.onBlur} style={{ touchAction: 'pan-y' }}
        >
          {/* griglia e asse verticale */}
          {ax.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end">{fmtAxis(t)}</text>
            </g>
          ))}
          {refLine ? (
            <g>
              <line x1={M.l} x2={width - M.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--v-down)" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={width - M.r} y={y(refLine.value) - 5} textAnchor="end" style={{ fill: 'var(--v-ink2)' }}>{refLine.label}</text>
            </g>
          ) : null}

          {/* barre */}
          {data.map((d, i) => {
            const x = M.l + band * i + (band - barW) / 2;
            const nodes = [];
            if (signed) {
              const v = d.values[0] ?? 0;
              if (v !== 0) {
                const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
                nodes.push(<path key="s" d={barPath(x, top, barW, bot - top, 4, v > 0 ? 'top' : 'bottom')} fill={v > 0 ? signed.pos : signed.neg} />);
              }
            } else {
              let acc = 0;
              const last = d.values.reduce((l, v, k) => (v > 0 ? k : l), -1);
              d.values.forEach((v, k) => {
                if (v <= 0) return;
                const base = st ? acc : 0;
                const top = y(base + v), bot = y(base);
                const gap = st && base > 0 ? 2 : 0;
                nodes.push(<path key={k} d={barPath(x, top, barW, Math.max(1, bot - top - gap), 4, !st || k === last ? 'top' : 'none')} fill={series[k].color} />);
                acc += v;
              });
            }
            const over = overFlag?.(d);
            return (
              <g key={d.key} opacity={d.muted ? 0.4 : 1}>
                {nodes}
                {over ? <circle cx={x + barW / 2} cy={y(totals[i]) - 9} r={3.4} fill="var(--v-down)" /> : null}
                {d.marker !== undefined && d.marker !== null && d.marker > 0 ? (
                  <rect x={x - 4} y={y(d.marker) - 1.5} width={barW + 8} height={3} rx={1.5} fill="var(--v-ink2)" stroke="var(--card)" strokeWidth={1} />
                ) : null}
              </g>
            );
          })}

          {/* etichette dell'asse orizzontale */}
          {data.map((d, i) => (i % every === 0 ? <text key={d.key} x={M.l + band * i + band / 2} y={height - 8} textAnchor="middle">{d.short}</text> : null))}

          {/* aree sensibili */}
          {data.map((d, i) => (
            <rect key={d.key} className="hit" x={M.l + band * i} y={M.t} width={band} height={plotH} {...a.pointer(i)} style={a.active === i ? { fill: 'color-mix(in srgb, var(--text) 8%, transparent)' } : undefined} />
          ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </div>
  );
}
