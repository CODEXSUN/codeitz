import { sharedUiResolve } from '../scripts/shared-ui-vite.ts';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

import { createThemeInitScript } from '@workspace/ui/design-system/bootstrap';

export default defineConfig({
  plugins: [tailwindcss(), {
    name: 'codeitz-desktop-theme',
    transformIndexHtml: () => [{ tag: 'script', children: createThemeInitScript('codeitz.desktop.appearance'), injectTo: 'head-prepend' }],
  }],
  resolve: sharedUiResolve,
  clearScreen: false,
  server: { host: '127.0.0.1', port: 43406, strictPort: true },
  build: { target: 'es2022' },
});
