import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllowedHosts } from './shared/viteHosts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb4sEngineRoot = path.resolve(__dirname, '.cache/wb4s-src/src');

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
        '@nas4usb/rhwp': path.resolve(__dirname, 'lib/rhwp'),
        '@wb4s-engine': wb4sEngineRoot,
        stream: path.resolve(__dirname, 'src/lib/shims/stream.js'),
        fs: path.resolve(__dirname, 'src/lib/shims/fs.js'),
        // Force a single ProseMirror/TipTap instance (instanceof checks break otherwise).
        '@tiptap/core': path.resolve(__dirname, 'node_modules/@tiptap/core'),
        '@tiptap/pm': path.resolve(__dirname, 'node_modules/@tiptap/pm'),
        'prosemirror-model': path.resolve(__dirname, 'node_modules/prosemirror-model'),
        'prosemirror-state': path.resolve(__dirname, 'node_modules/prosemirror-state'),
        'prosemirror-view': path.resolve(__dirname, 'node_modules/prosemirror-view'),
        'prosemirror-transform': path.resolve(__dirname, 'node_modules/prosemirror-transform'),
        'prosemirror-tables': path.resolve(__dirname, 'node_modules/prosemirror-tables'),
        'y-prosemirror': path.resolve(__dirname, 'node_modules/y-prosemirror'),
      },
      // Keep a single ProseMirror/TipTap instance (instanceof checks break otherwise).
      dedupe: [
        'yjs',
        'react',
        'react-dom',
        '@tiptap/core',
        '@tiptap/react',
        'y-prosemirror',
        'prosemirror-state',
        'prosemirror-model',
        'prosemirror-view',
        'prosemirror-transform',
        'prosemirror-tables',
      ],
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
        'y-prosemirror',
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-transform',
        'prosemirror-tables',
        '@tiptap/core',
        '@tiptap/react',
        '@tiptap/starter-kit',
        '@tiptap/extension-collaboration',
        '@tiptap/extension-table',
        '@tiptap/y-tiptap',
        'tippy.js',
      ],
      // @tiptap/pm has only subpath exports (./state, ./model, …) — no "." entry.
      // Including the bare package in optimizeDeps makes Vite fail on startup.
      exclude: ['@tiptap/pm'],
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
          path.resolve(__dirname, 'node_modules'),
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
