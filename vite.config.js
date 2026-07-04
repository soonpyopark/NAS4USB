import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb4sEngineRoot = path.resolve(__dirname, '.cache/wb4s-src/src');

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  publicDir: path.resolve(__dirname, 'public'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@educowork/rhwp': path.resolve(__dirname, 'lib/rhwp'),
      '@wb4s-engine': wb4sEngineRoot,
    },
    dedupe: ['yjs', 'react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@rhwp/core',
      '@rhwp/editor',
      'yjs',
      'y-websocket',
      '@fortune-sheet/react',
      'xlsx',
      'xlsx-js-style',
    ],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3008,
    strictPort: true,
    fs: {
      // Custom allow replaces Vite defaults — include app root + external import paths.
      allow: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'lib'),
        path.resolve(__dirname, 'public'),
        path.resolve(__dirname, '.cache'),
        path.resolve(__dirname, 'vendor'),
      ],
    },
  },
});
