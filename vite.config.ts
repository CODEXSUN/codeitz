import { drawingDependencyAudit } from './scripts/drawing-dependency-audit.ts';
import { developmentWebServer } from '@workspace/framework';
import { createThemeInitScript } from '@workspace/ui/design-system/bootstrap';
import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: developmentWebServer({ root: fileURLToPath(new URL('./', import.meta.url)), prefix: 'CODEITZ', defaultPort: 4305, defaultWebPort: 4300 }),
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  plugins: [drawingDependencyAudit(), { name: 'shared-theme-init', transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', children: createThemeInitScript('codeitz.ui.preferences', { migrateToSilver: true }), injectTo: 'head-prepend' }] } }, tailwindcss(), { name: 'local-excalidraw-fonts', closeBundle() { cpSync(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url), new URL('./dist/web/excalidraw-assets/fonts', import.meta.url), { recursive: true }); } }],
  build: { outDir: fileURLToPath(new URL('./dist/web', import.meta.url)), emptyOutDir: true },
});
