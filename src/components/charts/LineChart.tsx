import { useRef } from 'react';
import { MIN_STEPS, Tip, axisFor, axisSigned, useActive, useWidth } from './kit';
import { MONTH_SHORT, parseYmd } from '../../lib/time';

export interface LinePoint { day: string; label: string; value: number }

interface Props {
  points: LinePoint[];
  start: number;                       // valore prima del primo punto
  height?: number;
  format: (v: number) => string;       // valore nella descrizione
  ariaLabel: string;
  seriesName: string;
}

const M = { l: 50, r: 16, t: 14, b: 26 };

export function LineChart({ points, start, height = 230, format, ariaLabel, seriesName }: Props) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const n = points.length;
  const a = useActive(n, rootRef, { step: (shift) => (shift ? 7 : 1) });
  const width = Math.max(240, W || 320);
  const plotW = width - M.l - M.r;
  const plotH = height - M.t - M.b;

  const vals = points.map((p) => p.value);
  const ax = axisFor(Math.min(start, ...vals), Math.max(start, ...vals), MIN_STEPS, 5);
  const y = (v: number) => M.t + (1 - (v - ax.min) / (ax.max - ax.min)) * plotH;
  const x = (i: number) => M.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = n ? `${path} L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z` : '';

  // etichette orizzontali: inizi di mese quando il periodo è lungo, altrimenti giorni
  const labels: { i: number; t: string }[] = [];
  if (n > 0) {
    if (n > 45) {
      let lastM = '';
      points.forEach((p, i) => { const m = p.day.slice(0, 7); if (m !== lastM) { lastM = m; labels.push({ i, t: MONTH_SHORT[parseYmd(p.day).getMonth()] }); } });
      const keep = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 44))));
      labels.splice(0, labels.length, ...labels.filter((_, k) => k % keep === 0));
    } else {
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 48))));
      points.forEach((p, i) => { if (i % every === 0) labels.push({ i, t: `${Number(p.day.slice(8))} ${MONTH_SHORT[parseYmd(p.day).getMonth()]}` }); });
    }
  }

  const act = a.active !== null ? points[a.active] : null;
  const tip = act && a.active !== null ? { x: x(a.active), y: y(act.value), title: act.label, rows: [{ label: seriesName, value: format(act.value), color: 'var(--v-gold)' }] } : null;
  const last = n ? points[n - 1] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (n - 1));
    a.setActive(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="chartwrap" ref={wrapRef}>
      <div ref={rootRef} style={{ position: 'relative' }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-roledescription="grafico a linea" tabIndex={0}
          aria-label={`${ariaLabel}. ${n} giorni. Usa le frecce per scorrere, Maiusc per saltare di una settimana, oppure apri la vista tabella.`}
          onKeyDown={a.onKeyDown} onBlur={a.onBlur} style={{ touchAction: 'pan-y' }}>
          {ax.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} style={t === 0 ? { strokeWidth: 1.5 } : undefined} />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end">{axisSigned(t)}</text>
            </g>
          ))}
          {n > 1 ? <path d={area} fill="var(--v-gold)" opacity={0.12} /> : null}
          {n > 1 ? <path d={path} fill="none" stroke="var(--v-gold)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {n === 1 ? <circle cx={x(0)} cy={y(points[0].value)} r={4} fill="var(--v-gold)" /> : null}
          {labels.map((l) => <text key={l.i} x={x(l.i)} y={height - 8} textAnchor={l.i === 0 ? 'start' : 'middle'}>{l.t}</text>)}
          {last && a.active === null ? (
            <g>
              <circle cx={x(n - 1)} cy={y(last.value)} r={4.5} fill="var(--v-gold)" stroke="var(--card)" strokeWidth={2} />
              <text x={x(n - 1)} y={y(last.value) - 10} textAnchor="end" style={{ fill: 'var(--text)', fontWeight: 650, fontSize: 12.5, stroke: 'var(--card)', strokeWidth: 4, paintOrder: 'stroke' }}>{format(last.value)}</text>
            </g>
          ) : null}
          {act && a.active !== null ? (
            <g pointerEvents="none">
              <line x1={x(a.active)} x2={x(a.active)} y1={M.t} y2={M.t + plotH} stroke="var(--v-ink2)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(a.active)} cy={y(act.value)} r={5} fill="var(--v-gold)" stroke="var(--card)" strokeWidth={2} />
            </g>
          ) : null}
          <rect className="hit" x={M.l} y={M.t} width={plotW} height={plotH} onPointerMove={onMove} onPointerDown={onMove}
            onPointerLeave={(e) => { if (e.pointerType !== 'touch') a.setActive(null); }} style={{ cursor: 'crosshair' }} />
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </div>
  );
}
