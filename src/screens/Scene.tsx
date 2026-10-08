// Scena della pagina iniziale: le ore di una settimana come colonne isometriche su un piano,
// con un orologio di vetro sospeso sopra il giovedì. È disegnata a mano in SVG, quindi resta nitida
// a qualsiasi dimensione e densità di schermo.
import type { ReactElement } from 'react';

const U = 48;                // lato dell'unità isometrica, in unità del disegno
const C = Math.cos(Math.PI / 6);
const S = 0.5;

type V3 = [number, number, number];
/** Punto dello spazio (x verso destra-giù, y verso sinistra-giù, z in alto) → punto del disegno. */
const P = ([x, y, z]: V3): [number, number] => [(x - y) * C * U, (x + y) * S * U - z * U];
const pts = (...ps: V3[]): string => ps.map((p) => P(p).map((n) => n.toFixed(1)).join(',')).join(' ');
/** Trasformazione che appoggia un disegno piatto (x, y) sul piano orizzontale. */
const FLAT = `matrix(${(C * U).toFixed(3)} ${(S * U).toFixed(3)} ${(-C * U).toFixed(3)} ${(S * U).toFixed(3)} 0 0)`;

interface Tone { top: string; left: string; right: string; hi: string }
const BLUE: Tone = { top: 'url(#sc-bt)', left: 'url(#sc-bl)', right: 'url(#sc-br)', hi: 'rgba(255,255,255,0.55)' };
const GOLD: Tone = { top: 'url(#sc-yt)', left: 'url(#sc-yl)', right: 'url(#sc-yr)', hi: 'rgba(255,255,255,0.8)' };
const SLAB: Tone = { top: 'url(#sc-st)', left: 'url(#sc-sl)', right: 'url(#sc-sr)', hi: 'rgba(255,255,255,0.28)' };

