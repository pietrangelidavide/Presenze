import { useEffect, useRef } from 'react';
import { Tip, useActive, useWidth, type TipRow } from './kit';
import { STATUS_LABEL, type HeatCell } from '../../lib/stats';
import { dayLong, dur, durSigned, MONTH_SHORT, parseYmd, WEEKDAY_SHORT } from '../../lib/time';
import { MODE_LABEL } from '../../lib/types';

const LEVELS = ['var(--h0)', 'var(--h1)', 'var(--h2)', 'var(--h3)', 'var(--h4)', 'var(--h5)'];
const DOT: Record<string, string> = { smart: 'var(--v-smart)', vacation: 'var(--v-ferie)', sick: 'var(--v-malattia)', holiday: 'var(--v-festivo)' };
const L = 30, T = 18;

export function heatDot(c: HeatCell): string | null {
  if (c.mode && DOT[c.mode]) return DOT[c.mode];
  if (c.status === 'holiday' && c.info.target > 0) return DOT.holiday;
  return null;
}

/** Calendario dell'anno: una colonna per settimana, il colore indica le ore nette fatte. */
export function Heatmap({ cells, today, ariaLabel }: { cells: HeatCell[]; today: string; ariaLabel: string }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [sizeRef, W] = useWidth<HTMLDivElement>();
  const a = useActive(cells.length, rootRef);
  const cols = (cells.length ? cells[cells.length - 1].col : 0) + 1;
  const pitch = Math.max(15, Math.min(26, Math.floor((W - L - 6) / cols)));
  const gap = pitch >= 20 ? 4 : 3;
  const cs = pitch - gap;
  const width = L + cols * pitch;
  const height = T + 7 * pitch;
  const px = (c: HeatCell) => L + c.col * pitch;
  const py = (c: HeatCell) => T + (c.wd - 1) * pitch;

  // porta in vista il periodo selezionato (o oggi)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focus = cells.find((c) => c.inPeriod && c.inYear) ?? cells.find((c) => c.day === today);
    if (!focus) return;
    el.scrollLeft = Math.max(0, px(focus) - el.clientWidth / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, pitch]);

  const months = cells.filter((c) => c.inYear && c.day.slice(8) === '01').map((c) => ({ col: c.col, t: MONTH_SHORT[parseYmd(c.day).getMonth()] }));

  const cell = a.active !== null ? cells[a.active] : null;
  const tip = (() => {
    if (!cell) return null;
    const i = cell.info;
    const rows: TipRow[] = [{ label: 'Stato', value: i.mode ? MODE_LABEL[i.mode] : i.holiday ?? STATUS_LABEL[i.status] }];
    if (cell.worked > 0) rows.push({ label: 'Ore nette', value: dur(cell.worked) });
    if (i.auto) rows.push({ label: 'Ore', value: 'Previste, in automatico' });
    if (i.entry?.clockIn) rows.push({ label: 'Orario', value: `${i.entry.clockIn}${i.entry.clockOut ? ` → ${i.entry.clockOut}` : ''}` });
    if (i.counted && (i.status === 'done' || i.status === 'incomplete')) rows.push({ label: 'Saldo', value: i.balance === 0 ? '0h' : durSigned(i.balance) });
    if (i.permitMin) rows.push({ label: 'Permessi', value: dur(i.permitMin) });
    return { x: px(cell) + cs / 2 - (scroller.current?.scrollLeft ?? 0), y: py(cell), title: dayLong(cell.day), rows };
  })();
  const viewW = scroller.current?.clientWidth ?? 320;

  return (
    <div ref={rootRef} className="chartwrap" style={{ position: 'relative' }}>
      <div ref={sizeRef} style={{ height: 0 }} />
      <div ref={scroller} style={{ overflowX: 'auto', paddingBottom: 4 }} onScroll={() => { if (a.active !== null) a.setActive(null); }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible', width, height, maxWidth: 'none' }}>
          {months.map((m) => <text key={m.col + m.t} x={L + m.col * pitch} y={11}>{m.t}</text>)}
          {[1, 3, 5].map((wd) => <text key={wd} x={L - 8} y={T + (wd - 1) * pitch + cs - 1.5} textAnchor="end">{WEEKDAY_SHORT[wd - 1]}</text>)}
          {cells.map((c, i) => {
            if (!c.inYear) return null;
            const dot = heatDot(c);
            const bad = c.status === 'missing' || c.status === 'incomplete';
            const empty = c.level === 0;
            return (
              <g key={c.day} opacity={c.inPeriod ? 1 : 0.38} {...a.pointer(i)}>
                <rect x={px(c)} y={py(c)} width={cs} height={cs} rx={Math.min(4, cs / 4)} fill={LEVELS[c.level]} stroke={bad ? 'var(--v-down)' : 'none'} strokeWidth={bad ? 1.6 : 0} opacity={empty && c.wd > 5 && !dot ? 0.55 : 1} />
                {dot ? <circle cx={px(c) + cs - cs / 4} cy={py(c) + cs / 4} r={Math.max(2.4, cs / 5)} fill={dot} stroke="var(--card)" strokeWidth={1} /> : null}
                {c.day === today ? <rect x={px(c) - 1.5} y={py(c) - 1.5} width={cs + 3} height={cs + 3} rx={4.5} fill="none" stroke="var(--text)" strokeWidth={1.5} /> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <Tip tip={tip} width={viewW} />
      <div className="clegend" style={{ marginTop: 10 }} aria-label="Legenda">
        <span style={{ gap: 4 }}>Meno ore
          {LEVELS.map((c, i) => <i key={i} style={{ background: c, width: 14, height: 14, borderRadius: 4, border: i === 0 ? '1px solid var(--v-grid)' : undefined }} />)}
          Più ore</span>
        <span><i className="dot" style={{ background: 'var(--v-smart)' }} /> Smart working</span>
        <span><i className="dot" style={{ background: 'var(--v-ferie)' }} /> Ferie</span>
        <span><i className="dot" style={{ background: 'var(--v-malattia)' }} /> Malattia</span>
        <span><i className="dot" style={{ background: 'var(--v-festivo)' }} /> Festività</span>
        <span><i style={{ background: 'transparent', border: '1.6px solid var(--v-down)', borderRadius: 4, width: 12, height: 12 }} /> Da sistemare</span>
      </div>
    </div>
  );
}
