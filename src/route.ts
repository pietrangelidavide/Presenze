// Pagina corrente. Si legge e si aggiorna anche dall'indirizzo (#/dashboard), ma funziona
// anche quando il browser o la finestra che ospita l'app non permette di cambiarlo.
import { useSyncExternalStore } from 'react';

export const ROUTE_IDS = ['oggi', 'calendario', 'dashboard', 'permessi', 'team', 'impostazioni', 'profilo'] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

function fromHash(): RouteId {
  try {
    const h = window.location.hash.replace(/^#\/?/, '');
    return (ROUTE_IDS.find((r) => r === h) ?? 'oggi') as RouteId;
  } catch { return 'oggi'; }
}

let current: RouteId = typeof window === 'undefined' ? 'oggi' : fromHash();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = fromHash();
    if (next === current) return;
    current = next;
    window.scrollTo({ top: 0 });
    emit();
  });
}

export function go(id: RouteId): void {
  if (id === current) return;
  current = id;
  try { window.location.hash = `/${id}`; } catch { /* l'indirizzo non si può cambiare: la pagina cambia lo stesso */ }
  window.scrollTo({ top: 0 });
  emit();
}

/** Click su un link interno: cambia pagina senza ricaricare, ma lascia fare al browser con Ctrl/Cmd-click. */
export function onLinkClick(id: RouteId) {
  return (e: { preventDefault(): void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number }) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(id);
  };
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useRoute = (): RouteId => useSyncExternalStore(subscribe, () => current, () => 'oggi');
