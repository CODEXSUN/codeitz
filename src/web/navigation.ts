import { useSyncExternalStore } from 'react';
import { parseLocation } from '../../contracts/navigation';
const event = 'codeitz:navigate';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener); window.addEventListener(event, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(event, listener); };
}
export function navigate(url: string, replace = false) {
  if (url === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new Event(event));
}
export function useLocation() {
  const url = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  return parseLocation(url);
}
export function setQuery(values: Record<string, string | undefined>, replace = false) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(values)) { if (value) url.searchParams.set(name, value); else url.searchParams.delete(name); }
  navigate(url.pathname + url.search, replace);
}
