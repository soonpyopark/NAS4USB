import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllowedHosts } from './shared/viteHosts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb4sEngineRoot = path.resolve(__dirname, 'vendor/whiteboard4share/src');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const port = Number(env.PORT) || 3008;
  const allowedHosts = parseAllowedHosts(env.ALLOWED_HOSTS);

  return {
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
      port,
      strictPort: true,
      allowedHosts,
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
    preview: {
      port,
      strictPort: true,
      allowedHosts,
    },
  };
});