function Prism({ x, y, w, d, z0, h, tone, round }: { x: number; y: number; w: number; d: number; z0: number; h: number; tone: Tone; round: number }) {
  const x1 = x + w, y1 = y + d, z1 = z0 + h;
  const k = { strokeLinejoin: 'round' as const, strokeWidth: round };
  return (
    <g>
      <polygon points={pts([x1, y, z0], [x1, y1, z0], [x1, y1, z1], [x1, y, z1])} fill={tone.right} stroke={tone.right} {...k} />
      <polygon points={pts([x, y1, z0], [x1, y1, z0], [x1, y1, z1], [x, y1, z1])} fill={tone.left} stroke={tone.left} {...k} />
      <polygon points={pts([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1])} fill={tone.top} stroke={tone.top} {...k} />
      {/* bordo luminoso sugli spigoli rivolti alla luce */}
      <polyline points={pts([x, y1, z1], [x1, y1, z1], [x1, y, z1])} fill="none" stroke={tone.hi} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={P([x1, y1, z0])[0]} y1={P([x1, y1, z0])[1]} x2={P([x1, y1, z1])[0]} y2={P([x1, y1, z1])[1]} stroke="rgba(255,255,255,0.22)" strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

// Giorni della settimana: ore nette (7h30 da lunedì a giovedì, 6h il venerdì) e iniziale. Il giovedì è in giallo.
const DAYS = [
  { l: 'L', hours: 7.5, extra: 0.2 },
  { l: 'M', hours: 7.5, extra: 0.4 },
  { l: 'M', hours: 7.5, extra: 0 },
  { l: 'G', hours: 7.5, extra: 0, today: true },
  { l: 'V', hours: 6, extra: 0 },
];
const HOUR = 0.3;             // altezza di un'ora, in unità
const X0 = 0.5, STEP = 1.1, W = 0.8, Y0 = 0.9, D = 0.8;
const SLAB_W = 6.2, SLAB_D = 2.8, SLAB_T = 0.55;
const CLOCK: V3 = [X0 + 3 * STEP + W / 2, Y0 + D / 2, 4.3];

export function Scene({ className = 'scene' }: { className?: string }) {
  const [cx, cy] = P(CLOCK);
  const R = 1.05;
  const a = Math.SQRT2 * C * U * R, b = Math.SQRT2 * S * U * R, T = 0.17 * U;
  const thursdayTop = P([CLOCK[0], CLOCK[1], 7.5 * HOUR]);
  const grid: ReactElement[] = [];
  for (let i = 1; i < SLAB_W; i++) grid.push(<polyline key={`gx${i}`} points={pts([i, 0, 0], [i, SLAB_D, 0])} />);
  for (let j = 1; j < SLAB_D; j++) grid.push(<polyline key={`gy${j}`} points={pts([0, j, 0], [SLAB_W, j, 0])} />);

  return (
    <svg
      className={className}
      viewBox={`${-3.1 * U} ${-3.2 * U} ${9.1 * U} ${9.0 * U}`}
      role="img"
      aria-label="Illustrazione: una colonna per ogni giorno della settimana, alta quanto le ore lavorate, e un orologio sospeso sopra il giovedì"
    >
      <defs>
        <linearGradient id="sc-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5563B8" /><stop offset="1" stopColor="#323E88" /></linearGradient>
        <linearGradient id="sc-sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#323D82" /><stop offset="1" stopColor="#212A62" /></linearGradient>
        <linearGradient id="sc-sr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#252E6B" /><stop offset="1" stopColor="#171D4A" /></linearGradient>
        <linearGradient id="sc-bt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9CC7FA" /><stop offset="1" stopColor="#6FA6EE" /></linearGradient>
        <linearGradient id="sc-bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4C94E6" /><stop offset="1" stopColor="#2B6CC4" /></linearGradient>
        <linearGradient id="sc-br" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A67B9" /><stop offset="1" stopColor="#1A4585" /></linearGradient>
        <linearGradient id="sc-yt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF9A6" /><stop offset="1" stopColor="#F8EC63" /></linearGradient>
        <linearGradient id="sc-yl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F6EA55" /><stop offset="1" stopColor="#E2D22E" /></linearGradient>
        <linearGradient id="sc-yr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CDBE2E" /><stop offset="1" stopColor="#A89B1D" /></linearGradient>
        <linearGradient id="sc-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF7A0" /><stop offset="0.55" stopColor="#F1E54C" /><stop offset="1" stopColor="#D5C73A" /></linearGradient>
        <linearGradient id="sc-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E3D53A" /><stop offset="0.6" stopColor="#B9AA21" /><stop offset="1" stopColor="#8F8315" /></linearGradient>
        <radialGradient id="sc-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#F1E54C" stopOpacity="0.34" /><stop offset="0.55" stopColor="#F1E54C" stopOpacity="0.08" /><stop offset="1" stopColor="#F1E54C" stopOpacity="0" /></radialGradient>
        <radialGradient id="sc-floor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#05071A" stopOpacity="0.55" /><stop offset="1" stopColor="#05071A" stopOpacity="0" /></radialGradient>
        <filter id="sc-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>

      {/* alone e ombra a terra */}
      <circle cx={cx} cy={cy + 20} r={230} fill="url(#sc-glow)" />
      <ellipse cx={P([SLAB_W / 2, SLAB_D / 2, -SLAB_T])[0] + 8} cy={P([SLAB_W / 2, SLAB_D / 2, -SLAB_T])[1] + 34} rx={300} ry={92} fill="url(#sc-floor)" />

      {/* piano */}
      <Prism x={0} y={0} w={SLAB_W} d={SLAB_D} z0={-SLAB_T} h={SLAB_T} tone={SLAB} round={9} />
      <g fill="none" stroke="rgba(255,255,255,0.075)" strokeWidth={1}>{grid}</g>

      {/* ombre delle colonne e colonne, da dietro in avanti */}
      {DAYS.map((d, i) => {
        const x = X0 + i * STEP, h = d.hours * HOUR + d.extra;
        const reach = 0.22 * h;
        return <polygon key={`s${i}`} points={pts([x + W, Y0 + 0.14, 0], [x + W + reach, Y0 + 0.14, 0], [x + W + reach, Y0 + D + 0.14, 0], [x + W, Y0 + D + 0.14, 0])} fill="#070A24" opacity={0.34} filter="url(#sc-soft)" />;
      })}
      {DAYS.map((d, i) => (
        <Prism key={`p${i}`} x={X0 + i * STEP} y={Y0} w={W} d={D} z0={0} h={d.hours * HOUR + d.extra} tone={d.today ? GOLD : BLUE} round={3} />
      ))}

      {/* iniziali dei giorni, appoggiate sul piano */}
      {DAYS.map((d, i) => {
        const [tx, ty] = P([X0 + i * STEP + W / 2, 2.05, 0]);
        return (
          <text key={`t${i}`} transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) ${FLAT}`} textAnchor="middle" fontSize={0.5} fontWeight={750} fill={d.today ? '#F1E54C' : 'rgba(255,255,255,0.7)'} style={{ fontFamily: 'inherit' }}>{d.l}</text>
        );
      })}

      {/* guida dal giovedì all'orologio */}
      <line x1={thursdayTop[0]} y1={thursdayTop[1] - 6} x2={cx} y2={cy + b + T + 8} stroke="#F1E54C" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" opacity={0.85} />
      <ellipse cx={thursdayTop[0]} cy={thursdayTop[1]} rx={9} ry={5.2} fill="#FFFDE0" opacity={0.95} />

      {/* orologio di vetro sospeso */}
      <g className="scene-float">
        <ellipse cx={cx} cy={cy + T} rx={a} ry={b} fill="#8F8315" />
        <rect x={cx - a} y={cy} width={2 * a} height={T} fill="url(#sc-side)" />
        <g transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) ${FLAT}`}>
          <circle r={R} fill="url(#sc-rim)" />
          <circle r={R * 0.85} fill="#F7F9FF" />
          <circle r={R * 0.85} fill="none" stroke="#B9C4E8" strokeWidth={0.025} />
          <g transform="rotate(-45)">
            {Array.from({ length: 12 }, (_, i) => {
              const major = i % 3 === 0;
              return <line key={i} x1={0} y1={-R * (major ? 0.6 : 0.68)} x2={0} y2={-R * 0.77} transform={`rotate(${i * 30})`} stroke="#1E2350" strokeWidth={major ? 0.085 : 0.05} strokeLinecap="round" />;
            })}
            <line x1={0} y1={0} x2={0} y2={-R * 0.4} transform="rotate(255)" stroke="#1E2350" strokeWidth={0.12} strokeLinecap="round" />
            <line x1={0} y1={0} x2={0} y2={-R * 0.62} transform="rotate(180)" stroke="#1E2350" strokeWidth={0.08} strokeLinecap="round" />
            <line x1={0} y1={R * 0.14} x2={0} y2={-R * 0.7} transform="rotate(40)" stroke="#0060AE" strokeWidth={0.035} strokeLinecap="round" />
            <circle r={0.09} fill="#F1E54C" stroke="#1E2350" strokeWidth={0.035} />
          </g>
          {/* riflesso sul vetro */}
          <path d={`M${-R * 0.8},${-R * 0.1} A${R * 0.8},${R * 0.8} 0 0 1 ${-R * 0.1},${-R * 0.8} Q${-R * 0.3},${-R * 0.3} ${-R * 0.8},${-R * 0.1}Z`} fill="#fff" opacity={0.5} />
        </g>
      </g>
    </svg>
  );
}
