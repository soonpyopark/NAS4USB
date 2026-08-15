import { innerExtensionOf, isSecFileName } from './filePassword/secPaths.js';
import {
  ARCHIVE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  EPUB_EXTENSIONS,
  HTML_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './media/mediaTypes.js';

/** Code / config files opened in the CodeMirror text editor (syntax highlight by ext). */
export const CODE_TEXT_EXTENSIONS = [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'tsx',
  'json',
  'jsonc',
  'css',
  'scss',
  'less',
  'xml',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'hh',
  'cs',
  'php',
  'swift',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'yml',
  'yaml',
  'toml',
  'ini',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'mdx',
];

export const OPENABLE_EXTENSIONS = {
  hwpx: 'hwpx',
  wb4s: 'wb4s',
  xlsx: 'xlsx',
  xls: 'xlsx',
  csv: 'xlsx',
  tsv: 'xlsx',
  txt: 'text',
  md: 'text',
  tiptap: 'tiptap',
  ...Object.fromEntries(CODE_TEXT_EXTENSIONS.map((ext) => [ext, 'text'])),
  ...Object.fromEntries(AUDIO_EXTENSIONS.map((ext) => [ext, 'audio'])),
  ...Object.fromEntries(VIDEO_EXTENSIONS.map((ext) => [ext, 'video'])),
  ...Object.fromEntries(IMAGE_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(PDF_EXTENSIONS.map((ext) => [ext, 'pdf'])),
  ...Object.fromEntries(ARCHIVE_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(EPUB_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(HTML_EXTENSIONS.map((ext) => [ext, 'html'])),
};

/**
 * @param {string | null | undefined} extension
 * @returns {string | undefined}
 */
export function getFileViewerType(extension) {
  const ext = String(extension ?? '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  if (!ext) return undefined;
  if (ext === 'sec') return undefined;
  return OPENABLE_EXTENSIONS[ext];
}

/**
 * @param {string | null | undefined} fileNameOrPath
 */
export function getFileViewerTypeFromName(fileNameOrPath) {
  const name = String(fileNameOrPath ?? '');
  if (isSecFileName(name)) return getFileViewerType(innerExtensionOf(name));
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const index = base.lastIndexOf('.');
  return getFileViewerType(index > 0 ? base.slice(index + 1) : '');
}
