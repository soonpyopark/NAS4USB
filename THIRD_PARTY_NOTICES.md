# Third-Party Notices

NAS4USB itself is licensed under the **MIT License**
(see [`LICENSE`](LICENSE)). This document lists open-source components that
NAS4USB uses or ships with. Each component remains under its own license.

Versions below reflect the dependency tree at the time this file was last
updated (NAS4USB **1.0.5**). Exact resolved versions are in `package-lock.json`.

---

## Runtime / editor stacks (major)

| Component | Version (approx.) | License | Project |
|-----------|-------------------|---------|---------|
| Electron | 33.x | MIT (+ Chromium) | https://github.com/electron/electron |
| Chromium (via Electron) | (Electron bundle) | See `LICENSES.chromium.html` in builds | — |
| React / React DOM | 18.3.x | MIT | https://github.com/facebook/react |
| Yjs | 13.x | MIT | https://github.com/yjs/yjs |
| y-websocket | 2.x | MIT | https://github.com/yjs/y-websocket |
| y-prosemirror | 1.x | MIT | https://github.com/yjs/y-prosemirror |
| TipTap | 3.29.x | MIT | https://github.com/ueberdosis/tiptap |
| ProseMirror (via TipTap / `@tiptap/pm`) | — | MIT | https://prosemirror.net |
| FortuneSheet (`@fortune-sheet/react`) | 1.0.4 | MIT | https://github.com/ruilisi/fortune-sheet |
| rhwp (`@rhwp/core`, `@rhwp/editor`) | 0.8.2 | MIT | https://github.com/edwardkim/rhwp |
| WhiteBoard4Share | 1.0.6 | AGPL-3.0-only | https://github.com/soonpyopark/WhiteBoard4Share |
| PDF.js (`pdfjs-dist`) | 6.x | Apache-2.0 | https://github.com/mozilla/pdf.js |
| SheetJS Community Edition (`xlsx`) | 0.18.5 | Apache-2.0 | https://sheetjs.com/ |
| xlsx-js-style | 1.2.0 | Apache-2.0 | https://github.com/gitbrent/xlsx-js-style |
| JSZip | 3.10.x | MIT OR GPL-3.0-or-later | https://github.com/Stuk/jszip |
| KaTeX | 0.16.x | MIT | https://katex.org |
| lowlight | 3.x | MIT | https://github.com/wooorm/lowlight |
| tippy.js | 6.x | MIT | https://atomiks.github.io/tippyjs/ |
| ws | 8.x | MIT | https://github.com/websockets/ws |
| Source Han Serif K (fonts in rhwp-studio) | — | SIL OFL 1.1 | `public/rhwp-studio/fonts/SourceHanSerifK-OFL.txt` |

Bundled editor outputs (`public/rhwp-studio/`, `public/rhwp-core/`,
`public/wb4s-editor/`) are produced from the upstream projects above during
`npm run build`. Core pins are recorded in `lib/cores-manifest.json`.

---

## Direct npm dependencies (`package.json`)

### Production (`dependencies`)

| Package | License |
|---------|---------|
| `@fortune-sheet/react` | MIT |
| `@rhwp/core` | MIT |
| `@rhwp/editor` | MIT |
| `@tiptap/*` (core, react, starter-kit, extensions, …) | MIT (most packages); see each package for details |
| `@tiptap/y-tiptap` | MIT |
| `jszip` | MIT OR GPL-3.0-or-later |
| `katex` | MIT |
| `lowlight` | MIT |
| `prosemirror-tables` | MIT |
| `react` / `react-dom` | MIT |
| `tippy.js` | MIT |
| `ws` | MIT |
| `xlsx` | Apache-2.0 |
| `xlsx-js-style` | Apache-2.0 |
| `y-prosemirror` | MIT |
| `y-websocket` | MIT |
| `yjs` | MIT |

Transitive runtime libraries of note (not always listed in `package.json`
but used by the app):

| Package | License | Notes |
|---------|---------|-------|
| `pdfjs-dist` | Apache-2.0 | PDF viewer / content search |

### Development (`devDependencies`)

| Package | License |
|---------|---------|
| `@vitejs/plugin-react` | MIT |
| `@xmldom/xmldom` | MIT |
| `autoprefixer` | MIT |
| `concurrently` | MIT |
| `electron` | MIT |
| `electron-builder` | MIT |
| `png-to-ico` | MIT |
| `postcss` | MIT |
| `rcedit` | MIT |
| `sharp` | Apache-2.0 |
| `tailwindcss` | MIT |
| `vite` | MIT |
| `wait-on` | MIT |

---

## Notices

- MIT applies to **NAS4USB first-party source** (application code in this
  repository). It does **not** relicense third-party components.
- When you distribute binaries, keep `LICENSE`, this file, and (for Electron
  builds) `LICENSE.electron.txt` / `LICENSES.chromium.html` available to users.
