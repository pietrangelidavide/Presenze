export interface HBarItem { key: string; label: string; value: number; text: string }

/** Barre orizzontali con etichetta e valore sempre visibili (poche voci, ordinate). */
export function HBars({ items, ariaLabel }: { items: HBarItem[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars" role="list" aria-label={ariaLabel}>
      {items.map((it) => (
        <div className="hbar" role="listitem" key={it.key}>
          <span>{it.label}</span>
          <span className="track" aria-hidden="true"><i style={{ width: `${(it.value / max) * 100}%` }} /></span>
          <span className="val">{it.text}</span>
        </div>
      ))}
    </div>
  );
}
