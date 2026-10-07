// Tutti i grafici della dashboard, costruiti a partire dai calcoli di lib/stats.
import { useMemo } from 'react';
import { BarChart, type BarDatum } from '../components/charts/BarChart';
import { HBars } from '../components/charts/HBars';
import { Heatmap, heatDot } from '../components/charts/Heatmap';
import { LineChart } from '../components/charts/LineChart';
import { RangeChart, type RangeDatum } from '../components/charts/RangeChart';
import { ChartCard, type TableData } from '../components/charts/kit';
import {
  buckets, cumulativeSeries, distributions, grainFor, heatmapYear, permitStats, smartWeeks, weekdayStats,
  STATUS_LABEL, type Bin, type Period, type Timeline,
} from '../lib/stats';
import { capFirst, clock, dayLong, dayMonth, diffDays, dur, durSigned, MONTH_LONG } from '../lib/time';
import { MODE_LABEL, REASON_LABEL } from '../lib/types';

const GOLD = 'var(--v-brand)';
const C = { office: 'var(--v-ufficio)', smart: 'var(--v-smart)', vacation: 'var(--v-ferie)', sick: 'var(--v-malattia)' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const signed = (v: number) => (v === 0 ? '0h' : durSigned(v));
const NONE = 'Nessun dato in questo periodo.';

export function DashboardCharts({ tl, period }: { tl: Timeline; period: Period }) {
  const { ctx } = tl;
  const grain = grainFor(period);
  const grainName = grain === 'day' ? 'giorno' : grain === 'week' ? 'settimana' : 'mese';
  const bks = useMemo(() => buckets(tl, period), [tl, period]);
  const cum = useMemo(() => cumulativeSeries(tl, period), [tl, period]);
  const wd = useMemo(() => weekdayStats(tl, period), [tl, period]);
  const dist = useMemo(() => distributions(tl, period), [tl, period]);
  const sw = useMemo(() => smartWeeks(ctx, period, tl.today), [ctx, period, tl.today]);
  const ps = useMemo(() => permitStats(ctx, period), [ctx, period]);
  const year = Number(period.to.slice(0, 4));
  const heat = useMemo(() => heatmapYear(tl, year, period), [tl, year, period]);
  const hasData = bks.some((b) => b.worked > 0);
  const limit = ctx.settings.smartPerWeek;

  // ── ore lavorate e previste ──
  const hoursData: BarDatum[] = bks.map((b) => {
    const rows = [];
    if (b.grain === 'day') {
      const d = tl.get(b.from);
      if (d.mode) rows.push({ label: 'Tipo', value: MODE_LABEL[d.mode] });
      else if (d.holiday) rows.push({ label: 'Festività', value: d.holiday });
      if (d.auto) rows.push({ label: 'Ore', value: 'Previste, in automatico' });
      if (d.entry?.clockIn) rows.push({ label: 'Orario', value: `${d.entry.clockIn}${d.entry.clockOut ? `–${d.entry.clockOut}` : ''}` });
      if (d.permitMin) rows.push({ label: 'Permessi', value: dur(d.permitMin) });
      if (d.status === 'missing' || d.status === 'incomplete') rows.push({ label: 'Stato', value: STATUS_LABEL[d.status] });
    } else {
      rows.push({ label: 'Giornate complete', value: String(b.daysDone) });
      if (b.expected) rows.push({ label: 'Saldo', value: signed(b.balance) });
    }
    return { key: b.key, label: b.label, short: b.short, values: [b.worked], marker: b.plan, muted: b.future, rows };
  });
  const hoursTable: TableData = {
    head: [capFirst(grainName), 'Ore nette', 'Previste', 'Saldo'],
    rows: bks.map((b) => [b.label, dur(b.worked), dur(b.plan), b.expected || b.worked ? signed(b.balance) : '–']),
  };

  const balData: BarDatum[] = bks.map((b) => ({
    key: b.key, label: b.label, short: b.short, values: [b.balance], muted: b.future,
    rows: [{ label: 'Fatte', value: dur(b.worked) }, { label: 'Previste', value: dur(b.expected) }],
  }));

  const cumTable: TableData = {
    head: ['Giorno', 'Banca ore'],
    rows: cum.points.filter((p, i, a) => i === 0 || i === a.length - 1 || p.value !== a[i - 1].value).map((p) => [dayLong(p.day), signed(p.value)]),
  };

  // ── orari ──
  const rangeData: RangeDatum[] = bks.map((b) => {
    if (b.grain === 'day') {
      const d = tl.get(b.from);
      const ok = d.status === 'done' && d.counted;
      return { key: b.key, label: b.label, short: b.short, inMin: ok ? d.inMin : null, outMin: ok ? d.outMin : null, color: d.mode === 'smart' ? C.smart : C.office, rows: d.mode ? [{ label: 'Tipo', value: MODE_LABEL[d.mode] }, ...(ok ? [{ label: 'Pausa', value: `${d.breakMin}′` }] : [])] : [] };
    }
    return { key: b.key, label: b.label, short: b.short, inMin: b.avgIn, outMin: b.avgOut, color: GOLD, muted: b.future, rows: [{ label: 'Giornate complete', value: String(b.daysDone) }] };
  });
  const rangeHas = rangeData.some((d) => d.inMin !== null);
  const rangeTable: TableData = {
    head: [capFirst(grainName), grain === 'day' ? 'Ingresso' : 'Ingresso medio', grain === 'day' ? 'Uscita' : 'Uscita media'],
    rows: rangeData.filter((d) => d.inMin !== null).map((d) => [d.label, clock(d.inMin as number), clock(d.outMin as number)]),
  };

  const histo = (bins: Bin[], fmtFrom: (m: number) => string, fmtRange: (a: number, b: number) => string): BarDatum[] =>
    bins.map((b) => ({ key: String(b.from), label: fmtRange(b.from, b.to), short: fmtFrom(b.from), values: [b.count] }));
  const histoTable = (bins: Bin[], fmtRange: (a: number, b: number) => string, head: string): TableData => ({
    head: [head, 'Giornate'], rows: bins.map((b) => [fmtRange(b.from, b.to), b.count]),
  });
  const range = (a: number, b: number) => `${clock(a)}–${clock(Math.min(1439, b - 1))}`;
  const durRange = (a: number, b: number) => `${dur(a)}–${dur(b)}`;
  const count = (v: number) => plural(v, 'giornata', 'giornate');

  // ── giorni della settimana ──
  const wdShown = wd.filter((w) => w.target > 0 || w.days > 0 || w.office + w.smart > 0);
  const wdData: BarDatum[] = wdShown.map((w) => ({
    key: String(w.wd), label: w.long, short: w.label, values: [w.avgWorked ?? 0], marker: w.target || null,
    rows: [{ label: 'Giornate complete', value: String(w.days) }, ...(w.avgIn !== null && w.avgOut !== null ? [{ label: 'Orario medio', value: `${clock(w.avgIn)}–${clock(w.avgOut)}` }] : [])],
  }));
  const placeData: BarDatum[] = wdShown.map((w) => ({ key: String(w.wd), label: w.long, short: w.label, values: [w.office, w.smart, w.vacation, w.sick] }));
  const placeSeries = [
    { key: 'office', name: 'In sede', color: C.office }, { key: 'smart', name: 'Smart working', color: C.smart },
    { key: 'vacation', name: 'Ferie', color: C.vacation }, { key: 'sick', name: 'Malattia', color: C.sick },
  ];
  const placeHas = placeData.some((d) => d.values.some((v) => v > 0));

  // ── smart working ──
  const smartData: BarDatum[] = sw.map((w) => ({
    key: w.key, label: `Settimana ${w.key.slice(-2)} · ${dayMonth(w.start)} – ${dayMonth(w.end)}`, short: dayMonth(w.start), values: [w.count], muted: w.future,
    rows: w.over ? [{ label: 'Limite', value: `superato di ${w.count - w.limit}` }] : [],
  }));
  const smartHas = sw.some((w) => w.count > 0);
  const placeBuckets: BarDatum[] = bks.map((b) => ({ key: b.key, label: b.label, short: b.short, values: [b.office, b.smart], muted: b.future }));
  const absData: BarDatum[] = bks.map((b) => ({ key: b.key, label: b.label, short: b.short, values: [b.vacation, b.sick], muted: b.future }));
  const permData: BarDatum[] = bks.map((b) => ({ key: b.key, label: b.label, short: b.short, values: [b.permitMin], muted: b.future }));

  // ── tabelle della mappa ──
  const heatTable: TableData = {
    head: ['Mese', 'Giornate', 'Ore nette', 'Smart', 'Ferie', 'Malattia'],
    rows: MONTH_LONG.map((m, i) => {
      const cs = heat.filter((c) => c.inYear && Number(c.day.slice(5, 7)) === i + 1);
      const done = cs.filter((c) => c.worked > 0);
      return [capFirst(m), done.length, dur(done.reduce((t, c) => t + c.worked, 0)), cs.filter((c) => heatDot(c) === 'var(--v-smart)' && c.worked > 0).length, cs.filter((c) => c.status === 'vacation').length, cs.filter((c) => c.status === 'sick').length];
    }),
  };

  const daysLabel = diffDays(period.from, period.to) + 1;

  return (
    <>
      <h2 className="section-title">Ore</h2>
      <ChartCard
        title="Ore lavorate" subtitle={`Ore nette per ${grainName}. La tacca è l’orario previsto.`} id="ore"
        legend={[{ label: 'Ore nette', color: GOLD }, { label: 'Previste', kind: 'tick' }]} table={hoursTable} empty={hasData || bks.some((b) => b.plan > 0) ? undefined : NONE}
      >
        <BarChart data={hoursData} series={[{ key: 'w', name: 'Ore nette', color: GOLD }]} format={dur} ariaLabel={`Ore nette per ${grainName}, ${daysLabel} giorni`} />
      </ChartCard>

      <div className="grid2">
        <ChartCard
          title="Saldo per periodo" subtitle={`Ore in più o in meno rispetto all’orario, per ${grainName}.`} id="saldo"
          legend={[{ label: 'In più', color: 'var(--v-up)' }, { label: 'In meno', color: 'var(--v-down)' }]}
          table={{ head: [capFirst(grainName), 'Saldo'], rows: bks.map((b) => [b.label, signed(b.balance)]) }} empty={hasData ? undefined : NONE}
        >
          <BarChart data={balData} series={[{ key: 'b', name: 'Saldo', color: 'var(--v-up)' }]} signed={{ pos: 'var(--v-up)', neg: 'var(--v-down)' }} format={signed} axisFormat={undefined} ariaLabel={`Saldo ore per ${grainName}`} height={220} />
        </ChartCard>
        <ChartCard title="Banca ore nel tempo" subtitle="Saldo accumulato giorno per giorno, compreso il saldo di partenza." id="banca" table={cumTable} empty={cum.points.length ? undefined : NONE}>
          <LineChart points={cum.points.map((p) => ({ day: p.day, label: dayLong(p.day), value: p.value }))} start={cum.start} format={signed} seriesName="Banca ore" ariaLabel="Banca ore accumulata nel tempo" height={220} />
        </ChartCard>
      </div>

      <h2 className="section-title">Anno a colpo d’occhio</h2>
      <ChartCard title={`Mappa del ${year}`} subtitle="Una casella per giorno: più il colore è intenso, più ore nette. Il periodo scelto è in evidenza." id="mappa" table={heatTable}>
        <Heatmap cells={heat} today={tl.today} ariaLabel={`Calendario del ${year} con le ore nette di ogni giorno. La vista tabella riassume i mesi.`} />
      </ChartCard>

      <h2 className="section-title">Orari</h2>
      <ChartCard
        title="Ingresso e uscita" id="orari"
        subtitle={grain === 'day' ? 'Per ogni giornata completa, dall’ingresso all’uscita.' : `Orario medio di ingresso e uscita per ${grainName}.`}
        legend={grain === 'day' ? [{ label: 'In sede', color: C.office }, { label: 'Smart working', color: C.smart }] : [{ label: 'Dall’ingresso all’uscita', color: GOLD }]}
        table={rangeTable} empty={rangeHas ? undefined : NONE}
      >
        <RangeChart data={rangeData} ariaLabel={`Orario di ingresso e uscita per ${grainName}`} />
      </ChartCard>
      <div className="grid3">
        <ChartCard title="A che ora entri" subtitle="Giornate per fascia di 15 minuti." id="h-in" table={histoTable(dist.clockIn.bins, range, 'Fascia')} empty={dist.clockIn.bins.length ? undefined : NONE}>
          <BarChart data={histo(dist.clockIn.bins, (m) => clock(m).replace(/^0/, ''), range)} series={[{ key: 'n', name: 'Giornate', color: GOLD }]} unit="count" format={count} height={200} ariaLabel="Distribuzione degli orari di ingresso" />
        </ChartCard>
        <ChartCard title="A che ora esci" subtitle="Giornate per fascia di 15 minuti." id="h-out" table={histoTable(dist.clockOut.bins, range, 'Fascia')} empty={dist.clockOut.bins.length ? undefined : NONE}>
          <BarChart data={histo(dist.clockOut.bins, (m) => clock(m).replace(/^0/, ''), range)} series={[{ key: 'n', name: 'Giornate', color: GOLD }]} unit="count" format={count} height={200} ariaLabel="Distribuzione degli orari di uscita" />
        </ChartCard>
        <ChartCard title="Quanto lavori al giorno" subtitle="Ore nette, a gruppi di mezz’ora." id="h-net" table={histoTable(dist.worked.bins, durRange, 'Ore nette')} empty={dist.worked.bins.length ? undefined : NONE}>
          <BarChart data={histo(dist.worked.bins, (m) => dur(m), durRange)} series={[{ key: 'n', name: 'Giornate', color: GOLD }]} unit="count" format={count} height={200} ariaLabel="Distribuzione delle ore nette per giornata" />
        </ChartCard>
      </div>
      {dist.breaks.length ? (
        <ChartCard title="Pausa pranzo" subtitle="Quante giornate per durata della pausa." id="pausa" table={{ head: ['Pausa', 'Giornate'], rows: dist.breaks.map((b) => [b.value ? `${b.value}′` : 'Nessuna', b.count]) }}>
          <HBars ariaLabel="Giornate per durata della pausa pranzo" items={dist.breaks.map((b) => ({ key: String(b.value), label: b.value ? `${b.value} minuti` : 'Nessuna pausa', value: b.count, text: plural(b.count, 'giornata', 'giornate') }))} />
        </ChartCard>
      ) : null}

      <h2 className="section-title">Settimana tipo</h2>
      <div className="grid2">
        <ChartCard
          title="Ore medie per giorno della settimana" subtitle="Media delle ore nette. La tacca è l’orario previsto." id="wd"
          legend={[{ label: 'Media ore nette', color: GOLD }, { label: 'Previste', kind: 'tick' }]}
          table={{ head: ['Giorno', 'Giornate', 'Media ore nette', 'Previste', 'Ingresso medio', 'Uscita media'], rows: wdShown.map((w) => [w.long, w.days, w.avgWorked === null ? '–' : dur(w.avgWorked), dur(w.target), w.avgIn === null ? '–' : clock(w.avgIn), w.avgOut === null ? '–' : clock(w.avgOut)]) }}
          empty={wd.some((w) => w.days > 0) ? undefined : NONE}
        >
          <BarChart data={wdData} series={[{ key: 'a', name: 'Media ore nette', color: GOLD }]} format={dur} ariaLabel="Ore medie nette per giorno della settimana" height={220} />
        </ChartCard>
        <ChartCard
          title="Dove lavori" subtitle="Giorni in sede, smart working, ferie e malattia per giorno della settimana." id="place"
          legend={placeSeries.map((s) => ({ label: s.name, color: s.color }))}
          table={{ head: ['Giorno', 'In sede', 'Smart working', 'Ferie', 'Malattia'], rows: wdShown.map((w) => [w.long, w.office, w.smart, w.vacation, w.sick]) }} empty={placeHas ? undefined : NONE}
        >
          <BarChart data={placeData} series={placeSeries} stacked unit="count" format={(v) => plural(v, 'giorno', 'giorni')} height={220} ariaLabel="Giorni in sede, smart working, ferie e malattia per giorno della settimana" />
        </ChartCard>
      </div>

      <h2 className="section-title">Smart working</h2>
      <div className="grid2">
        <ChartCard
          title="Smart working per settimana" subtitle={`Giorni segnati in ogni settimana. Limite: ${limit}.`} id="smart"
          legend={[{ label: 'Giorni di smart working', color: C.smart }, { label: `Limite (${limit})`, kind: 'tick' }, { label: 'Oltre il limite', color: 'var(--v-down)', kind: 'dot' }]}
          table={{ head: ['Settimana', 'Giorni', 'Limite', 'Esito'], rows: sw.map((w) => [`${w.key.slice(-2)} · ${dayMonth(w.start)}`, w.count, w.limit, w.over ? 'Oltre il limite' : 'Nel limite']) }} empty={smartHas ? undefined : 'Nessun giorno di smart working in questo periodo.'}
        >
          <BarChart data={smartData} series={[{ key: 's', name: 'Smart working', color: C.smart }]} unit="count" format={(v) => plural(v, 'giorno', 'giorni')} refLine={{ value: limit, label: `Limite ${limit}` }} overFlag={(d) => d.values[0] > limit} height={220} ariaLabel="Giorni di smart working per settimana, con il limite" />
        </ChartCard>
        <ChartCard
          title="In sede e smart working" subtitle={`Giorni di lavoro per ${grainName}.`} id="sede-smart"
          legend={[{ label: 'In sede', color: C.office }, { label: 'Smart working', color: C.smart }]}
          table={{ head: [capFirst(grainName), 'In sede', 'Smart working'], rows: bks.map((b) => [b.label, b.office, b.smart]) }} empty={bks.some((b) => b.office + b.smart > 0) ? undefined : NONE}
        >
          <BarChart data={placeBuckets} series={[{ key: 'o', name: 'In sede', color: C.office }, { key: 's', name: 'Smart working', color: C.smart }]} stacked unit="count" format={(v) => plural(v, 'giorno', 'giorni')} height={220} ariaLabel={`Giorni in sede e in smart working per ${grainName}`} />
        </ChartCard>
      </div>

      <h2 className="section-title">Permessi e assenze</h2>
      <div className="grid2">
        <ChartCard
          title="Permessi" subtitle={`Ore di permesso per ${grainName}.`} id="perm"
          table={{ head: [capFirst(grainName), 'Ore di permesso'], rows: bks.map((b) => [b.label, b.permitMin ? dur(b.permitMin) : '–']) }} empty={ps.count ? undefined : 'Nessun permesso in questo periodo.'}
          legend={[{ label: 'Ore di permesso', color: GOLD }]}
        >
          <BarChart data={permData} series={[{ key: 'p', name: 'Permessi', color: GOLD }]} format={dur} height={220} ariaLabel={`Ore di permesso per ${grainName}`} />
        </ChartCard>
        <ChartCard
          title="Permessi per motivo" subtitle="Ore totali nel periodo." id="motivo"
          table={{ head: ['Motivo', 'Permessi', 'Ore'], rows: ps.byReason.map((r) => [REASON_LABEL[r.reason], r.count, dur(r.minutes)]) }} empty={ps.byReason.length ? undefined : 'Nessun permesso in questo periodo.'}
        >
          <HBars ariaLabel="Ore di permesso per motivo" items={ps.byReason.map((r) => ({ key: r.reason, label: REASON_LABEL[r.reason], value: r.minutes, text: `${dur(r.minutes)} · ${plural(r.count, 'permesso', 'permessi')}` }))} />
          {ps.allowance ? (
            <div style={{ marginTop: 18 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>Monte permessi {ps.allowance.year}</span><span className="num"><b>{dur(ps.allowance.used)}</b> di {dur(ps.allowance.limit)}</span></div>
              <div className={`meter ${ps.allowance.left < 0 ? 'over' : ''}`} style={{ marginTop: 6 }} role="progressbar" aria-label="Monte permessi usato" aria-valuemin={0} aria-valuemax={ps.allowance.limit} aria-valuenow={ps.allowance.used}><i style={{ width: `${Math.min(100, (ps.allowance.used / Math.max(1, ps.allowance.limit)) * 100)}%` }} /></div>
              <p className={ps.allowance.left < 0 ? 'err' : 'muted'} style={{ fontSize: 13.5, marginTop: 6 }}>{ps.allowance.left >= 0 ? `Restano ${dur(ps.allowance.left)}.` : `Superato di ${dur(-ps.allowance.left)}.`}</p>
            </div>
          ) : null}
        </ChartCard>
      </div>
      <ChartCard
        title="Ferie e malattia" subtitle={`Giorni di assenza per ${grainName}.`} id="assenze"
        legend={[{ label: 'Ferie', color: C.vacation }, { label: 'Malattia', color: C.sick }]}
        table={{ head: [capFirst(grainName), 'Ferie', 'Malattia'], rows: bks.map((b) => [b.label, b.vacation, b.sick]) }} empty={bks.some((b) => b.vacation + b.sick > 0) ? undefined : 'Nessuna giornata di ferie o malattia in questo periodo.'}
      >
        <BarChart data={absData} series={[{ key: 'v', name: 'Ferie', color: C.vacation }, { key: 's', name: 'Malattia', color: C.sick }]} stacked unit="count" format={(v) => plural(v, 'giorno', 'giorni')} height={200} ariaLabel={`Giorni di ferie e malattia per ${grainName}`} />
      </ChartCard>
    </>
  );
}

