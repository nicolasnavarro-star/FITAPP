import { useSyncExternalStore } from 'react';

/**
 * Enrutador mínimo basado en el hash de la URL.
 * - Las pestañas principales reemplazan la entrada actual del historial.
 * - Las pantallas secundarias se apilan, así el botón "atrás" de Android funciona de forma natural.
 */

export interface Route {
  path: string;
  query: URLSearchParams;
}

const listeners = new Set<() => void>();
let depth = 0;
let snapshot = '';

function readHash(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

function emit() {
  snapshot = readHash();
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  snapshot = readHash();
  depth = (window.history.state as { depth?: number } | null)?.depth ?? 0;
  window.addEventListener('popstate', (e) => {
    depth = (e.state as { depth?: number } | null)?.depth ?? 0;
    emit();
  });
}

/** Abre una pantalla secundaria (apila en el historial). */
export function push(path: string) {
  depth += 1;
  window.history.pushState({ depth }, '', `#${path}`);
  emit();
}

/** Cambia la pantalla actual sin apilar (pestañas o reemplazos). */
export function replace(path: string) {
  window.history.replaceState({ depth }, '', `#${path}`);
  emit();
}

export function back() {
  if (depth > 0) window.history.back();
  else replace('/');
}

/** Vuelve a la pestaña desde la que se abrieron las pantallas secundarias. */
export function backToRoot() {
  if (depth > 0) window.history.go(-depth);
  else replace('/');
}

export function canGoBack(): boolean {
  return depth > 0;
}

function parse(hash: string): Route {
  const [path, qs = ''] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

let cached: { hash: string; route: Route } = { hash: '', route: parse('/') };

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
  if (cached.hash !== hash) cached = { hash, route: parse(hash) };
  return cached.route;
}
