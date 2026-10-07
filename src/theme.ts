import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'presenze-tema';
const COLORS = { light: '#FAF8F3', dark: '#070706' };

function read(): ThemePref {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}

let current: ThemePref = read();
const listeners = new Set<() => void>();

export function applyThemePref(p: ThemePref): void {
  const root = document.documentElement;
  if (p === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.auto) m.dataset.auto = m.content;
    m.content = p === 'auto' ? (m.dataset.auto as string) : COLORS[p];
  });
}

export function setThemePref(p: ThemePref): void {
  current = p;
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* non fa niente */ }
  applyThemePref(p);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, () => current, () => 'auto' as ThemePref);
  return [pref, setThemePref];
}

/** Da chiamare una volta all'avvio. */
export const initTheme = (): void => applyThemePref(current);
