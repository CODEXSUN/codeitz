import {createPlatformDirectBrowserClient} from '@workspace/sdk/platform-direct-browser';
import {platformActivityHeaders, platformTabSelector} from '@workspace/sdk/platform-browser-client';
const client=createPlatformDirectBrowserClient('codeitz');
export const platform=client;
let enabled=false;export function enablePlatform(value:boolean){enabled=value;}
export const appFetch:typeof fetch=(input,options)=>enabled&&typeof input==='string'&&input.startsWith('/api/v1/')?platform.fetch(input,options):fetch(input,options);

/** Keep the shared launcher on this app's selected, verified browser context. */
export async function fetchPlatformCatalog(url: string, init: RequestInit): Promise<Response> {
  const destination = new URL(url, window.location.origin);
  if (destination.origin !== window.location.origin || destination.username || destination.password
    || destination.pathname !== '/platform-api/v1/landing' || destination.search || destination.hash
    || (init.method ?? 'GET').toUpperCase() !== 'GET' || init.body != null) {
    throw new Error('Use the same-origin Platform application catalogue.');
  }
  const headers = new Headers(init.headers);
  for (const name of ['authorization', 'cookie', 'x-platform-grant', 'x-tenant-id', 'x-csrf-token', 'x-platform-activity']) headers.delete(name);
  headers.set('x-platform-tab', await platformTabSelector('codeitz'));
  for (const [name, value] of Object.entries(platformActivityHeaders())) headers.set(name, value);
  return fetch(destination.href, { ...init, method: 'GET', headers, credentials: 'same-origin', redirect: 'error' });
}
