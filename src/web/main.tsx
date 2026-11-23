import { PlatformGate } from './platform';
import { GlobalLoaderProvider } from '@workspace/ui/components/global-loader';
import { appBrand } from './app-shell';
import { navigate } from './navigation';
import { parseLocation } from '../../contracts/navigation';
import { DesignSystemProvider } from '@workspace/ui';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Application } from './app';
import { TaskStreamProvider } from './modules/task-runner/use-tasks';
import '../styles/index.css';

(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element).closest?.('a'); if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href); if (url.origin !== window.location.origin || parseLocation(url.href).page === 'missing' || url.pathname.startsWith('/api/')) return;
  event.preventDefault(); navigate(url.pathname + url.search);
});

createRoot(document.getElementById('root')!).render(<React.StrictMode><DesignSystemProvider migrateToSilver storageKey="codeitz.ui.preferences"><GlobalLoaderProvider brand={appBrand}><PlatformGate><TaskStreamProvider><Application /></TaskStreamProvider></PlatformGate></GlobalLoaderProvider></DesignSystemProvider></React.StrictMode>);
