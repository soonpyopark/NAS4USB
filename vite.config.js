import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  publicDir: path.resolve(__dirname, 'public'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@educowork/rhwp': path.resolve(__dirname, 'lib/rhwp'),
      '@educowork/wb4s': path.resolve(__dirname, 'lib/wb4s'),
    },
    dedupe: ['yjs'],
  },
  optimizeDeps: {
    include: ['@rhwp/core', '@rhwp/editor', 'yjs', 'y-websocket'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3008,
    strictPort: true,
  },
});
