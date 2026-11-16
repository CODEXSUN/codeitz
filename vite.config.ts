import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  plugins: [tailwindcss()],
  build: { outDir: fileURLToPath(new URL('./dist/web', import.meta.url)), emptyOutDir: true },
});
